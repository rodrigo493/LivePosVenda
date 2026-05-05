import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_SECRET    = Deno.env.get("META_APP_SECRET")!;
const VERIFY_TOKEN  = Deno.env.get("META_VERIFY_TOKEN") ?? "liveuniverse2026";
const PAGE_TOKEN    = Deno.env.get("META_PAGE_ACCESS_TOKEN") ?? "";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── helpers ───────────────────────────────────────────────────────────────────

async function verifySignature(rawBody: string, sigHeader: string): Promise<boolean> {
  if (!APP_SECRET || !sigHeader) return true; // skip if not configured
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}` === sigHeader;
}

async function graphGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}&access_token=${PAGE_TOKEN}`);
  return res.json() as Promise<Record<string, unknown>>;
}

// Resolve or create pipeline + first stage key
// Priority: slug='vendas' → slug contains 'venda' → first active pipeline
async function getPipeline(): Promise<{ pipelineId: string; firstStageKey: string } | null> {
  const { data: bySlug } = await admin.from("pipelines").select("id").eq("slug", "vendas").eq("is_active", true).maybeSingle();
  const pipeline = bySlug
    ?? (await admin.from("pipelines").select("id").ilike("slug", "%venda%").eq("is_active", true).order("position").limit(1).maybeSingle()).data
    ?? (await admin.from("pipelines").select("id").eq("is_active", true).order("position").limit(1).maybeSingle()).data;
  if (!pipeline) return null;
  const { data: stage } = await admin.from("pipeline_stages").select("key").eq("pipeline_id", pipeline.id).order("position").limit(1).maybeSingle();
  return { pipelineId: pipeline.id, firstStageKey: stage?.key ?? "lead_novo" };
}

// Find or create client; return clientId
async function upsertClient(name: string, email: string | null, phone: string | null, instagramId: string | null): Promise<string | null> {
  // Try by instagram PSID
  if (instagramId) {
    const { data, error } = await admin.from("clients").select("id").eq("instagram_psid", instagramId).maybeSingle();
    if (error) console.error("[upsertClient] erro busca psid:", JSON.stringify(error));
    if (data) return data.id;
  }
  if (email) {
    const { data } = await admin.from("clients").select("id").eq("email", email).maybeSingle();
    if (data) return data.id;
  }
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, "").slice(-8);
    const { data: allClients } = await admin.from("clients").select("id, phone");
    const found = (allClients ?? []).find(c => c.phone?.replace(/\D/g, "").slice(-8) === cleanPhone);
    if (found) return found.id;
  }
  const insert: Record<string, unknown> = { name, status: "ativo" };
  if (email) insert.email = email;
  if (phone) insert.phone = phone;
  if (instagramId) insert.instagram_psid = instagramId;
  const { data, error } = await admin.from("clients").insert(insert).select("id").maybeSingle();
  if (error) console.error("[upsertClient] erro insert:", JSON.stringify(error));
  console.log("[upsertClient] inserido:", JSON.stringify(data));
  return data?.id ?? null;
}

// Check if open ticket already exists for this client in pipeline
async function hasOpenTicket(clientId: string, pipelineId: string): Promise<boolean> {
  const { count } = await admin.from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("pipeline_id", pipelineId)
    .eq("status", "aberto");
  return (count ?? 0) > 0;
}

function makeTicketNumber(prefix: string, suffix: string): string {
  return `${prefix}-${suffix.replace(/\s/g, "").substring(0, 5).toUpperCase()}${Date.now().toString().slice(-4)}`;
}

// ── handlers ──────────────────────────────────────────────────────────────────

// Lead Ads form fill
async function handleLeadfgen(value: Record<string, unknown>) {
  const leadgenId = value.leadgen_id as string;
  if (!leadgenId) return;

  let name = "Lead Meta Ads";
  let email: string | null = null;
  let phone: string | null = null;
  let campanha: string | null = null;

  if (PAGE_TOKEN) {
    try {
      const lead = await graphGet(`${leadgenId}?fields=field_data,ad_name,created_time`);
      const fields = (lead.field_data as Array<{ name: string; values: string[] }>) ?? [];
      for (const f of fields) {
        const k = f.name.toLowerCase();
        const v = f.values?.[0] ?? "";
        if (k.includes("full_name") || k === "name") name = v;
        else if (k.includes("email")) email = v.includes("@") ? v : null;
        else if (k.includes("phone") || k.includes("telefone")) {
          const clean = v.replace(/\D/g, "").slice(-11);
          phone = clean ? `+55${clean}` : null;
        }
      }
      campanha = (lead.ad_name as string) ?? null;
    } catch (e) {
      console.error("Erro ao buscar lead:", e);
    }
  }

  const ctx = await getPipeline();
  if (!ctx) return;

  const clientId = await upsertClient(name, email, phone, null);
  if (clientId && await hasOpenTicket(clientId, ctx.pipelineId)) return; // já existe

  const createdAt = value.created_time
    ? new Date((value.created_time as number) * 1000).toISOString()
    : new Date().toISOString();

  await admin.from("tickets").insert({
    title: name,
    ticket_type: "negociacao",
    status: "aberto",
    pipeline_id: ctx.pipelineId,
    pipeline_stage: ctx.firstStageKey,
    ticket_number: makeTicketNumber("FORM", name),
    origin: "meta_lead_ads",
    channel: "meta",
    campanha,
    client_id: clientId,
    created_at: createdAt,
  });

  console.log(`[FORM] Lead criado: ${name}`);
}

// Garante registro em instagram_conversations e salva mensagem
async function saveInstagramConversation(
  igSenderId: string,
  senderUsername: string | null,
  content: string | null,
  messageType: "dm" | "comment" | "story_mention",
  igMessageId: string | null,
  postId: string | null,
  clientId: string | null,
): Promise<void> {
  if (!igMessageId) return; // sem id não salva (evita duplicatas NULL)

  // Upsert conversa
  const { data: existing } = await admin
    .from("instagram_conversations")
    .select("id, unread_count")
    .eq("ig_sender_id", igSenderId)
    .maybeSingle();

  let convId: string;
  if (existing) {
    await admin.from("instagram_conversations").update({
      last_message: content?.slice(0, 500) ?? null,
      last_message_at: new Date().toISOString(),
      unread_count: (existing.unread_count ?? 0) + 1,
      ...(senderUsername ? { sender_username: senderUsername } : {}),
      ...(clientId ? { client_id: clientId } : {}),
    }).eq("id", existing.id);
    convId = existing.id;
  } else {
    const { data: newConv } = await admin.from("instagram_conversations").insert({
      ig_sender_id: igSenderId,
      sender_username: senderUsername,
      last_message: content?.slice(0, 500) ?? null,
      unread_count: 1,
      client_id: clientId,
    }).select("id").single();
    if (!newConv) return;
    convId = newConv.id;
  }

  // Upsert mensagem (idempotente)
  await admin.from("instagram_messages").upsert({
    conversation_id: convId,
    ig_message_id: igMessageId,
    message_type: messageType,
    direction: "inbound",
    content,
    post_id: postId,
  }, { onConflict: "ig_message_id", ignoreDuplicates: true });
}

// Instagram DM (de story, reel ou post)
async function handleInstagramMessage(messaging: Record<string, unknown>) {
  const sender = (messaging.sender as { id: string })?.id;
  if (!sender) return;

  // Ignore echo (messages sent by the page itself)
  if ((messaging.message as Record<string, unknown>)?.is_echo) return;

  const igMessageId: string | null = (messaging.message as Record<string, unknown>)?.mid as string ?? null;
  const content: string | null = (messaging.message as Record<string, unknown>)?.text as string ?? null;
  const isStoryMention = (messaging.message as Record<string, unknown>)?.attachments?.[0]?.type === "story_mention";
  const messageType: "dm" | "story_mention" = isStoryMention ? "story_mention" : "dm";

  // Fetch Instagram user name
  let name = `Instagram ${sender.slice(-6)}`;
  if (PAGE_TOKEN) {
    try {
      const profile = await graphGet(`${sender}?fields=name`);
      if (profile.name) name = profile.name as string;
    } catch { /* silencioso */ }
  }

  // Detect referral source (story, reel, post, ad)
  const referral = messaging.referral as Record<string, unknown> | undefined;
  const source = referral?.source_type as string ?? referral?.type as string ?? null;
  const campanha = source ? `Instagram ${source}` : "Instagram DM";

  const ctx = await getPipeline();
  if (!ctx) { console.error("[DM] pipeline não encontrado, abortando"); return; }

  const clientId = await upsertClient(name, null, null, sender);
  if (!clientId) { console.error("[DM] clientId nulo para sender:", sender); return; }

  // Salva conversa + mensagem no sistema de chat
  await saveInstagramConversation(sender, null, content ?? "[mídia]", messageType, igMessageId, null, clientId);

  // Deduplicate: só cria card se não tiver ticket aberto
  const already = await hasOpenTicket(clientId, ctx.pipelineId);
  if (already) { console.log("[DM] ticket já existe, pulando:", sender); return; }

  const { error: tErr } = await admin.from("tickets").insert({
    title: name,
    ticket_type: "negociacao",
    status: "aberto",
    pipeline_id: ctx.pipelineId,
    pipeline_stage: ctx.firstStageKey,
    ticket_number: makeTicketNumber("IG", name),
    origin: "instagram",
    channel: "instagram",
    campanha,
    client_id: clientId,
    new_lead: true,
    created_at: new Date().toISOString(),
  });

  if (tErr) console.error("[DM] erro ao inserir ticket:", JSON.stringify(tErr));
  else console.log(`[DM] Card criado: ${name} (${campanha})`);
}

// Instagram comment
async function handleInstagramComment(change: Record<string, unknown>) {
  const v = change.value as Record<string, unknown> ?? {};
  const senderId: string = (v.from as Record<string, unknown>)?.id as string;
  const senderUsername: string | null = (v.from as Record<string, unknown>)?.username as string ?? null;
  const content: string | null = v.text as string ?? null;
  const igMessageId: string | null = v.id as string ?? null;
  const postId: string | null = (v.media as Record<string, unknown>)?.id as string ?? null;
  const mediaType: string | null = (v.media as Record<string, unknown>)?.media_product_type as string ?? null;
  const isReply: boolean = !!(v.parent_id);
  if (!senderId) return;

  // Tenta buscar nome via Graph API
  let displayName = senderUsername ? `@${senderUsername}` : `Instagram ${senderId.slice(-6)}`;
  if (PAGE_TOKEN) {
    try {
      const profile = await graphGet(`${senderId}?fields=name`);
      if (profile.name) displayName = profile.name as string;
    } catch { /* silencioso */ }
  }

  // Tenta buscar tipo/permalink do post comentado
  let postInfo: string | null = null;
  if (postId && PAGE_TOKEN) {
    try {
      const media = await graphGet(`${postId}?fields=media_product_type,permalink`);
      const type = (media.media_product_type as string ?? mediaType ?? "post").toLowerCase();
      const link = media.permalink as string ?? null;
      postInfo = link ? `${type} — ${link}` : type;
    } catch { /* silencioso */ }
  }

  const campanha = postInfo
    ? `Comentário Instagram (${postInfo})`
    : isReply ? "Resposta a comentário Instagram" : "Comentário Instagram";

  const clientName = senderUsername ?? displayName;
  const clientId = await upsertClient(clientName, null, null, senderId);

  await saveInstagramConversation(senderId, senderUsername, content, "comment", igMessageId, postId, clientId);

  // Cria card no funil (deduplica por ticket aberto)
  const ctx = await getPipeline();
  if (!ctx || !clientId) { console.log("[COMMENT] sem pipeline ou clientId, pulando card"); return; }

  const already = await hasOpenTicket(clientId, ctx.pipelineId);
  if (already) { console.log("[COMMENT] ticket já existe para:", senderId); return; }

  const ticketTitle = senderUsername ? `@${senderUsername}` : displayName;
  const { error: tErr } = await admin.from("tickets").insert({
    title: ticketTitle,
    ticket_type: "negociacao",
    status: "aberto",
    pipeline_id: ctx.pipelineId,
    pipeline_stage: ctx.firstStageKey,
    ticket_number: makeTicketNumber("IGC", clientName),
    origin: "instagram",
    channel: "instagram",
    campanha,
    client_id: clientId,
    new_lead: true,
    created_at: new Date().toISOString(),
  });

  if (tErr) console.error("[COMMENT] erro ao inserir ticket:", JSON.stringify(tErr));
  else console.log(`[COMMENT] card criado: ${ticketTitle} — ${campanha}`);
}

// ── main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  // Webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);

    // Diagnóstico: ?action=diagnose
    if (url.searchParams.get("action") === "diagnose") {
      const { data: pipelines, error: pErr } = await admin.from("pipelines").select("id,name,slug,is_active");
      const ctx = await getPipeline();
      const { data: igTickets } = await admin.from("tickets").select("id,title,pipeline_id,origin,channel,created_at").eq("origin", "instagram").order("created_at", { ascending: false }).limit(5);
      const { data: igClients } = await admin.from("clients").select("id,name,instagram_psid,created_at").not("instagram_psid", "is", null).order("created_at", { ascending: false }).limit(5);
      return new Response(JSON.stringify({ pipelines, pErr, ctx, igTickets, igClients }, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Token inválido", { status: 403 });
  }

  // Webhook event (POST)
  if (req.method === "POST") {
    const rawBody = await req.text();

    const sig = req.headers.get("x-hub-signature-256") ?? "";
    if (!await verifySignature(rawBody, sig)) {
      console.error("[webhook] signature mismatch — sig:", sig.slice(0, 20));
      return new Response("Assinatura inválida", { status: 403 });
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;

    // ── Lead Ads (formulário nativo) ──────────────────────────────────────────
    if (body.object === "page") {
      for (const entry of (body.entry as Array<Record<string, unknown>>) ?? []) {
        for (const change of (entry.changes as Array<Record<string, unknown>>) ?? []) {
          if (change.field === "leadgen") {
            await handleLeadfgen(change.value as Record<string, unknown>);
          }
        }
      }
    }

    // ── Instagram DM (story, reel, post) + comentários ───────────────────────
    if (body.object === "instagram") {
      for (const entry of (body.entry as Array<Record<string, unknown>>) ?? []) {
        for (const messaging of (entry.messaging as Array<Record<string, unknown>>) ?? []) {
          await handleInstagramMessage(messaging);
        }
        for (const change of (entry.changes as Array<Record<string, unknown>>) ?? []) {
          if (change.field === "comments") await handleInstagramComment(change);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
});
