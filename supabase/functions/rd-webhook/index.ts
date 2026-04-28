import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function logSync(
  admin: ReturnType<typeof createClient>,
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

async function resolvePipelineAndStage(
  admin: ReturnType<typeof createClient>,
  stageName: string | null,
): Promise<{ pipelineId: string | null; stageKey: string | null }> {
  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .eq("name", "Funil de Vendas")
    .limit(1)
    .single();

  if (!pipeline) return { pipelineId: null, stageKey: null };

  if (stageName) {
    const { data: stage } = await admin
      .from("pipeline_stages")
      .select("key")
      .eq("pipeline_id", pipeline.id)
      .eq("label", stageName)
      .limit(1)
      .single();

    if (stage) return { pipelineId: pipeline.id, stageKey: stage.key };
  }

  // Fallback: first stage by position
  const { data: firstStage } = await admin
    .from("pipeline_stages")
    .select("key")
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true })
    .limit(1)
    .single();

  return { pipelineId: pipeline.id, stageKey: firstStage?.key ?? null };
}

async function resolveOrCreateClient(
  admin: ReturnType<typeof createClient>,
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
      const { data } = await admin.from("clients").select("id").eq("email", email).limit(1).single();
      if (data) return data.id;
    }
    if (phone && phone.length >= 8) {
      const { data } = await admin
        .from("clients")
        .select("id")
        .ilike("phone", `%${phone.slice(-8)}`)
        .limit(1)
        .single();
      if (data) return data.id;
    }

    // Create new client
    const { data: newClient } = await admin
      .from("clients")
      .insert({
        name: (contact.name as string) || "Contato RD Station",
        email: email ?? null,
        phone: phone ?? null,
        whatsapp: whatsapp ?? null,
        rd_contact_id: (contact.id as string) ?? null,
        status: "ativo",
      })
      .select("id")
      .single();

    if (newClient) return newClient.id;
  }

  return null;
}

async function upsertDeal(
  admin: ReturnType<typeof createClient>,
  deal: Record<string, unknown>,
  eventName: string,
  payload: unknown,
): Promise<void> {
  const rdDealId = deal._id as string;
  const title = (deal.name as string) || "Negociação sem título";
  const amountTotal = Number(deal.amount_total ?? 0);
  const stageName = (deal.deal_stage as { name?: string } | null)?.name ?? null;
  const userEmail = (deal.user as { email?: string } | null)?.email ?? null;
  const contacts = (deal.contacts as Record<string, unknown>[] | undefined) ?? [];

  const { pipelineId, stageKey } = await resolvePipelineAndStage(admin, stageName);

  let assignedTo: string | null = null;
  if (userEmail) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", userEmail)
      .limit(1)
      .single();
    assignedTo = profile?.id ?? null;
    if (!assignedTo) {
      await logSync(admin, "webhook", eventName, rdDealId, null, "skipped", `user_not_found: ${userEmail}`, null);
    }
  }

  const clientId = await resolveOrCreateClient(admin, contacts);
  const status = mapStatus(deal);

  const { data: ticket, error } = await admin
    .from("tickets")
    .upsert(
      {
        rd_deal_id: rdDealId,
        title,
        status,
        estimated_value: amountTotal,
        pipeline_id: pipelineId,
        pipeline_stage: stageKey,
        assigned_to: assignedTo,
        client_id: clientId,
        ticket_number: `RD-${rdDealId.slice(-6)}`,
        origin: "rd_station",
        channel: "rd_station",
      },
      { onConflict: "rd_deal_id" },
    )
    .select("id")
    .single();

  if (error) {
    await logSync(admin, "webhook", eventName, rdDealId, null, "error", error.message, payload);
  } else {
    await logSync(admin, "webhook", eventName, rdDealId, ticket.id, "success", null, null);
  }
}

Deno.serve(async (req) => {
  // Always respond 200 to avoid unnecessary retries from RD Station
  const okResponse = () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return okResponse();

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return okResponse();
    }

    const eventName: string = (body.event_name as string) || (body.event_type as string) || "";
    console.log("rd-webhook event:", eventName, JSON.stringify(body).slice(0, 500));

    // Check for active config
    const { data: config } = await admin
      .from("rd_integration_config")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!config) {
      await logSync(admin, "webhook", eventName, null, null, "skipped", "no_active_config", body);
      return okResponse();
    }

    await admin
      .from("rd_integration_config")
      .update({ last_webhook_at: new Date().toISOString() })
      .eq("id", config.id);

    const deal = (body.crm_deal ?? body.deal ?? null) as Record<string, unknown> | null;

    if (eventName === "crm_deal_created" || eventName === "crm_deal_updated") {
      if (!deal) {
        await logSync(admin, "webhook", eventName, null, null, "error", "no_deal_in_payload", body);
        return okResponse();
      }
      await upsertDeal(admin, deal, eventName, body);
    } else if (eventName === "crm_deal_deleted") {
      const rdDealId = (deal?._id ?? body.deal_id ?? null) as string | null;
      if (rdDealId) {
        await admin.from("tickets").update({ status: "cancelado" }).eq("rd_deal_id", rdDealId);
        await logSync(admin, "webhook", eventName, rdDealId, null, "success", null, null);
      }
    } else {
      await logSync(admin, "webhook", eventName, null, null, "skipped", `unknown_event: ${eventName}`, body);
    }

    return okResponse();
  } catch (e) {
    console.error("rd-webhook unhandled error:", e);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
