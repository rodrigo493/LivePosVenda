import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RD_API_BASE = "https://crm.rdstation.com/api/v1";

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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function logSync(
  operation: string,
  eventType: string | null,
  rdId: string | null,
  liveId: string | null,
  status: string,
  errorMessage: string | null,
) {
  try {
    await admin.from("rd_sync_log").insert({
      operation,
      event_type: eventType,
      rd_id: rdId,
      live_id: liveId,
      status,
      error_message: errorMessage,
    });
  } catch { /* log failure does not block import */ }
}

async function rdGet(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(`${RD_API_BASE}${path}`);
  url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      if (res.status === 429 && attempt < 4) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw new Error(`RD API ${path} → HTTP ${res.status}`);
    }
    return res.json();
  }
  throw new Error(`RD API ${path} → 5 tentativas excedidas (429)`);
}

// Busca auth.users via REST com timeout de 8s para não travar a função
async function buildEmailToAuthIdMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
      signal: controller.signal,
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    clearTimeout(timer);
    if (res.ok) {
      const body = await res.json() as { users?: Array<{ id: string; email?: string }> };
      for (const u of body.users ?? []) {
        // lowercase para comparação case-insensitive
        if (u.email) map.set(u.email.toLowerCase(), u.id);
      }
      console.log("rd-import: auth users loaded:", map.size);
    } else {
      console.warn("rd-import: auth users fetch status:", res.status);
    }
  } catch (e) {
    console.warn("rd-import: auth users fetch failed (continuing without user mapping):", String(e));
  }
  return map;
}

// Matching fuzzy de estágio: exato → parcial → null
function findStageKey(
  stageName: string | null,
  stageMap: Map<string, string>,
  stages: { key: string; label: string }[],
): string | null {
  if (!stageName) return null;
  const norm = normalizeStr(stageName);

  // 1. Match exato normalizado
  const exact = stageMap.get(norm);
  if (exact) return exact;

  // 2. Label local contém o nome do RD
  const fwd = stages.find((s) => normalizeStr(s.label).includes(norm));
  if (fwd) return fwd.key;

  // 3. Nome do RD contém o label local
  const rev = stages.find((s) => norm.includes(normalizeStr(s.label)));
  if (rev) return rev.key;

  return null;
}

async function importContacts(token: string): Promise<number> {
  let count = 0;
  let nextPage: string | null = null;

  do {
    const params: Record<string, string> = { limit: "200" };
    if (nextPage) params.page = nextPage;

    const resp = await rdGet("/contacts", token, params) as {
      contacts: Record<string, unknown>[];
      has_more: boolean;
      next_page?: string;
    };

    for (const contact of resp.contacts ?? []) {
      if (!contact.id) continue;
      try {
        const emails = (contact.emails as { email: string }[] | undefined) ?? [];
        const phones = (contact.phones as { phone: string; whatsapp_url_web?: string }[] | undefined) ?? [];
        const email = emails[0]?.email ?? null;
        const rawPhone = phones[0]?.phone ?? null;
        const phone = rawPhone ? rawPhone.replace(/\D/g, "") : null;
        const whatsapp = phones.find((p) => p.whatsapp_url_web)?.phone ?? null;

        await admin.from("clients").upsert(
          {
            rd_contact_id: contact.id as string,
            name: (contact.name as string) || "Contato RD Station",
            email: email ?? null,
            phone: phone ?? null,
            whatsapp: whatsapp ?? null,
            status: "ativo",
          },
          { onConflict: "rd_contact_id" },
        );
        count++;
      } catch (e) {
        console.error(`import contact ${contact.id} failed:`, e);
      }
    }

    await new Promise((r) => setTimeout(r, 300));
    nextPage = resp.has_more ? (resp.next_page ?? null) : null;
  } while (nextPage);

  return count;
}

async function importDeals(
  token: string,
  rdPipelineId: string | null,
  emailToAuthId: Map<string, string>,
): Promise<{ count: number; stage_mismatches: string[] }> {
  // Use "Funil de Vendas" pipeline, fallback to first available
  const { data: salesPipeline } = await admin
    .from("pipelines")
    .select("id")
    .ilike("name", "%vendas%")
    .limit(1)
    .maybeSingle();

  const { data: firstPipeline } = !salesPipeline
    ? await admin.from("pipelines").select("id").limit(1).maybeSingle()
    : { data: null };

  const pipeline = salesPipeline ?? firstPipeline;

  const { data: stages } = pipeline?.id
    ? await admin
        .from("pipeline_stages")
        .select("key, label, position")
        .eq("pipeline_id", pipeline.id)
        .order("position", { ascending: true })
    : { data: [] };

  const stageMap = new Map((stages ?? []).map((s) => [normalizeStr(s.label), s.key]));
  const firstStageKey = stages?.[0]?.key ?? null;
  const stagesArr = stages ?? [];
  console.log("rd-import: stageMap:", [...stageMap.keys()]);

  const stageMismatches: string[] = [];

  let totalCount = 0;
  let nextPage: string | null = null;
  let pageNum = 0;

  do {
    pageNum++;
    const params: Record<string, string> = { limit: "200" };
    if (rdPipelineId) params.deal_pipeline_id = rdPipelineId;
    if (nextPage) params.page = nextPage;

    const resp = await rdGet("/deals", token, params) as {
      deals: Record<string, unknown>[];
      has_more: boolean;
      next_page?: string;
    };

    console.log(`rd-import: page ${pageNum}, ${resp.deals?.length ?? 0} deals, has_more=${resp.has_more}`);

    for (const deal of resp.deals ?? []) {
      try {
        const rdDealId = deal._id as string;
        const rawStageName = (deal.deal_stage as { name?: string } | null)?.name ?? null;
        const stageKey = findStageKey(rawStageName, stageMap, stagesArr) ?? firstStageKey;

        // Log estágios que não encontraram match para diagnóstico
        if (rawStageName && stageKey === firstStageKey && findStageKey(rawStageName, stageMap, stagesArr) === null) {
          stageMismatches.push(rawStageName);
          console.warn(`rd-import: stage sem match "${rawStageName}" → usando primeira etapa`);
        }

        const userEmail = (deal.user as { email?: string } | null)?.email ?? null;
        const contacts = (deal.contacts as Record<string, unknown>[] | undefined) ?? [];

        // case-insensitive email lookup
        const assignedTo = userEmail ? (emailToAuthId.get(userEmail.toLowerCase()) ?? null) : null;
        if (userEmail && !assignedTo) {
          console.warn(`rd-import: usuário não encontrado em auth.users: ${userEmail}`);
        }

        let clientId: string | null = null;
        for (const contact of contacts) {
          const emails = (contact.emails as { email: string }[] | undefined) ?? [];
          const phones = (contact.phones as { phone: string }[] | undefined) ?? [];
          const email = emails[0]?.email ?? null;
          const phone = phones[0]?.phone?.replace(/\D/g, "") ?? null;

          if (email) {
            const { data } = await admin.from("clients").select("id").eq("email", email).limit(1).maybeSingle();
            if (data) { clientId = data.id; break; }
          }
          if (phone && phone.length >= 8) {
            const { data } = await admin
              .from("clients")
              .select("id")
              .ilike("phone", `%${phone.slice(-8)}`)
              .limit(1)
              .maybeSingle();
            if (data) { clientId = data.id; break; }
          }
          const whatsapp = (contact.phones as { phone: string; whatsapp_url_web?: string }[] | undefined)
            ?.find((p) => p.whatsapp_url_web)?.phone ?? null;
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
          if (newClient) { clientId = newClient.id; break; }
        }

        if (!pipeline?.id) {
          await logSync("import", "deal", rdDealId, null, "skipped", "no_pipeline");
          continue;
        }

        let status = "aberto";
        if (deal.win === true) status = "fechado";
        else if (deal.win === false) status = "cancelado";
        else if (deal.hold === true) status = "pausado";

        const payload: Record<string, unknown> = {
          rd_deal_id: rdDealId,
          title: (deal.name as string) || "Negociação sem título",
          ticket_type: "negociacao",
          status,
          estimated_value: Number(deal.amount_total ?? 0),
          pipeline_id: pipeline.id,
          pipeline_stage: stageKey ?? firstStageKey ?? "sem_atendimento",
          assigned_to: assignedTo,
          ticket_number: `RD-${rdDealId}`,
          origin: "rd_station",
          channel: "rd_station",
          created_at: (deal.created_at as string) || new Date().toISOString(),
        };

        if (clientId) payload.client_id = clientId;

        let { error: upsertErr } = await admin.from("tickets").upsert(payload, { onConflict: "rd_deal_id" });

        if (upsertErr?.message?.includes("assigned_to_fkey")) {
          const { error: retryErr } = await admin.from("tickets").upsert(
            { ...payload, assigned_to: null },
            { onConflict: "rd_deal_id" },
          );
          upsertErr = retryErr ?? null;
        }

        if (upsertErr) throw new Error(upsertErr.message);

        totalCount++;
        await logSync("import", "deal", rdDealId, null, "success", null);
      } catch (e) {
        const rdDealId = deal._id as string;
        await logSync("import", "deal", rdDealId, null, "error", String(e));
        console.error(`import deal ${rdDealId} failed:`, e);
      }
    }

    await new Promise((r) => setTimeout(r, 300));
    nextPage = resp.has_more ? (resp.next_page ?? null) : null;
  } while (nextPage);

  if (stageMismatches.length > 0) {
    const uniq = [...new Set(stageMismatches)];
    console.warn("rd-import: stage mismatches (foram para primeira etapa):", uniq);
  }

  return { count: totalCount, stage_mismatches: [...new Set(stageMismatches)] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (!role) {
      return new Response(JSON.stringify({ ok: false, error: "Admin access required — user.id: " + user.id }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: config, error: cfgErr } = await admin
      .from("rd_integration_config")
      .select("*")
      .limit(1)
      .single();

    if (cfgErr || !config) {
      return new Response(JSON.stringify({ ok: false, error: "Configuração não encontrada. Cadastre o token primeiro." }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({})) as { skip_contacts?: boolean };
    const skipContacts = body.skip_contacts === true;

    const token = config.api_token as string;
    const rdPipelineId = config.rd_pipeline_id as string | null;

    console.log("rd-import: starting import, skip_contacts=", skipContacts);

    // Build user email→id map before import
    const emailToAuthId = await buildEmailToAuthIdMap();

    let totalContacts = 0;
    if (!skipContacts) {
      totalContacts = await importContacts(token);
      console.log(`rd-import: ${totalContacts} contacts imported`);
    }

    const { count: totalDeals, stage_mismatches } = await importDeals(token, rdPipelineId, emailToAuthId);
    console.log(`rd-import: ${totalDeals} deals imported`);

    const importStats = {
      total_deals: totalDeals,
      total_contacts: totalContacts,
      total_comments: 0,
      imported_at: new Date().toISOString(),
      stage_mismatches,
    };

    await admin.from("rd_integration_config").update({
      last_import_at: new Date().toISOString(),
      import_stats: importStats,
    }).eq("id", config.id);

    return new Response(JSON.stringify({ ok: true, ...importStats }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rd-import error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
