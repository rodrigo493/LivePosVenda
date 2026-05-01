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
  let page = 1;

  while (true) {
    const resp = await rdGet("/contacts", token, { limit: "200", page: String(page) }) as {
      contacts?: Record<string, unknown>[];
      has_more?: boolean;
    };

    const contacts = resp.contacts ?? [];
    if (contacts.length === 0) break;

    // Batch upsert — uma única chamada para a página inteira
    const batch = contacts
      .filter((c) => !!c.id)
      .map((contact) => {
        const emails = (contact.emails as { email: string }[] | undefined) ?? [];
        const phones = (contact.phones as { phone: string; whatsapp_url_web?: string }[] | undefined) ?? [];
        const email = emails[0]?.email ?? null;
        const rawPhone = phones[0]?.phone ?? null;
        const phone = rawPhone ? rawPhone.replace(/\D/g, "") : null;
        const whatsapp = phones.find((p) => p.whatsapp_url_web)?.phone ?? null;
        return {
          rd_contact_id: contact.id as string,
          name: (contact.name as string) || "Contato RD Station",
          email: email ?? null,
          phone: phone ?? null,
          whatsapp: whatsapp ?? null,
          status: "ativo",
        };
      });

    if (batch.length > 0) {
      const { error } = await admin.from("clients").upsert(batch, { onConflict: "rd_contact_id" });
      if (error) console.error(`importContacts page ${page} batch failed:`, error.message);
      else count += batch.length;
    }

    if (!resp.has_more || contacts.length < 200) break;
    page++;
    await new Promise((r) => setTimeout(r, 150));
  }

  return count;
}

// Carrega todos os clientes em maps para matching local (zero queries durante o loop de deals)
async function buildClientMaps(): Promise<{
  byRdId: Map<string, string>;
  byEmail: Map<string, string>;
  byPhone: Map<string, string>;
}> {
  const byRdId = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();

  // Busca em páginas para cobrir bases grandes
  let offset = 0;
  while (true) {
    const { data: clients } = await admin
      .from("clients")
      .select("id, email, phone, rd_contact_id")
      .range(offset, offset + 999);
    if (!clients || clients.length === 0) break;
    for (const c of clients) {
      if (c.rd_contact_id) byRdId.set(c.rd_contact_id, c.id);
      if (c.email) byEmail.set(c.email.toLowerCase(), c.id);
      if (c.phone) {
        const p = c.phone.replace(/\D/g, "");
        if (p.length >= 8) byPhone.set(p.slice(-8), c.id);
      }
    }
    if (clients.length < 1000) break;
    offset += 1000;
  }
  console.log(`rd-import: client maps built — rdId=${byRdId.size}, email=${byEmail.size}, phone=${byPhone.size}`);
  return { byRdId, byEmail, byPhone };
}

function resolveClientFromContacts(
  contacts: Record<string, unknown>[],
  maps: { byRdId: Map<string, string>; byEmail: Map<string, string>; byPhone: Map<string, string> },
): string | null {
  for (const contact of contacts) {
    const rdId = contact.id as string | null;
    if (rdId && maps.byRdId.has(rdId)) return maps.byRdId.get(rdId)!;

    const emails = (contact.emails as { email: string }[] | undefined) ?? [];
    const email = emails[0]?.email?.toLowerCase() ?? null;
    if (email && maps.byEmail.has(email)) return maps.byEmail.get(email)!;

    const phones = (contact.phones as { phone: string }[] | undefined) ?? [];
    const phone = phones[0]?.phone?.replace(/\D/g, "") ?? null;
    if (phone && phone.length >= 8 && maps.byPhone.has(phone.slice(-8))) {
      return maps.byPhone.get(phone.slice(-8))!;
    }
  }
  return null;
}

type PipelineCtx = {
  pipelineId: string;
  stageMap: Map<string, string>;
  firstStageKey: string | null;
  stagesArr: { key: string; label: string }[];
};

// Carrega TODOS os pipelines locais com seus estágios.
// Retorna: mapa (nome normalizado → contexto) + fallback (pipeline de vendas ou primeiro).
async function loadAllPipelineContexts(): Promise<{
  byName: Map<string, PipelineCtx>;
  fallback: PipelineCtx | null;
}> {
  const { data: allPipelines } = await admin.from("pipelines").select("id, name");
  if (!allPipelines?.length) return { byName: new Map(), fallback: null };

  const { data: allStages } = await admin
    .from("pipeline_stages").select("pipeline_id, key, label, position")
    .order("position", { ascending: true });

  const stagesByPipeline = new Map<string, { key: string; label: string }[]>();
  for (const s of allStages ?? []) {
    const arr = stagesByPipeline.get(s.pipeline_id) ?? [];
    arr.push({ key: s.key, label: s.label });
    stagesByPipeline.set(s.pipeline_id, arr);
  }

  const byName = new Map<string, PipelineCtx>();
  let fallback: PipelineCtx | null = null;

  for (const p of allPipelines) {
    const stages = stagesByPipeline.get(p.id) ?? [];
    const ctx: PipelineCtx = {
      pipelineId: p.id,
      stageMap: new Map(stages.map((s) => [normalizeStr(s.label), s.key])),
      firstStageKey: stages[0]?.key ?? null,
      stagesArr: stages,
    };
    byName.set(normalizeStr(p.name), ctx);
    // Fallback = pipeline cujo nome contém "vendas", ou o primeiro da lista
    if (!fallback || normalizeStr(p.name).includes("vendas")) fallback = ctx;
  }

  console.log("rd-import: pipelines loaded:", [...byName.keys()]);
  return { byName, fallback };
}

function buildDealPayload(
  deal: Record<string, unknown>,
  pipelineContexts: { byName: Map<string, PipelineCtx>; fallback: PipelineCtx | null },
  emailToAuthId: Map<string, string>,
  clientMaps: { byRdId: Map<string, string>; byEmail: Map<string, string>; byPhone: Map<string, string> },
  stageMismatches: string[],
): Record<string, unknown> | null {
  const rdDealId = (deal._id ?? deal.id) as string;
  if (!rdDealId) return null;

  // Resolve qual pipeline local usar baseado no pipeline do RD Station
  const rdPipelineName = (deal.deal_pipeline as { name?: string } | null)?.name ?? null;
  const normRdPipeline = rdPipelineName ? normalizeStr(rdPipelineName) : null;

  let ctx: PipelineCtx | null = null;
  if (normRdPipeline) {
    // 1. Match exato
    ctx = pipelineContexts.byName.get(normRdPipeline) ?? null;
    // 2. Parcial: nome local contém o do RD
    if (!ctx) {
      for (const [k, v] of pipelineContexts.byName) {
        if (k.includes(normRdPipeline) || normRdPipeline.includes(k)) { ctx = v; break; }
      }
    }
  }
  ctx = ctx ?? pipelineContexts.fallback;
  if (!ctx) return null;

  const { pipelineId, stageMap, firstStageKey, stagesArr } = ctx;

  const rawStageName = (deal.deal_stage as { name?: string } | null)?.name ?? null;
  const stageKey = findStageKey(rawStageName, stageMap, stagesArr) ?? firstStageKey;
  if (rawStageName && findStageKey(rawStageName, stageMap, stagesArr) === null) {
    stageMismatches.push(rawStageName);
  }

  const userEmail = (deal.user as { email?: string } | null)?.email ?? null;
  const assignedTo = userEmail ? (emailToAuthId.get(userEmail.toLowerCase()) ?? null) : null;
  const contacts = (deal.contacts as Record<string, unknown>[] | undefined) ?? [];
  const clientId = resolveClientFromContacts(contacts, clientMaps);

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
    pipeline_id: pipelineId,
    pipeline_stage: stageKey ?? firstStageKey ?? "sem_atendimento",
    assigned_to: assignedTo,
    ticket_number: `RD-${rdDealId}`,
    origin: "rd_station",
    channel: "rd_station",
    created_at: (deal.created_at as string) || new Date().toISOString(),
  };
  if (clientId) payload.client_id = clientId;
  return payload;
}

// Importa UMA página — chamado pelo modo paginado (frontend em loop)
async function importDealsPage(
  token: string,
  page: number,
  emailToAuthId: Map<string, string>,
): Promise<{ imported: number; has_more: boolean; stage_mismatches: string[] }> {
  const pipelineContexts = await loadAllPipelineContexts();
  if (!pipelineContexts.fallback) return { imported: 0, has_more: false, stage_mismatches: [] };

  const clientMaps = await buildClientMaps();

  const resp = await rdGet("/deals", token, { limit: "200", page: String(page) }) as {
    deals?: Record<string, unknown>[];
    has_more?: boolean;
  };
  const deals = resp.deals ?? [];
  console.log(`rd-import page ${page}: ${deals.length} deals, has_more=${resp.has_more}`);
  if (deals.length === 0) return { imported: 0, has_more: false, stage_mismatches: [] };

  const stageMismatches: string[] = [];
  const batch: Record<string, unknown>[] = [];
  for (const deal of deals) {
    const p = buildDealPayload(deal, pipelineContexts, emailToAuthId, clientMaps, stageMismatches);
    if (p) batch.push(p);
  }

  let { error: batchErr } = await admin.from("tickets").upsert(batch, { onConflict: "rd_deal_id" });
  if (batchErr?.message?.includes("assigned_to_fkey")) {
    const { error: err2 } = await admin.from("tickets")
      .upsert(batch.map((p) => ({ ...p, assigned_to: null })), { onConflict: "rd_deal_id" });
    batchErr = err2 ?? null;
  }

  if (batchErr) console.error(`rd-import page ${page} upsert failed:`, batchErr.message);

  const has_more = !!(resp.has_more) && deals.length >= 200;
  return {
    imported: batchErr ? 0 : batch.length,
    has_more,
    stage_mismatches: [...new Set(stageMismatches)],
  };
}

// Importa TODOS os deals de uma vez (modo legado — pode dar timeout com >600 deals)
async function importDeals(
  token: string,
  _rdPipelineId: string | null,
  emailToAuthId: Map<string, string>,
): Promise<{ count: number; stage_mismatches: string[] }> {
  const pipelineContexts = await loadAllPipelineContexts();
  if (!pipelineContexts.fallback) return { count: 0, stage_mismatches: [] };

  const clientMaps = await buildClientMaps();
  const stageMismatches: string[] = [];
  const pageLog: { page: number; fetched: number; upserted: number; has_more: boolean; error?: string }[] = [];
  let totalCount = 0;
  let page = 1;

  while (true) {
    const resp = await rdGet("/deals", token, { limit: "200", page: String(page) }) as {
      deals?: Record<string, unknown>[];
      has_more?: boolean;
    };
    const deals = resp.deals ?? [];
    console.log(`rd-import deals: page ${page}, ${deals.length} deals, has_more=${resp.has_more}`);
    if (deals.length === 0) break;

    const batch: Record<string, unknown>[] = [];
    for (const deal of deals) {
      const p = buildDealPayload(deal, pipelineContexts, emailToAuthId, clientMaps, stageMismatches);
      if (p) batch.push(p);
    }

    let { error: batchErr } = await admin.from("tickets").upsert(batch, { onConflict: "rd_deal_id" });
    if (batchErr?.message?.includes("assigned_to_fkey")) {
      const { error: err2 } = await admin.from("tickets")
        .upsert(batch.map((p) => ({ ...p, assigned_to: null })), { onConflict: "rd_deal_id" });
      batchErr = err2 ?? null;
    }

    if (batchErr) {
      console.error(`rd-import deals page ${page} failed:`, batchErr.message);
      pageLog.push({ page, fetched: deals.length, upserted: 0, has_more: resp.has_more ?? false, error: batchErr.message });
    } else {
      totalCount += batch.length;
      pageLog.push({ page, fetched: deals.length, upserted: batch.length, has_more: resp.has_more ?? false });
    }

    if (!resp.has_more || deals.length < 200) break;
    page++;
    await new Promise((r) => setTimeout(r, 150));
  }

  if (stageMismatches.length > 0) {
    console.warn("rd-import: stage mismatches:", [...new Set(stageMismatches)]);
  }
  return { count: totalCount, stage_mismatches: [...new Set(stageMismatches)], pageLog } as { count: number; stage_mismatches: string[]; pageLog: typeof pageLog };
}

async function importTasks(token: string): Promise<number> {
  let count = 0;
  let page = 1;

  while (true) {
    const resp = await rdGet("/tasks", token, { limit: "200", page: String(page) }) as {
      tasks?: Record<string, unknown>[];
      has_more?: boolean;
    };

    for (const task of resp.tasks ?? []) {
      try {
        const rdTaskId = (task.id ?? task._id) as string | null;
        if (!rdTaskId) continue;

        // deal pode vir como objeto { _id } ou como campo direto deal_id
        const rdDealId = (
          (task.deal as { _id?: string; id?: string } | null)?._id ??
          (task.deal as { _id?: string; id?: string } | null)?.id ??
          (task.deal_id as string | null) ??
          null
        );

        let ticketId: string | null = null;
        let clientId: string | null = null;
        if (rdDealId) {
          const { data: ticket } = await admin
            .from("tickets")
            .select("id, client_id")
            .eq("rd_deal_id", rdDealId)
            .maybeSingle();
          if (ticket) { ticketId = ticket.id; clientId = ticket.client_id; }
        }

        // RD CRM usa due_date; versão mais antiga usa date
        const rawDue = (task.due_date ?? task.date ?? null) as string | null;
        const dueDate = rawDue ? rawDue.slice(0, 10) : null;
        const dueTime = rawDue && rawDue.length > 10 ? rawDue.slice(11, 16) : null;

        // status: "open"/"done" (novo) ou situation: "pending"/"done" (legado)
        const rdStatus = (task.status ?? task.situation ?? "open") as string;
        const status = rdStatus === "done" || rdStatus === "closed" ? "concluida" : "pendente";

        const taskPayload: Record<string, unknown> = {
          rd_task_id: rdTaskId,
          rd_deal_id: rdDealId,
          title: (task.name ?? task.subject ?? "Tarefa RD") as string,
          description: (task.description ?? null) as string | null,
          status,
          due_date: dueDate,
          due_time: dueTime,
          updated_at: new Date().toISOString(),
        };
        if (ticketId) taskPayload.ticket_id = ticketId;
        if (clientId) taskPayload.client_id = clientId;

        const { error } = await (admin as any)
          .from("tasks")
          .upsert(taskPayload, { onConflict: "rd_task_id" });
        if (error) throw new Error(error.message);
        count++;
      } catch (e) {
        console.error(`import task ${task.id ?? task._id} failed:`, e);
        await logSync("import", "task", String(task.id ?? task._id ?? "?"), null, "error", String(e));
      }
    }

    if (!resp.has_more || (resp.tasks ?? []).length < 200) break;
    page++;
    await new Promise((r) => setTimeout(r, 150));
  }

  return count;
}

async function importActivities(token: string): Promise<number> {
  let count = 0;
  let page = 1;

  while (true) {
    const resp = await rdGet("/activities", token, { limit: "200", page: String(page) }) as {
      activities?: Record<string, unknown>[];
      has_more?: boolean;
    };

    for (const act of resp.activities ?? []) {
      try {
        const rdActivityId = (act.id ?? act._id) as string | null;
        if (!rdActivityId) continue;

        const text = (act.text ?? act.notes ?? act.content ?? "") as string;
        if (!text.trim()) continue;

        const rdDealId = (
          (act.deal as { _id?: string; id?: string } | null)?._id ??
          (act.deal as { _id?: string; id?: string } | null)?.id ??
          (act.deal_id as string | null) ??
          null
        );

        let clientId: string | null = null;
        let ticketId: string | null = null;
        if (rdDealId) {
          const { data: ticket } = await admin
            .from("tickets")
            .select("id, client_id")
            .eq("rd_deal_id", rdDealId)
            .maybeSingle();
          if (ticket) { ticketId = ticket.id; clientId = ticket.client_id; }
        }

        // client_service_history exige client_id NOT NULL
        if (!clientId) {
          await logSync("import", "activity", rdActivityId, null, "skipped", "no_client");
          continue;
        }

        const serviceDate = (act.created_at ?? act.date ?? new Date().toISOString()) as string;

        const { error } = await (admin as any)
          .from("client_service_history")
          .upsert(
            {
              rd_activity_id: rdActivityId,
              client_id: clientId,
              service_date: serviceDate,
              problem_reported: text,
              history_notes: ticketId
                ? `[ticket:${ticketId}] [rd_activity:${rdActivityId}]`
                : `[rd_activity:${rdActivityId}]`,
              service_status: "em_andamento",
            },
            { onConflict: "rd_activity_id" },
          );

        if (error) throw new Error(error.message);
        count++;
      } catch (e) {
        console.error(`import activity ${act.id ?? act._id} failed:`, e);
        await logSync("import", "activity", String(act.id ?? act._id ?? "?"), null, "error", String(e));
      }
    }

    if (!resp.has_more || (resp.activities ?? []).length < 200) break;
    page++;
    await new Promise((r) => setTimeout(r, 150));
  }

  return count;
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return ok({ error: "Method not allowed" });

  // ── MODO WORKER (chamado pelo pg_cron via x-worker-token) ─────────────────
  const workerToken = req.headers.get("x-worker-token");
  if (workerToken) {
    try {
      const { data: config } = await admin
        .from("rd_integration_config")
        .select("*")
        .eq("worker_token", workerToken)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!config) return ok({ ok: false, reason: "invalid_token" });

      const stats = (config.import_stats as Record<string, unknown>) ?? {};
      if (stats.status !== "running") return ok({ ok: false, reason: "not_running" });

      const currentPage = typeof stats.current_page === "number" ? stats.current_page : 1;
      const cumulativeBefore = typeof stats.cumulative === "number" ? stats.cumulative : 0;
      const token = config.api_token as string;

      console.log(`rd-import worker: page=${currentPage}, cumulative=${cumulativeBefore}`);
      const emailToAuthId = await buildEmailToAuthIdMap();
      const { imported, has_more, stage_mismatches } = await importDealsPage(token, currentPage, emailToAuthId);
      const totalSoFar = cumulativeBefore + imported;

      const newStats: Record<string, unknown> = {
        status: has_more ? "running" : "done",
        total_deals: totalSoFar,
        current_page: currentPage + 1,
        cumulative: totalSoFar,
        total_contacts: 0,
        total_tasks: 0,
        total_activities: 0,
        started_at: stats.started_at,
      };
      if (!has_more) {
        newStats.imported_at = new Date().toISOString();
        newStats.stage_mismatches = stage_mismatches;
        newStats.current_page = currentPage;
      }

      await admin.from("rd_integration_config")
        .update({ import_stats: newStats, last_import_at: new Date().toISOString() })
        .eq("id", config.id);

      return ok({ ok: true, imported, total_so_far: totalSoFar, has_more, page: currentPage });
    } catch (e) {
      console.error("rd-import worker error:", e);
      return ok({ ok: false, error: String(e) });
    }
  }

  // ── MODO BROWSER (usuário autenticado — só enfileira a importação) ─────────
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
    if (!user) return ok({ ok: false, error: "Unauthorized" });

    const { data: role } = await admin
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").limit(1).maybeSingle();
    if (!role) return ok({ ok: false, error: "Admin access required" });

    const { data: config, error: cfgErr } = await admin
      .from("rd_integration_config").select("*").limit(1).single();
    if (cfgErr || !config) return ok({ ok: false, error: "Configuração não encontrada." });

    const currentStats = (config.import_stats as Record<string, unknown>) ?? {};
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const advance = body.advance === true;

    // ── MODO ADVANCE: browser solicita processamento da próxima página ──────────
    if (advance && currentStats.status === "running") {
      const currentPage = typeof currentStats.current_page === "number" ? currentStats.current_page : 1;
      const cumulativeBefore = typeof currentStats.cumulative === "number" ? currentStats.cumulative : 0;
      const emailToAuthId = await buildEmailToAuthIdMap();
      const { imported, has_more, stage_mismatches } = await importDealsPage(config.api_token as string, currentPage, emailToAuthId);
      const totalSoFar = cumulativeBefore + imported;

      const newStats: Record<string, unknown> = {
        status: has_more ? "running" : "done",
        total_deals: totalSoFar,
        current_page: currentPage + 1,
        cumulative: totalSoFar,
        total_contacts: 0,
        total_tasks: 0,
        total_activities: 0,
        started_at: currentStats.started_at,
      };
      if (!has_more) {
        newStats.imported_at = new Date().toISOString();
        newStats.stage_mismatches = stage_mismatches;
        newStats.current_page = currentPage;
      }

      await admin.from("rd_integration_config")
        .update({ import_stats: newStats, last_import_at: new Date().toISOString() })
        .eq("id", config.id);

      return ok({ ok: true, imported, total_so_far: totalSoFar, has_more, page: currentPage });
    }

    // Se já está rodando e não é advance, retorna estado atual
    if (currentStats.status === "running") {
      return ok({ ok: true, already_running: true, import_stats: currentStats });
    }

    // ── MODO INÍCIO: inicia a importação e já processa a página 1 ───────────────
    await admin.from("rd_integration_config").update({
      last_import_at: new Date().toISOString(),
      import_stats: {
        status: "running",
        current_page: 1,
        cumulative: 0,
        total_deals: 0,
        total_contacts: 0,
        total_tasks: 0,
        total_activities: 0,
        started_at: new Date().toISOString(),
      },
    }).eq("id", config.id);

    // Processa a página 1 imediatamente
    const emailToAuthId = await buildEmailToAuthIdMap();
    const { imported, has_more, stage_mismatches } = await importDealsPage(config.api_token as string, 1, emailToAuthId);

    const initStats: Record<string, unknown> = {
      status: has_more ? "running" : "done",
      current_page: 2,
      cumulative: imported,
      total_deals: imported,
      total_contacts: 0,
      total_tasks: 0,
      total_activities: 0,
      started_at: new Date().toISOString(),
    };
    if (!has_more) {
      initStats.imported_at = new Date().toISOString();
      initStats.stage_mismatches = stage_mismatches;
      initStats.current_page = 1;
    }

    await admin.from("rd_integration_config")
      .update({ import_stats: initStats })
      .eq("id", config.id);

    return ok({
      ok: true,
      started: true,
      imported,
      has_more,
      message: has_more
        ? "Importação iniciada. Página 1 processada — continuando automaticamente."
        : "Importação concluída.",
    });
  } catch (e) {
    console.error("rd-import error:", e);
    return ok({ ok: false, error: String(e) });
  }
});
