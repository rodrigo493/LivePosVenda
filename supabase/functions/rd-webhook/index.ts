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

// Busca auth.users id pelo email via REST API (case-insensitive)
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
    const emailLower = email.toLowerCase();
    const found = (body.users ?? []).find((u) => u.email?.toLowerCase() === emailLower);
    return found?.id ?? null;
  } catch {
    return null;
  }
}

async function resolvePipelineAndStage(
  stageName: string | null,
  rdPipelineName: string | null = null,
): Promise<{ pipelineId: string | null; stageKey: string | null }> {
  // Carrega todos os pipelines locais
  const { data: allPipelines } = await admin.from("pipelines").select("id, name");
  if (!allPipelines?.length) return { pipelineId: null, stageKey: null };

  // Tenta encontrar o pipeline local pelo nome do pipeline do RD Station
  let pipeline: { id: string } | null = null;
  if (rdPipelineName) {
    const norm = normalizeStr(rdPipelineName);
    const exact = allPipelines.find((p) => normalizeStr(p.name) === norm);
    const partial = !exact ? allPipelines.find((p) => normalizeStr(p.name).includes(norm) || norm.includes(normalizeStr(p.name))) : null;
    pipeline = exact ?? partial ?? null;
  }
  // Fallback: pipeline cujo nome contém "vendas", ou o primeiro
  if (!pipeline) {
    pipeline = allPipelines.find((p) => normalizeStr(p.name).includes("vendas")) ?? allPipelines[0];
  }

  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("key, label")
    .eq("pipeline_id", pipeline.id)
    .order("position", { ascending: true });

  const firstKey = stages?.[0]?.key ?? null;

  if (stageName) {
    const norm = normalizeStr(stageName);
    const exact = (stages ?? []).find((s) => normalizeStr(s.label) === norm);
    if (exact) return { pipelineId: pipeline.id, stageKey: exact.key };
    const fwd = (stages ?? []).find((s) => normalizeStr(s.label).includes(norm));
    if (fwd) return { pipelineId: pipeline.id, stageKey: fwd.key };
    const rev = (stages ?? []).find((s) => norm.includes(normalizeStr(s.label)));
    if (rev) return { pipelineId: pipeline.id, stageKey: rev.key };
    console.warn(`rd-webhook: stage sem match "${stageName}" → usando primeira etapa`);
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

// Processa crm_task_created / crm_task_updated (webhook CRM direto)
// Payload: { event_name, document: { id, name, description, status, due_date, deal_id, owner_ids } }
async function handleCrmTask(
  document: Record<string, unknown>,
  eventName: string,
): Promise<void> {
  const rdTaskId = (document.id ?? document._id) as string | null;
  if (!rdTaskId) {
    await logSync("webhook", eventName, null, null, "skipped", "no_task_id", document);
    return;
  }

  const title = (document.name ?? document.subject ?? "Tarefa RD") as string;
  const description = (document.description ?? null) as string | null;
  const rdDealId = (document.deal_id ?? null) as string | null;
  const rawDue = (document.due_date ?? null) as string | null;
  const dueDate = rawDue ? rawDue.slice(0, 10) : null;
  const dueTime = rawDue && rawDue.length > 10 ? rawDue.slice(11, 16) : null;
  // status: "open" → pendente, "done" → concluida
  const rdStatus = (document.status ?? "open") as string;
  const status = rdStatus === "done" || rdStatus === "closed" ? "concluida" : "pendente";

  let ticketId: string | null = null;
  let clientId: string | null = null;

  if (rdDealId) {
    const { data: ticket } = await admin
      .from("tickets")
      .select("id, client_id, assigned_to")
      .eq("rd_deal_id", rdDealId)
      .maybeSingle();
    if (ticket) { ticketId = ticket.id; clientId = ticket.client_id; }
  }

  const taskPayload: Record<string, unknown> = {
    rd_task_id: rdTaskId,
    rd_deal_id: rdDealId,
    title,
    description: description ?? undefined,
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

  if (error) {
    await logSync("webhook", eventName, rdTaskId, ticketId, "error", error.message, document);
    console.error("rd-webhook crm_task upsert failed:", error.message);
  } else {
    await logSync("webhook", eventName, rdTaskId, ticketId, "success", null, null);
    console.log(`rd-webhook: crm_task ${rdTaskId} → ticket ${ticketId}`);
  }
}

// Processa crm_activity_created — anotações/histórico das oportunidades
// Payload: { event_name, document: { id, text, deal_id, user_id, created_at } }
async function handleCrmActivity(
  document: Record<string, unknown>,
  eventName: string,
): Promise<void> {
  const rdNoteId = (document.id ?? document._id) as string | null;
  const text = (document.text ?? document.content ?? "") as string;
  if (!text.trim()) {
    await logSync("webhook", eventName, rdNoteId, null, "skipped", "empty_text", null);
    return;
  }

  const rdDealId = (document.deal_id ?? null) as string | null;
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

  if (!ticketId && !clientId) {
    await logSync("webhook", eventName, rdNoteId, null, "skipped", "no_ticket_found", null);
    return;
  }

  const { error } = await (admin as any)
    .from("client_service_history")
    .insert({
      client_id: clientId,
      service_date: (document.created_at as string) ?? new Date().toISOString(),
      problem_reported: text,
      history_notes: ticketId ? `[ticket:${ticketId}] [rd_note:${rdNoteId}]` : `[rd_note:${rdNoteId}]`,
      service_status: "em_andamento",
    });

  if (error) {
    await logSync("webhook", eventName, rdNoteId, ticketId, "error", error.message, null);
  } else {
    await logSync("webhook", eventName, rdNoteId, ticketId, "success", null, null);
    console.log(`rd-webhook: annotation ${rdNoteId} → ticket ${ticketId}`);
  }
}

// Processa eventos CRM vindos pelo webhook Marketing (leads-only payload)
// Ex: OPPORTUNITY_UPDATED, OPPORTUNITY_CREATED
// Payload: { leads: [{ last_conversion: { content: { __cdp__original_event: { event_type, payload } } } }] }
async function handleMarketingCrmOpportunity(
  lead: Record<string, unknown>,
  cdpEvent: Record<string, unknown>,
): Promise<void> {
  const cdpPayload = (cdpEvent.payload as Record<string, unknown>) ?? {};
  const cdpEventType = (cdpEvent.event_type as string) ?? "OPPORTUNITY_UPDATED";

  const name = (lead.name as string) ?? "Lead RD Station";
  const email = (lead.email as string) ?? (cdpPayload.email as string) ?? null;
  const rawPhone = (lead.personal_phone as string) ?? (lead.mobile_phone as string) ?? null;
  const phone = rawPhone?.replace(/\D/g, "") ?? null;
  const leadId = (lead.id as string) ?? (lead.uuid as string) ?? null;

  const stageName = (cdpPayload.funnel_stage as string) ?? null;
  const opportunityValue = Number(cdpPayload.opportunity_value ?? 0);
  const ownerEmail = (cdpPayload.contact_owner_email as string) ?? null;

  // Extrai ID do deal da URL: .../deals/{id}
  const opportunityUrl = (cdpPayload.opportunity_url as string) ?? "";
  const dealIdMatch = opportunityUrl.match(/\/deals\/([a-f0-9]+)/);
  const crmDealId = dealIdMatch?.[1] ?? null;
  const rdDealId = crmDealId ? `crm-${crmDealId}` : `mkt-${leadId ?? Date.now()}`;

  console.log(`rd-webhook ${cdpEventType}: lead=${leadId}, email=${email}, stage=${stageName}, rdDealId=${rdDealId}`);

  let clientId: string | null = null;
  if (email) {
    const { data } = await admin.from("clients").select("id").eq("email", email).limit(1).maybeSingle();
    if (data) clientId = data.id;
  }
  if (!clientId && phone && phone.length >= 8) {
    const { data } = await admin.from("clients").select("id").ilike("phone", `%${phone.slice(-8)}`).limit(1).maybeSingle();
    if (data) clientId = data.id;
  }
  if (!clientId) {
    const { data: newClient } = await admin.from("clients").upsert(
      { name, email: email ?? null, phone: phone ?? null, rd_contact_id: leadId, status: "ativo" },
      { onConflict: leadId ? "rd_contact_id" : "email" },
    ).select("id").maybeSingle();
    if (newClient) clientId = newClient.id;
  }

  const { pipelineId, stageKey } = await resolvePipelineAndStage(stageName);
  if (!pipelineId) {
    await logSync("webhook", cdpEventType, leadId, null, "error", "no_pipeline", cdpPayload);
    return;
  }

  let assignedTo: string | null = null;
  if (ownerEmail) assignedTo = await getAuthIdByEmail(ownerEmail);

  const shortId = crmDealId?.slice(-6).toUpperCase() ?? leadId?.slice(-6).toUpperCase() ?? Date.now().toString(36).toUpperCase();
  const upsertPayload: Record<string, unknown> = {
    rd_deal_id: rdDealId,
    title: name,
    ticket_type: "negociacao",
    status: "aberto",
    estimated_value: opportunityValue,
    pipeline_id: pipelineId,
    pipeline_stage: stageKey,
    assigned_to: assignedTo,
    ticket_number: `RD-${shortId}`,
    origin: "rd_station",
    channel: "rd_station",
  };
  if (clientId) upsertPayload.client_id = clientId;

  let { data: ticket, error } = await admin.from("tickets")
    .upsert(upsertPayload, { onConflict: "rd_deal_id" })
    .select("id").maybeSingle();

  if (error?.message?.includes("assigned_to_fkey")) {
    const r = await admin.from("tickets")
      .upsert({ ...upsertPayload, assigned_to: null }, { onConflict: "rd_deal_id" })
      .select("id").maybeSingle();
    ticket = r.data;
    error = r.error ?? null;
  }

  if (error) {
    await logSync("webhook", cdpEventType, leadId, null, "error", error.message, cdpPayload);
    console.error(`rd-webhook ${cdpEventType} upsert failed:`, error.message);
  } else {
    await logSync("webhook", cdpEventType, leadId, ticket?.id ?? null, "success", null, null);
    console.log(`rd-webhook: ${cdpEventType} ${rdDealId} → ticket ${ticket?.id}`);
  }
}

// Processa evento OPPORTUNITY do RD Station Marketing
// Payload: { event_type: "OPPORTUNITY", leads: [...], payload: {...} }
async function handleMarketingOpportunity(
  body: Record<string, unknown>,
): Promise<void> {
  const payloadData = (body.payload as Record<string, unknown>) ?? {};
  const leads = (body.leads as Record<string, unknown>[]) ?? [];

  // Usa o primeiro lead do array ou os dados do payload como fallback
  const leadData = leads[0] ?? payloadData;

  const rdLeadId = (leadData.id as string) ?? (leadData.uuid as string) ?? null;
  const name = (leadData.name as string) ?? (payloadData.name as string) ?? "Lead RD Station";
  const email = (leadData.email as string) ?? (payloadData.email as string) ?? null;
  const rawPhone = (
    (leadData.mobile_phone as string) ??
    (leadData.personal_phone as string) ??
    (payloadData.mobile_phone as string) ??
    (payloadData.personal_phone as string) ??
    null
  );
  const phone = rawPhone?.replace(/\D/g, "") ?? null;

  console.log(`rd-webhook OPPORTUNITY: lead=${rdLeadId}, name=${name}, email=${email}`);

  // Localizar ou criar cliente
  let clientId: string | null = null;

  if (email) {
    const { data } = await admin.from("clients").select("id").eq("email", email).limit(1).maybeSingle();
    if (data) clientId = data.id;
  }
  if (!clientId && phone && phone.length >= 8) {
    const { data } = await admin.from("clients").select("id").ilike("phone", `%${phone.slice(-8)}`).limit(1).maybeSingle();
    if (data) clientId = data.id;
  }
  if (!clientId) {
    const { data: newClient } = await admin.from("clients").upsert(
      {
        name,
        email: email ?? null,
        phone: phone ?? null,
        rd_contact_id: rdLeadId ?? null,
        status: "ativo",
      },
      { onConflict: rdLeadId ? "rd_contact_id" : "email" },
    ).select("id").maybeSingle();
    if (newClient) clientId = newClient.id;
  }

  const { pipelineId, stageKey } = await resolvePipelineAndStage(null);
  if (!pipelineId) {
    await logSync("webhook", "OPPORTUNITY", rdLeadId, null, "error", "no_pipeline", body);
    return;
  }

  // Usa prefixo "mkt-" para distinguir leads de marketing de deals do CRM
  const rdDealId = `mkt-${rdLeadId ?? email?.replace(/\W/g, "") ?? Date.now()}`;
  const shortId = rdLeadId?.slice(-6).toUpperCase() ?? Date.now().toString(36).toUpperCase();

  const upsertPayload: Record<string, unknown> = {
    rd_deal_id: rdDealId,
    title: name,
    ticket_type: "negociacao",
    status: "aberto",
    pipeline_id: pipelineId,
    pipeline_stage: stageKey,
    origin: "rd_station",
    channel: "rd_station",
    ticket_number: `RD-${shortId}`,
  };

  if (clientId) upsertPayload.client_id = clientId;

  let { data: ticket, error } = await admin.from("tickets")
    .upsert(upsertPayload, { onConflict: "rd_deal_id" })
    .select("id")
    .maybeSingle();

  if (error?.message?.includes("assigned_to_fkey")) {
    const r = await admin.from("tickets")
      .upsert({ ...upsertPayload, assigned_to: null }, { onConflict: "rd_deal_id" })
      .select("id").maybeSingle();
    ticket = r.data;
    error = r.error ?? null;
  }

  if (error) {
    await logSync("webhook", "OPPORTUNITY", rdLeadId, null, "error", error.message, body);
    console.error("rd-webhook OPPORTUNITY upsert failed:", error.message);
  } else {
    await logSync("webhook", "OPPORTUNITY", rdLeadId, ticket?.id ?? null, "success", null, null);
    console.log(`rd-webhook: opportunity ${rdLeadId} → ticket ${ticket?.id}`);
  }
}

async function upsertDeal(
  deal: Record<string, unknown>,
  eventName: string,
  rawPayload: unknown,
): Promise<void> {
  // RD Station CRM usa _id como identificador principal do deal
  const rdDealId = (deal._id ?? deal.id) as string;
  if (!rdDealId) {
    await logSync("webhook", eventName, null, null, "error", "no_deal_id", rawPayload);
    return;
  }

  const title = (deal.name as string) || "Negociação sem título";
  const amountTotal = Number(deal.amount_total ?? 0);
  const stageName = (deal.deal_stage as { name?: string } | null)?.name ?? null;
  const rdPipelineName = (deal.deal_pipeline as { name?: string } | null)?.name ?? null;
  const userEmail = (deal.user as { email?: string } | null)?.email ?? null;
  const contacts = (deal.contacts as Record<string, unknown>[] | undefined) ?? [];

  const { pipelineId, stageKey } = await resolvePipelineAndStage(stageName, rdPipelineName);

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
    ticket_type: "negociacao",
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

    // Log completo para diagnóstico
    const bodyKeys = Object.keys(body);
    console.log("rd-webhook body keys:", bodyKeys);
    console.log("rd-webhook body preview:", JSON.stringify(body).slice(0, 800));

    const eventName: string = (
      (body.event_name as string) ||
      (body.event_type as string) ||
      (body.type as string) ||
      ""
    );
    console.log("rd-webhook event:", eventName);

    const { data: config } = await admin
      .from("rd_integration_config")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!config) {
      await logSync("webhook", eventName || "unknown", null, null, "skipped", "no_active_config", body);
      return okResponse();
    }

    await admin
      .from("rd_integration_config")
      .update({ last_webhook_at: new Date().toISOString() })
      .eq("id", config.id);

    // RD Station CRM envia o deal em event_data (campo principal)
    // Fallback para outras variações de payload
    const deal = (
      body.event_data ??
      body.document ??
      body.crm_deal ??
      body.deal ??
      null
    ) as Record<string, unknown> | null;

    // RD Station Marketing envia event_type: "OPPORTUNITY"
    const evtUpper = eventName.toUpperCase();
    if (evtUpper === "OPPORTUNITY" || evtUpper.includes("OPPORTUNIT")) {
      await handleMarketingOpportunity(body);
      return okResponse();
    }

    // Payload sem event_type mas com "leads" — webhook Marketing disparado por evento CRM
    // O event_type real fica em leads[0].last_conversion.content.__cdp__original_event.event_type
    if (!eventName && Array.isArray(body.leads)) {
      const leads = body.leads as Record<string, unknown>[];
      const lead = leads[0];
      if (lead) {
        const lastConv = (lead.last_conversion as Record<string, unknown>) ?? {};
        const content = (lastConv.content as Record<string, unknown>) ?? {};
        const cdpEvent = (content.__cdp__original_event as Record<string, unknown>) ?? {};
        const cdpEventType = (cdpEvent.event_type as string) ?? "";
        console.log("rd-webhook CDP event:", cdpEventType);
        if (cdpEventType.startsWith("OPPORTUNITY")) {
          await handleMarketingCrmOpportunity(lead, cdpEvent);
        } else if (cdpEventType.startsWith("TASK")) {
          const taskDoc = (cdpEvent.payload as Record<string, unknown>) ?? cdpEvent;
          await handleCrmTask(taskDoc, cdpEventType);
        } else if (cdpEventType.startsWith("ANNOTATION") || cdpEventType.startsWith("ACTIVIT")) {
          const actDoc = (cdpEvent.payload as Record<string, unknown>) ?? cdpEvent;
          await handleCrmActivity(actDoc, cdpEventType);
        } else {
          await logSync("webhook", cdpEventType || "unknown", null, null, "skipped", `ignored_cdp_event: ${cdpEventType}`, null);
        }
      }
      return okResponse();
    }

    const evtLower = eventName.toLowerCase().replace(/[._-]/g, "");

    // Eventos de tarefas CRM — despachar antes do bloco de deals
    const isTaskEvent = evtLower.includes("task");
    const isActivityEvent = evtLower.includes("activit") || evtLower.includes("annot");

    if (isTaskEvent || isActivityEvent) {
      const document = (
        body.document ??
        body.event_data ??
        body.payload ??
        {}
      ) as Record<string, unknown>;
      if (isTaskEvent) {
        await handleCrmTask(document, eventName);
      } else {
        await handleCrmActivity(document, eventName);
      }
      return okResponse();
    }

    const isDealCreated = evtLower.includes("deal") && evtLower.includes("creat");
    const isDealUpdated = evtLower.includes("deal") && evtLower.includes("updat");
    const isDealDeleted = evtLower.includes("deal") && evtLower.includes("delet");

    // Se o payload contém dados de deal mas evento não foi identificado,
    // tratar como criação/atualização (fallback seguro)
    const hasDealData = !!(deal?._id || deal?.id);
    const shouldProcess = isDealCreated || isDealUpdated || (!isDealDeleted && hasDealData && !!deal);

    if (shouldProcess) {
      if (!deal) {
        console.error("rd-webhook: deal não encontrado no payload. Keys recebidas:", bodyKeys);
        await logSync("webhook", eventName || "unknown", null, null, "error", `no_deal_in_payload. body_keys: ${bodyKeys.join(",")}`, body);
        return okResponse();
      }
      await upsertDeal(deal, eventName || "webhook", body);
    } else if (isDealDeleted) {
      const rdDealId = (
        (deal as Record<string, unknown> | null)?._id ??
        (deal as Record<string, unknown> | null)?.id ??
        body.deal_id ??
        null
      ) as string | null;
      if (rdDealId) {
        await admin.from("tickets").update({ status: "cancelado" }).eq("rd_deal_id", rdDealId);
        await logSync("webhook", eventName, rdDealId, null, "success", null, null);
      }
    } else {
      await logSync("webhook", eventName || "empty", null, null, "skipped", `unknown_event: ${eventName}. body_keys: ${bodyKeys.join(",")}`, body);
    }

    return okResponse();
  } catch (e) {
    console.error("rd-webhook unhandled error:", e);
    return okResponse();
  }
});
