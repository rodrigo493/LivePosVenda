import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function looksLikeValidMedia(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 8) return false;
  // Reject JSON error blobs that upstream sometimes returns with status 200
  if (bytes[0] === 0x7B || bytes[0] === 0x5B) return false; // "{" or "["
  const m = mime.toLowerCase();
  const sig = (...arr: number[]) => arr.every((b, i) => bytes[i] === b);
  if (m.startsWith("image/jpeg") || m.includes("jpg")) return sig(0xFF, 0xD8, 0xFF);
  if (m.startsWith("image/png")) return sig(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
  if (m.startsWith("image/gif")) return sig(0x47, 0x49, 0x46, 0x38);
  if (m.startsWith("image/webp")) return sig(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45;
  if (m.includes("ogg")) return sig(0x4F, 0x67, 0x67, 0x53);
  if (m.includes("webm") || m.includes("matroska")) return sig(0x1A, 0x45, 0xDF, 0xA3);
  if (m.includes("mp4") || m.includes("m4a") || m.includes("quicktime")) {
    // ISO-BMFF: 4 bytes size + "ftyp"
    return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  }
  if (m.startsWith("audio/mpeg") || m.endsWith("/mp3")) {
    return sig(0x49, 0x44, 0x33) || (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0);
  }
  if (m.startsWith("application/pdf")) return sig(0x25, 0x50, 0x44, 0x46);
  return true; // unknown mime: trust size only
}

async function downloadAndStoreMedia(
  admin: ReturnType<typeof createClient>,
  uazapiBaseUrl: string,
  uazapiToken: string,
  messageId: string | null,
  mime: string,
  clientId: string,
  chatId?: string | null,
  mediaMeta?: Record<string, unknown> | null,
  dbg: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const endpoint = mime.startsWith("audio/") ? "/chat/downloadaudio"
      : mime.startsWith("image/") ? "/chat/downloadimage"
      : mime.startsWith("video/") ? "/chat/downloadvideo"
      : "/chat/downloaddocument";

    dbg.endpoint = endpoint;
    dbg.mime = mime;
    dbg.chatId = chatId;
    dbg.messageId = messageId;

    // Build crypto-based payload from mediaMeta fields (handles several casing variants).
    let payload: Record<string, unknown> | null = null;
    if (mediaMeta) {
      dbg.metaKeys = Object.keys(mediaMeta);
      const url = mediaMeta.URL || mediaMeta.url || mediaMeta.Url;
      const mediaKey = mediaMeta.mediaKey || mediaMeta.MediaKey;
      dbg.hasUrl = !!url;
      dbg.hasMediaKey = !!mediaKey;
      if (url && mediaKey) {
        payload = {
          Url: url,
          MediaKey: mediaKey,
          Mimetype: mediaMeta.mimetype || mediaMeta.Mimetype || mime,
          FileSHA256: mediaMeta.fileSHA256 || mediaMeta.fileSha256 || mediaMeta.FileSHA256,
          FileLength: mediaMeta.fileLength || mediaMeta.FileLength,
          FileEncSHA256: mediaMeta.fileEncSHA256 || mediaMeta.fileEncSha256 || mediaMeta.FileEncSHA256,
        };
        dbg.strategy = "crypto";
      } else {
        dbg.strategy = "crypto_missing_fields";
        console.error(`${endpoint}: mediaMeta present but missing Url(${!!url}) or MediaKey(${!!mediaKey}). Keys:`, Object.keys(mediaMeta).join(","));
      }
    } else {
      dbg.strategy = "no_meta";
      console.error(`${endpoint}: no mediaMeta`);
    }

    // Fallback: ask Uazapi to handle decryption internally by chatId+messageId.
    if (!payload) {
      if (chatId && messageId) {
        console.log(`${endpoint}: no crypto payload — trying chatId+messageId fallback`);
        payload = { chatId, messageId };
        dbg.strategy = "chatid_fallback";
      } else {
        dbg.error = "no_payload_no_fallback";
        console.error(`${endpoint}: no payload and no chatId/messageId fallback — skipping`);
        return null;
      }
    }

    console.log(`${endpoint} payload:`, JSON.stringify(payload).slice(0, 300));
    dbg.attempts = [];

    let bytes: Uint8Array | null = null;
    for (let attempt = 1; attempt <= 3 && !bytes; attempt++) {
      const attemptInfo: Record<string, unknown> = { attempt };
      try {
        const res = await fetch(`${uazapiBaseUrl}${endpoint}`, {
          method: "POST",
          headers: { Token: uazapiToken, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        attemptInfo.status = res.status;
        console.log(`${endpoint} attempt=${attempt} status:`, res.status);
        if (res.ok) {
          const json = await res.json();
          const responseKeys = Object.keys(json);
          attemptInfo.responseKeys = responseKeys;
          // WuzAPI/Uazapi (Go) returns PascalCase: Data. Also try lowercase variants.
          const b64: string = json.Data || json.base64 || json.data || json.audio || json.image || json.video || json.document || json.file || "";
          if (b64) {
            const raw = b64.includes(",") ? b64.split(",")[1] : b64;
            const bin = atob(raw);
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            if (!looksLikeValidMedia(buf, mime)) {
              const first16 = Array.from(buf.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
              attemptInfo.error = `bad_signature first16=${first16}`;
              console.error(`${endpoint} attempt=${attempt} decoded bytes fail signature check. first16=`, first16);
            } else {
              bytes = buf;
              attemptInfo.ok = true;
              break;
            }
          } else {
            attemptInfo.error = `no_b64 responseKeys=${responseKeys.join(",")} body=${JSON.stringify(json).slice(0, 300)}`;
            console.error(`${endpoint}: no base64 in response`, JSON.stringify(json).slice(0, 200));
          }
        } else {
          const t = await res.text();
          attemptInfo.error = `http_${res.status}: ${t.slice(0, 200)}`;
          console.error(`${endpoint} attempt=${attempt} error:`, t.slice(0, 200));
        }
      } catch (e) {
        attemptInfo.error = `exception: ${e}`;
        console.error(`${endpoint} attempt=${attempt} exception:`, e);
      }
      (dbg.attempts as unknown[]).push(attemptInfo);
      if (!bytes && attempt < 3) await new Promise((r) => setTimeout(r, attempt * 800));
    }

    if (!bytes || bytes.length === 0) {
      dbg.error = dbg.error || "no_valid_bytes";
      console.error("media_download: no valid bytes obtained");
      return null;
    }

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
    if (error) {
      dbg.error = `storage: ${error.message}`;
      console.error("storage upload error:", error.message);
      return null;
    }
    const { data } = admin.storage.from("whatsapp-media").getPublicUrl(path);
    console.log("media stored:", data.publicUrl.slice(0, 100));
    return data.publicUrl;
  } catch (e) {
    dbg.error = `exception: ${e}`;
    console.error("downloadAndStoreMedia exception:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return new Response("OK", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Reject payloads from other Uazapi instances that may share this webhook URL.
    // The Uazapi server forwards the instance token in the "token" request header
    // and/or in the body as `instanceToken`/`token`. If UAZAPI_EXPECTED_TOKEN is
    // set, drop anything that doesn't match.
    const expectedInstanceToken = Deno.env.get("UAZAPI_EXPECTED_TOKEN");
    if (expectedInstanceToken) {
      const headerToken = req.headers.get("token") || req.headers.get("Token") || "";
      // Read body once and reuse below
      const rawBody = await req.text();
      let parsed: any = null;
      try { parsed = rawBody ? JSON.parse(rawBody) : null; } catch { parsed = null; }
      const bodyToken: string = parsed?.token || parsed?.instanceToken || parsed?.instance_token || parsed?.owner || "";
      if (headerToken !== expectedInstanceToken && bodyToken !== expectedInstanceToken) {
        console.log("Reject payload: instance token mismatch. header=", headerToken.slice(0, 8), " body=", String(bodyToken).slice(0, 8), " instanceName=", parsed?.instanceName);
        return new Response(JSON.stringify({ ignored: true, reason: "wrong_instance" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      // Re-construct request with the body so the rest of the handler can re-read it
      (req as any).__cachedBody = parsed;
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const POSVENDA_USER_ID = Deno.env.get("POSVENDA_USER_ID") || null;
    const UAZAPI_INSTANCE_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "c6a355b6-c741-47c1-b1e6-c48938dd477b";
    const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL") || "https://liveuni.uazapi.com";

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = (req as any).__cachedBody ?? await req.json();

    console.log("Uazapi webhook:", JSON.stringify(body).slice(0, 500));

    let senderPhone: string | null = null;
    let messageText: string | null = null;
    let senderName: string | null = null;
    let waMessageId: string | null = null;
    let mediaMime: string | null = null;
    let directMediaUrl: string | null = null;
    let mediaMeta: Record<string, unknown> | null = null;
    let senderChatId: string | null = null;

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
      senderChatId = m.chatid || m.sender_pn || null;
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
          // Helper: if the named sub-object is null, fall back to the top-level
          // message object itself — some Uazapi versions inline the crypto fields.
          const hasCryptoFields = (obj: any) =>
            obj && (obj.url || obj.URL || obj.Url || obj.directPath || obj.mediaKey || obj.MediaKey);

          if (m.PTT === true || m.audioMessage) {
            messageText = "🎵 Áudio";
            const am = m.audioMessage as any;
            mediaMime = am?.mimetype || (m as any).mimetype || "audio/ogg";
            directMediaUrl = am?.url || am?.mediaUrl || (m as any).url || null;
            mediaMeta = hasCryptoFields(am) ? am : hasCryptoFields(m) ? (m as any) : null;
            console.log("AUDIO_PTT audioMessage keys:", am ? Object.keys(am).join(",") : "null", "| m keys:", Object.keys(m).join(","), "| PTT:", m.PTT, "| mediaMeta:", !!mediaMeta);
          } else if (m.imageMessage) {
            messageText = "📷 Imagem";
            const im = m.imageMessage as any;
            mediaMime = im?.mimetype || "image/jpeg";
            directMediaUrl = im?.url || im?.mediaUrl || null;
            mediaMeta = hasCryptoFields(im) ? im : hasCryptoFields(m) ? (m as any) : null;
          } else if (m.videoMessage) {
            messageText = "🎥 Vídeo";
            const vm = m.videoMessage as any;
            mediaMime = vm?.mimetype || "video/mp4";
            directMediaUrl = vm?.url || vm?.mediaUrl || null;
            mediaMeta = hasCryptoFields(vm) ? vm : hasCryptoFields(m) ? (m as any) : null;
          } else if (m.documentMessage) {
            messageText = "📎 Arquivo";
            const dm = m.documentMessage as any;
            mediaMime = dm?.mimetype || "application/octet-stream";
            directMediaUrl = dm?.url || dm?.mediaUrl || null;
            mediaMeta = hasCryptoFields(dm) ? dm : hasCryptoFields(m) ? (m as any) : null;
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
    const mediaDbg: Record<string, unknown> = {};
    if (mediaMime) {
      console.log("downloading media: mime=", mediaMime, "chatId=", senderChatId, "msgid=", waMessageId, "hasMeta=", !!mediaMeta);
      mediaUrl = await downloadAndStoreMedia(admin, UAZAPI_BASE_URL, UAZAPI_INSTANCE_TOKEN, waMessageId, mediaMime, clientId, senderChatId, mediaMeta, mediaDbg);
    }

    const { error: msgErr } = await admin.from("whatsapp_messages").insert({
      client_id: clientId,
      ticket_id: ticketId,
      direction: "inbound",
      message_text: messageText,
      media_url: mediaUrl,
      media_mime_type: mediaMime,
      media_debug: mediaUrl ? null : (Object.keys(mediaDbg).length ? mediaDbg : null),
      sender_name: senderName,
      sender_phone: senderPhone,
      manychat_message_id: waMessageId,
      status: "received",
    });

    if (msgErr) {
      // 23505 = unique_violation: concurrent webhook raced us. Treat as duplicate.
      if ((msgErr as { code?: string }).code === "23505") {
        return new Response(JSON.stringify({ duplicate: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "msg_insert", detail: msgErr }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, client_id: clientId }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
