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

// Carrega pipeline e estágios — reutilizado por importDeals e importDealsPage
async function loadPipelineContext(): Promise<{
  pipelineId: string | null;
  stageMap: Map<string, string>;
  firstStageKey: string | null;
  stagesArr: { key: string; label: string }[];
}> {
  const { data: salesPipeline } = await admin
    .from("pipelines").select("id").ilike("name", "%vendas%").limit(1).maybeSingle();
  const { data: firstPipeline } = !salesPipeline
    ? await admin.from("pipelines").select("id").limit(1).maybeSingle()
    : { data: null };
  const pipeline = salesPipeline ?? firstPipeline;
  if (!pipeline?.id) return { pipelineId: null, stageMap: new Map(), firstStageKey: null, stagesArr: [] };

  const { data: stages } = await admin
    .from("pipeline_stages").select("key, label, position")
    .eq("pipeline_id", pipeline.id).order("position", { ascending: true });

  const stageMap = new Map((stages ?? []).map((s) => [normalizeStr(s.label), s.key]));
  const firstStageKey = stages?.[0]?.key ?? null;
  console.log("rd-import: stageMap:", [...stageMap.keys()]);
  return { pipelineId: pipeline.id, stageMap, firstStageKey, stagesArr: stages ?? [] };
}

function buildDealPayload(
  deal: Record<string, unknown>,
  pipelineId: string,
  stageMap: Map<string, string>,
  firstStageKey: string | null,
  stagesArr: { key: string; label: string }[],
  emailToAuthId: Map<string, string>,
  clientMaps: { byRdId: Map<string, string>; byEmail: Map<string, string>; byPhone: Map<string, string> },
  stageMismatches: string[],
): Record<string, unknown> | null {
  const rdDealId = (deal._id ?? deal.id) as string;
  if (!rdDealId) return null;

  const rawStageName = (deal.deal_stage as { name?: string } | null)?.name ?? null;
  const stageKey = findStageKey(rawStageName, stageMap, stagesArr) ?? firstStageKey;
  if (rawStageName && stageKey === firstStageKey && findStageKey(rawStageName, stageMap, stagesArr) === null) {
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
  const { pipelineId, stageMap, firstStageKey, stagesArr } = await loadPipelineContext();
  if (!pipelineId) return { imported: 0, has_more: false, stage_mismatches: [] };

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
    const p = buildDealPayload(deal, pipelineId, stageMap, firstStageKey, stagesArr, emailToAuthId, clientMaps, stageMismatches);
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
  const { pipelineId, stageMap, firstStageKey, stagesArr } = await loadPipelineContext();
  if (!pipelineId) return { count: 0, stage_mismatches: [] };

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
      const p = buildDealPayload(deal, pipelineId, stageMap, firstStageKey, stagesArr, emailToAuthId, clientMaps, stageMismatches);
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
          assigned_to: null,
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

    const body = await req.json().catch(() => ({})) as {
      skip_contacts?: boolean;
      page?: number;
      cumulative?: number;
    };
    const skipContacts = body.skip_contacts === true;
    const token = config.api_token as string;
    const rdPipelineId = config.rd_pipeline_id as string | null;
    const configId = config.id as string;

    // ── Modo paginado: importa UMA página por chamada ──────────────────────
    if (typeof body.page === "number") {
      const page = body.page;
      const cumulativeBefore = typeof body.cumulative === "number" ? body.cumulative : 0;

      console.log(`rd-import: paginated mode page=${page}, cumulative=${cumulativeBefore}`);
      const emailToAuthId = await buildEmailToAuthIdMap();
      const { imported, has_more, stage_mismatches } = await importDealsPage(token, page, emailToAuthId);
      const totalSoFar = cumulativeBefore + imported;

      const importStats = {
        status: has_more ? "running" : "done",
        total_deals: totalSoFar,
        total_contacts: 0,
        total_tasks: 0,
        total_activities: 0,
        started_at: page === 1 ? new Date().toISOString() : undefined,
        ...(has_more ? {} : { imported_at: new Date().toISOString(), stage_mismatches }),
      };

      await admin.from("rd_integration_config").update({
        last_import_at: new Date().toISOString(),
        import_stats: importStats,
      }).eq("id", configId);

      return new Response(
        JSON.stringify({ ok: true, imported, total_so_far: totalSoFar, has_more, page }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // ── Modo legado: importa tudo de uma vez (pode dar timeout com >600 deals) ─
    console.log("rd-import: legacy full import, skip_contacts=", skipContacts);
    const emailToAuthId = await buildEmailToAuthIdMap();

    let totalContacts = 0;
    if (!skipContacts) {
      totalContacts = await importContacts(token);
      console.log(`rd-import: ${totalContacts} contacts imported`);
    }

    const { count: totalDeals, stage_mismatches, pageLog } = await importDeals(token, rdPipelineId, emailToAuthId);
    console.log(`rd-import: ${totalDeals} deals imported`);

    const importStats = {
      status: "done",
      total_deals: totalDeals,
      total_contacts: totalContacts,
      total_tasks: 0,
      total_activities: 0,
      imported_at: new Date().toISOString(),
      stage_mismatches,
    };

    await admin.from("rd_integration_config").update({
      last_import_at: new Date().toISOString(),
      import_stats: importStats,
    }).eq("id", configId);

    return new Response(JSON.stringify({ ok: true, ...importStats, pageLog }), {
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
