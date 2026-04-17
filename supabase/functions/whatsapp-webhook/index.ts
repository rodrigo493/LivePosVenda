import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function downloadAndStoreMedia(
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  uazapiBaseUrl: string,
  uazapiToken: string,
  messageid: string,
  mime: string,
  clientId: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${uazapiBaseUrl}/message/download`, {
      method: "POST",
      headers: { token: uazapiToken, "Content-Type": "application/json" },
      body: JSON.stringify({ messageid }),
    });
    console.log("media_download status:", res.status, "messageid:", messageid);
    if (!res.ok) {
      const errText = await res.text();
      console.error("media_download error:", errText);
      return null;
    }
    const contentType = res.headers.get("content-type") || mime;
    const ext = contentType.includes("ogg") ? "ogg" : contentType.includes("mp4") ? "mp4" : contentType.includes("webm") ? "webm" : contentType.split("/")[1]?.split(";")[0] || "bin";
    const bytes = new Uint8Array(await res.arrayBuffer());
    console.log("media_download bytes:", bytes.length, "ext:", ext);
    const path = `${clientId}/${Date.now()}_inbound.${ext}`;
    const { error } = await admin.storage.from("whatsapp-media").upload(path, bytes, { contentType: contentType.split(";")[0], upsert: true });
    if (error) { console.error("storage upload error:", error.message); return null; }
    const { data } = admin.storage.from("whatsapp-media").getPublicUrl(path);
    return data.publicUrl;
  } catch (e) { console.error("downloadAndStoreMedia exception:", e); return null; }
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return new Response("OK", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const POSVENDA_USER_ID = Deno.env.get("POSVENDA_USER_ID") || null;
    const UAZAPI_INSTANCE_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "c6a355b6-c741-47c1-b1e6-c48938dd477b";
    const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL") || "https://liveuni.uazapi.com";

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    console.log("Uazapi webhook:", JSON.stringify(body).slice(0, 500));

    let senderPhone: string | null = null;
    let messageText: string | null = null;
    let senderName: string | null = null;
    let waMessageId: string | null = null;
    let mediaMime: string | null = null;

    // Uazapi actual format: { EventType, message: { fromMe, sender_pn, chatid, text, senderName, messageid }, chat }
    if (body?.EventType && body?.message) {
      const m = body.message;
      console.log("MSG_DEBUG keys:", Object.keys(m).join(","), "| text:", m.text, "| content type:", typeof m.content, "| PTT:", m.PTT, "| EventType:", body.EventType);
      if (m.fromMe === true || m.wasSentByApi === true) return new Response("OK", { status: 200 });
      senderPhone = (m.sender_pn || m.chatid || m.sender || "").toString().replace("@s.whatsapp.net", "").replace(/\D/g, "");
      const resolveMediaText = (mime: string) => {
        if (mime.startsWith("image/")) return "📷 Imagem";
        if (mime.startsWith("video/")) return "🎥 Vídeo";
        if (mime.startsWith("audio/")) return "🎵 Áudio";
        return "📎 Arquivo";
      };

      if (typeof m.content === "object" && m.content !== null) {
        mediaMime = (m.content as any).mimetype || null;
        messageText = resolveMediaText(mediaMime || "");
      } else {
        const rawContent: string | null = (typeof m.text === "string" && m.text) ? m.text
          : (typeof m.content === "string" && m.content) ? m.content : null;
        if (rawContent && rawContent.trim().startsWith("{") && rawContent.includes("mimetype")) {
          try { messageText = resolveMediaText(JSON.parse(rawContent).mimetype || ""); }
          catch { messageText = "📎 Mídia"; }
        } else if (!rawContent) {
          if (m.PTT === true || m.audioMessage) messageText = "🎵 Áudio";
          else if (m.imageMessage) messageText = "📷 Imagem";
          else if (m.videoMessage) messageText = "🎥 Vídeo";
          else if (m.documentMessage) messageText = "📎 Arquivo";
        } else {
          messageText = rawContent;
        }
      }
      senderName = m.senderName || body.chat?.name || null;
      waMessageId = m.messageid || null;
    } else if (body?.event && body?.data) {
      // Uazapi legacy format
      const d = body.data;
      if (d.fromMe === true || d.key?.fromMe === true) return new Response("OK", { status: 200 });
      senderPhone = (d.phone || d.sender || d.chatid || "").toString().replace("@s.whatsapp.net", "").replace(/\D/g, "");
      const rawD = d.text || d.message || d.body || null;
      if (rawD && rawD.trim().startsWith("{") && rawD.includes("mimetype")) {
        try {
          const media = JSON.parse(rawD);
          const mime: string = media.mimetype || "";
          if (mime.startsWith("image/")) messageText = "📷 Imagem";
          else if (mime.startsWith("video/")) messageText = "🎥 Vídeo";
          else if (mime.startsWith("audio/")) messageText = "🎵 Áudio";
          else messageText = "📎 Arquivo";
        } catch { messageText = "📎 Mídia"; }
      } else {
        messageText = rawD;
      }
      senderName = d.senderName || d.pushName || null;
      waMessageId = d.messageid || d.key?.id || null;
    } else if (body?.data?.key) {
      // Evolution API format
      const key = body.data.key;
      if (key.fromMe === true) return new Response("OK", { status: 200 });
      senderPhone = (key.remoteJid || "").replace("@s.whatsapp.net", "").replace(/\D/g, "");
      messageText = body.data.message?.conversation || body.data.message?.extendedTextMessage?.text || null;
      senderName = body.data.pushName || null;
      waMessageId = key.id || null;
    } else if (body?.phone && body?.message) {
      // Simple format
      senderPhone = String(body.phone).replace(/\D/g, "");
      messageText = String(body.message);
      senderName = body.name || null;
      waMessageId = body.message_id || null;
    }

    if (!senderPhone || !messageText) {
      console.log("Ignoring: no phone or message. Raw body:", JSON.stringify(body));
      return new Response(JSON.stringify({ ignored: true, body }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const localPhone = senderPhone.startsWith("55") ? senderPhone.slice(2) : senderPhone;

    const { data: existingClients } = await admin
      .from("clients")
      .select("id, name")
      .or(`phone.ilike.%${localPhone},whatsapp.ilike.%${localPhone}`)
      .limit(1);

    let clientId: string;
    let ticketId: string | null = null;

    if (existingClients?.length) {
      clientId = existingClients[0].id;

      const { data: tickets } = await admin
        .from("tickets")
        .select("id")
        .eq("client_id", clientId)
        .not("status", "in", '("fechado","resolvido")')
        .order("created_at", { ascending: false })
        .limit(1);

      ticketId = tickets?.[0]?.id || null;
      if (ticketId) {
        await admin.from("tickets").update({ last_interaction_at: new Date().toISOString() }).eq("id", ticketId);
      }
    } else {
      const { data: newClient, error: clientErr } = await admin
        .from("clients")
        .insert({
          name: senderName || `WhatsApp ${localPhone}`,
          phone: localPhone,
          whatsapp: localPhone,
          status: "ativo",
          notes: "Criado automaticamente via WhatsApp",
        })
        .select("id")
        .single();

      if (clientErr || !newClient) {
        console.error("Failed to create client:", clientErr);
        return new Response(JSON.stringify({ error: "client", detail: clientErr }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      clientId = newClient.id;

      const { data: newTicket } = await admin
        .from("tickets")
        .insert({
          client_id: clientId,
          title: `WhatsApp — ${senderName || localPhone}`,
          description: messageText,
          status: "aberto",
          pipeline_stage: "sem_atendimento",
          pipeline_position: 0,
          assigned_to: POSVENDA_USER_ID,
          ticket_number: "",
          origin: "whatsapp",
          channel: "whatsapp",
        })
        .select("id")
        .single();

      ticketId = newTicket?.id || null;
    }

    // Deduplication: prefer waMessageId match, fallback to text+window
    const dedupeWindow = new Date(Date.now() - 30000).toISOString();
    let dedupeQuery = admin.from("whatsapp_messages").select("id").eq("client_id", clientId).eq("direction", "inbound").limit(1);
    if (waMessageId) {
      dedupeQuery = dedupeQuery.eq("sender_phone", senderPhone);
      // Check by message id via notes — use 30s window with same text as fallback
    }
    const { data: existing } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("client_id", clientId)
      .eq("direction", "inbound")
      .eq("message_text", messageText)
      .gte("created_at", dedupeWindow)
      .limit(1);

    // For media messages (generic placeholder), also check by sender+window with shorter dedup
    const mediaPlaceholders = ["🎵 Áudio", "📷 Imagem", "🎥 Vídeo", "📎 Arquivo", "📎 Mídia"];
    const isMediaPlaceholder = mediaPlaceholders.includes(messageText || "");
    const shortWindow = new Date(Date.now() - 5000).toISOString();
    if (isMediaPlaceholder) {
      const { data: recentMedia } = await admin
        .from("whatsapp_messages")
        .select("id")
        .eq("client_id", clientId)
        .eq("direction", "inbound")
        .eq("message_text", messageText)
        .gte("created_at", shortWindow)
        .limit(1);
      if (recentMedia?.length) {
        return new Response(JSON.stringify({ duplicate: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    } else if (existing?.length) {
      return new Response(JSON.stringify({ duplicate: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    let mediaUrl: string | null = null;
    if (mediaMime && waMessageId) {
      mediaUrl = await downloadAndStoreMedia(admin, SUPABASE_URL, UAZAPI_BASE_URL, UAZAPI_INSTANCE_TOKEN, waMessageId, mediaMime, clientId);
    }

    const { error: msgErr } = await admin.from("whatsapp_messages").insert({
      client_id: clientId,
      ticket_id: ticketId,
      direction: "inbound",
      message_text: messageText,
      media_url: mediaUrl,
      sender_name: senderName,
      sender_phone: senderPhone,
      status: "received",
    });

    if (msgErr) {
      return new Response(JSON.stringify({ error: "msg_insert", detail: msgErr }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, client_id: clientId }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
