import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàâãä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôõö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/[ç]/g, "c")
    .replace(/[ñ]/g, "n")
    .trim();
}

async function logSync(
  operation: string,
  eventType: string | null,
  rdId: string | null,
  liveId: string | null,
  status: string,
  errorMessage: string | null,
  payload: unknown,
) {
  try {
    await admin.from("rd_sync_log").insert({
      operation,
      event_type: eventType,
      rd_id: rdId,
      live_id: liveId,
      status,
      error_message: errorMessage,
      payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
    });
  } catch (e) {
    console.error("logSync failed:", e);
  }
}

function mapStatus(deal: Record<string, unknown>): string {
  if (deal.win === true) return "fechado";
  if (deal.win === false) return "cancelado";
  if (deal.hold === true) return "pausado";
  return "aberto";
}

// Busca auth.users id pelo email via REST API
async function getAuthIdByEmail(email: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
      {
        signal: controller.signal,
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json() as { users?: Array<{ id: string; email?: string }> };
    const found = (body.users ?? []).find((u) => u.email === email);
    return found?.id ?? null;
  } catch {
    return null;
  }
}

async function resolvePipelineAndStage(
  stageName: string | null,
): Promise<{ pipelineId: string | null; stageKey: string | null }> {
  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .ilike("name", "%vendas%")
    .limit(1)
    .maybeSingle();

  if (!pipeline) {
    const { data: fallback } = await admin
      .from("pipelines")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!fallback) return { pipelineId: null, stageKey: null };
    return { pipelineId: fallback.id, stageKey: null };
  }

  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("key, label")
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true });

  const firstKey = stages?.[0]?.key ?? null;

  if (stageName) {
    const norm = normalizeStr(stageName);
    const match = (stages ?? []).find((s) => normalizeStr(s.label) === norm);
    if (match) return { pipelineId: pipeline.id, stageKey: match.key };
  }

  return { pipelineId: pipeline.id, stageKey: firstKey };
}

async function resolveOrCreateClient(
  contacts: Record<string, unknown>[],
): Promise<string | null> {
  for (const contact of contacts) {
    const emails = (contact.emails as { email: string }[] | undefined) ?? [];
    const phones = (contact.phones as { phone: string; whatsapp_url_web?: string }[] | undefined) ?? [];
    const email = emails[0]?.email ?? null;
    const rawPhone = phones[0]?.phone ?? null;
    const phone = rawPhone ? rawPhone.replace(/\D/g, "") : null;
    const whatsapp = phones.find((p) => p.whatsapp_url_web)?.phone ?? null;

    if (email) {
      const { data } = await admin.from("clients").select("id").eq("email", email).limit(1).maybeSingle();
      if (data) return data.id;
    }
    if (phone && phone.length >= 8) {
      const { data } = await admin
        .from("clients")
        .select("id")
        .ilike("phone", `%${phone.slice(-8)}`)
        .limit(1)
        .maybeSingle();
      if (data) return data.id;
    }

    const { data: newClient } = await admin
      .from("clients")
      .upsert(
        {
          name: (contact.name as string) || "Contato RD Station",
          email: email ?? null,
          phone: phone ?? null,
          whatsapp: whatsapp ?? null,
          rd_contact_id: (contact.id as string) ?? null,
          status: "ativo",
        },
        { onConflict: "rd_contact_id" },
      )
      .select("id")
      .maybeSingle();

    if (newClient) return newClient.id;
  }
  return null;
}

async function upsertDeal(
  deal: Record<string, unknown>,
  eventName: string,
  rawPayload: unknown,
): Promise<void> {
  // Webhook payload usa deal.id, import usa deal._id
  const rdDealId = (deal.id ?? deal._id) as string;
  if (!rdDealId) {
    await logSync("webhook", eventName, null, null, "error", "no_deal_id", rawPayload);
    return;
  }

  const title = (deal.name as string) || "Negociação sem título";
  const amountTotal = Number(deal.amount_total ?? 0);
  const stageName = (deal.deal_stage as { name?: string } | null)?.name ?? null;
  const userEmail = (deal.user as { email?: string } | null)?.email ?? null;
  const contacts = (deal.contacts as Record<string, unknown>[] | undefined) ?? [];

  const { pipelineId, stageKey } = await resolvePipelineAndStage(stageName);

  let assignedTo: string | null = null;
  if (userEmail) {
    assignedTo = await getAuthIdByEmail(userEmail);
    if (!assignedTo) {
      console.warn(`rd-webhook: user not found in auth.users: ${userEmail}`);
    }
  }

  const clientId = await resolveOrCreateClient(contacts);
  const status = mapStatus(deal);

  const upsertPayload: Record<string, unknown> = {
    rd_deal_id: rdDealId,
    title,
    ticket_type: "pos_venda",
    status,
    estimated_value: amountTotal,
    pipeline_id: pipelineId,
    pipeline_stage: stageKey,
    assigned_to: assignedTo,
    ticket_number: `RD-${rdDealId}`,
    origin: "rd_station",
    channel: "rd_station",
  };

  if (clientId) upsertPayload.client_id = clientId;
  if (deal.created_at) upsertPayload.created_at = deal.created_at as string;

  let { data: ticket, error } = await admin
    .from("tickets")
    .upsert(upsertPayload, { onConflict: "rd_deal_id" })
    .select("id")
    .maybeSingle();

  // FK violation on assigned_to → retry without it
  if (error?.message?.includes("assigned_to_fkey")) {
    const result = await admin
      .from("tickets")
      .upsert({ ...upsertPayload, assigned_to: null }, { onConflict: "rd_deal_id" })
      .select("id")
      .maybeSingle();
    ticket = result.data;
    error = result.error ?? null;
  }

  if (error) {
    await logSync("webhook", eventName, rdDealId, null, "error", error.message, rawPayload);
    console.error(`rd-webhook upsert failed for ${rdDealId}:`, error.message);
  } else {
    await logSync("webhook", eventName, rdDealId, ticket?.id ?? null, "success", null, null);
    console.log(`rd-webhook: deal ${rdDealId} upserted → ticket ${ticket?.id}`);
  }
}

Deno.serve(async (req) => {
  const okResponse = () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return okResponse();

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return okResponse();
    }

    const eventName: string = (body.event_name as string) || (body.event_type as string) || "";
    console.log("rd-webhook event:", eventName);

    const { data: config } = await admin
      .from("rd_integration_config")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!config) {
      await logSync("webhook", eventName, null, null, "skipped", "no_active_config", body);
      return okResponse();
    }

    await admin
      .from("rd_integration_config")
      .update({ last_webhook_at: new Date().toISOString() })
      .eq("id", config.id);

    // RD Station CRM webhook usa "document" como chave do deal
    const deal = (body.document ?? body.crm_deal ?? body.deal ?? null) as Record<string, unknown> | null;

    if (eventName === "crm_deal_created" || eventName === "crm_deal_updated") {
      if (!deal) {
        await logSync("webhook", eventName, null, null, "error", "no_deal_in_payload", body);
        return okResponse();
      }
      await upsertDeal(deal, eventName, body);
    } else if (eventName === "crm_deal_deleted") {
      const rdDealId = (deal?.id ?? deal?._id ?? body.deal_id ?? null) as string | null;
      if (rdDealId) {
        await admin.from("tickets").update({ status: "cancelado" }).eq("rd_deal_id", rdDealId);
        await logSync("webhook", eventName, rdDealId, null, "success", null, null);
      }
    } else {
      await logSync("webhook", eventName, null, null, "skipped", `unknown_event: ${eventName}`, body);
    }

    return okResponse();
  } catch (e) {
    console.error("rd-webhook unhandled error:", e);
    return okResponse();
  }
});
