import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function downloadAndStoreMedia(
  admin: ReturnType<typeof createClient>,
  uazapiBaseUrl: string,
  uazapiToken: string,
  messageid: string | null,
  mime: string,
  clientId: string,
  directUrl?: string | null,
  mediaMeta?: Record<string, unknown> | null,
): Promise<string | null> {
  try {
    let bytes: Uint8Array | null = null;

    const endpoint = mime.startsWith("audio/") ? "/chat/downloadaudio"
      : mime.startsWith("image/") ? "/chat/downloadimage"
      : mime.startsWith("video/") ? "/chat/downloadvideo"
      : "/chat/downloaddocument";

    // 1. Use Uazapi download endpoint with WhatsApp crypto metadata (retry on transient failures)
    if (mediaMeta) {
      const payload: Record<string, unknown> = {
        Url: mediaMeta.URL || mediaMeta.url || mediaMeta.Url || directUrl,
        MediaKey: mediaMeta.mediaKey || mediaMeta.MediaKey,
        Mimetype: mediaMeta.mimetype || mediaMeta.Mimetype || mime,
        FileSHA256: mediaMeta.fileSHA256 || mediaMeta.fileSha256 || mediaMeta.FileSHA256,
        FileLength: mediaMeta.fileLength || mediaMeta.FileLength,
        FileEncSHA256: mediaMeta.fileEncSHA256 || mediaMeta.fileEncSha256 || mediaMeta.FileEncSHA256,
      };
      console.log(`${endpoint} payload:`, JSON.stringify(payload).slice(0, 300));
      for (let attempt = 1; attempt <= 3 && !bytes; attempt++) {
        try {
          const res = await fetch(`${uazapiBaseUrl}${endpoint}`, {
            method: "POST",
            headers: { Token: uazapiToken, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          console.log(`${endpoint} attempt=${attempt} status:`, res.status);
          if (res.ok) {
            const json = await res.json();
            const b64: string = json.base64 || json.data || json.audio || json.image || json.video || json.document || "";
            if (b64) {
              const raw = b64.includes(",") ? b64.split(",")[1] : b64;
              const bin = atob(raw);
              bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              break;
            } else { console.error(`${endpoint}: no base64 in response`, JSON.stringify(json).slice(0, 200)); }
          } else {
            const t = await res.text();
            console.error(`${endpoint} attempt=${attempt} error:`, t.slice(0, 200));
          }
        } catch (e) { console.error(`${endpoint} attempt=${attempt} exception:`, e); }
        if (!bytes && attempt < 3) await new Promise((r) => setTimeout(r, attempt * 800));
      }
    }

    // 2. Fallback: try direct URL only if absolute
    if (!bytes && directUrl && directUrl.startsWith("http")) {
      const res = await fetch(directUrl, { headers: { Token: uazapiToken } });
      console.log("direct_url status:", res.status, directUrl.slice(0, 80));
      if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
    }

    if (!bytes || bytes.length === 0) { console.error("media_download: no bytes obtained"); return null; }

    const storeContentType = mime.includes("ogg") ? "audio/ogg" : mime.split(";")[0];
    const ext = mime.includes("ogg") ? "ogg"
      : mime.includes("mp4") ? "mp4"
      : mime.includes("webm") ? "webm"
      : mime.includes("jpeg") || mime.includes("jpg") ? "jpg"
      : mime.includes("png") ? "png"
      : mime.split("/")[1]?.split(";")[0] || "bin";

    console.log("media bytes=", bytes.length, "ext=", ext);
    const path = `${clientId}/${Date.now()}_inbound.${ext}`;
    const { error } = await admin.storage.from("whatsapp-media").upload(path, bytes, { contentType: storeContentType, upsert: true });
    if (error) { console.error("storage upload error:", error.message); return null; }
    const { data } = admin.storage.from("whatsapp-media").getPublicUrl(path);
    console.log("media stored:", data.publicUrl.slice(0, 100));
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
    let directMediaUrl: string | null = null;
    let mediaMeta: Record<string, unknown> | null = null;

    // Uazapi actual format: { EventType, message: { fromMe, sender_pn, chatid, text, senderName, messageid }, chat }
    if (body?.EventType && body?.message) {
      const m = body.message;
      console.log("MSG_DEBUG keys:", Object.keys(m).join(","), "| text:", m.text, "| content type:", typeof m.content, "| PTT:", m.PTT, "| EventType:", body.EventType);
      // dump full message for media debugging
      if (!m.text && !m.content || typeof m.content === "object" || m.PTT || m.audioMessage || m.imageMessage || m.videoMessage || m.documentMessage) {
        console.log("MEDIA_PAYLOAD:", JSON.stringify(m).slice(0, 2000));
      }
      if (m.fromMe === true || m.wasSentByApi === true) return new Response("OK", { status: 200 });
      senderPhone = (m.sender_pn || m.chatid || m.sender || "").toString().replace("@s.whatsapp.net", "").replace(/\D/g, "");
      const resolveMediaText = (mime: string) => {
        if (mime.startsWith("image/")) return "📷 Imagem";
        if (mime.startsWith("video/")) return "🎥 Vídeo";
        if (mime.startsWith("audio/")) return "🎵 Áudio";
        return "📎 Arquivo";
      };

      if (typeof m.content === "object" && m.content !== null) {
        const c = m.content as any;
        mediaMime = c.mimetype || null;
        directMediaUrl = c.URL || c.url || c.mediaUrl || c.directPath || null;
        messageText = resolveMediaText(mediaMime || "");
        // capture crypto metadata for all media types
        if (mediaMime) {
          mediaMeta = c as Record<string, unknown>;
          console.log("MEDIA_CONTENT keys:", Object.keys(c).join(","), "| mime:", mediaMime);
        }
      } else {
        const rawContent: string | null = (typeof m.text === "string" && m.text) ? m.text
          : (typeof m.content === "string" && m.content) ? m.content : null;
        if (rawContent && rawContent.trim().startsWith("{") && rawContent.includes("mimetype")) {
          try {
            const parsed = JSON.parse(rawContent);
            mediaMime = parsed.mimetype || null;
            directMediaUrl = parsed.url || parsed.mediaUrl || null;
            messageText = resolveMediaText(mediaMime || "");
            if (mediaMime) mediaMeta = parsed;
          } catch { messageText = "📎 Mídia"; }
        } else if (!rawContent) {
          if (m.PTT === true || m.audioMessage) {
            messageText = "🎵 Áudio";
            const am = m.audioMessage as any;
            mediaMime = am?.mimetype || "audio/ogg";
            directMediaUrl = am?.url || am?.mediaUrl || null;
            mediaMeta = am || null;
            console.log("AUDIO_PTT audioMessage keys:", am ? Object.keys(am).join(",") : "null", "| PTT:", m.PTT);
          } else if (m.imageMessage) {
            messageText = "📷 Imagem";
            const im = m.imageMessage as any;
            mediaMime = im?.mimetype || "image/jpeg";
            directMediaUrl = im?.url || im?.mediaUrl || null;
            mediaMeta = im || null;
          } else if (m.videoMessage) {
            messageText = "🎥 Vídeo";
            const vm = m.videoMessage as any;
            mediaMime = vm?.mimetype || "video/mp4";
            directMediaUrl = vm?.url || vm?.mediaUrl || null;
            mediaMeta = vm || null;
          } else if (m.documentMessage) {
            messageText = "📎 Arquivo";
            const dm = m.documentMessage as any;
            mediaMime = dm?.mimetype || "application/octet-stream";
            directMediaUrl = dm?.url || dm?.mediaUrl || null;
            mediaMeta = dm || null;
          }
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

    // Deduplication: prefer wa_message_id (exact), fallback to text+phone+15s window
    if (waMessageId) {
      const { data: existing } = await admin
        .from("whatsapp_messages")
        .select("id")
        .eq("manychat_message_id", waMessageId)
        .limit(1);
      if (existing?.length) {
        return new Response(JSON.stringify({ duplicate: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    } else {
      const dedupeWindow = new Date(Date.now() - 15000).toISOString();
      const { data: existing } = await admin
        .from("whatsapp_messages")
        .select("id")
        .eq("client_id", clientId)
        .eq("direction", "inbound")
        .eq("message_text", messageText)
        .eq("sender_phone", senderPhone)
        .gte("created_at", dedupeWindow)
        .limit(1);
      if (existing?.length) {
        return new Response(JSON.stringify({ duplicate: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }

    let mediaUrl: string | null = null;
    if (mediaMime && (waMessageId || directMediaUrl)) {
      console.log("downloading media: mime=", mediaMime, "directUrl=", directMediaUrl?.slice(0, 80), "msgid=", waMessageId);
      mediaUrl = await downloadAndStoreMedia(admin, UAZAPI_BASE_URL, UAZAPI_INSTANCE_TOKEN, waMessageId, mediaMime, clientId, directMediaUrl, mediaMeta);
    }

    const { error: msgErr } = await admin.from("whatsapp_messages").insert({
      client_id: clientId,
      ticket_id: ticketId,
      direction: "inbound",
      message_text: messageText,
      media_url: mediaUrl,
      sender_name: senderName,
      sender_phone: senderPhone,
      manychat_message_id: waMessageId,
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
