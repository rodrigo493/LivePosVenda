import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Manual HKDF-SHA256 (RFC 5869).
// Avoids potential Deno WebCrypto deriveBits quirks for HKDF.
// ---------------------------------------------------------------------------
async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  // HKDF-Extract: PRK = HMAC-SHA256(salt, IKM)
  const saltKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));
  // HKDF-Expand: T(1) || T(2) || ... until length bytes produced
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const out = new Uint8Array(length);
  let prev = new Uint8Array(0);
  let written = 0;
  for (let i = 1; written < length; i++) {
    const input = new Uint8Array(prev.length + info.length + 1);
    input.set(prev, 0);
    input.set(info, prev.length);
    input[prev.length + info.length] = i;
    const t = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, input));
    const n = Math.min(length - written, t.length);
    out.set(t.subarray(0, n), written);
    written += n;
    prev = t;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Strategy 1: Decrypt WhatsApp media directly from the CDN.
// WhatsApp encrypts media with AES-256-CBC. The mediaKey in the webhook
// payload is the symmetric key. This avoids any dependency on Uazapi's
// download API and works as long as the CDN URL hasn't expired.
// Algorithm spec: https://github.com/tulir/whatsmeow (whatsapp.go crypto)
// ---------------------------------------------------------------------------
async function decryptWhatsAppMedia(
  cdnUrl: string,
  mediaKeyRaw: string | Record<string, unknown>,
  mime: string,
  dbg: Record<string, unknown>,
): Promise<Uint8Array | null> {
  try {
    // mediaKey may arrive as a base64 string (Go JSON) or a Node.js Buffer object.
    let mediaKeyBytes: Uint8Array;
    if (typeof mediaKeyRaw === "string") {
      // Normalize URL-safe base64 (WuzAPI/Uazapi may use - and _ instead of + and /)
      const normalized = mediaKeyRaw.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      const bin = atob(padded);
      mediaKeyBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) mediaKeyBytes[i] = bin.charCodeAt(i);
    } else if (mediaKeyRaw && typeof mediaKeyRaw === "object" && Array.isArray((mediaKeyRaw as any).data)) {
      // Node.js Buffer serialization: { type: "Buffer", data: [bytes...] }
      mediaKeyBytes = new Uint8Array((mediaKeyRaw as any).data);
    } else {
      dbg.cdnError = "mediaKey_unknown_format";
      return null;
    }

    if (mediaKeyBytes.length < 32) {
      dbg.cdnError = `mediaKey_too_short_${mediaKeyBytes.length}`;
      return null;
    }

    const m = mime.toLowerCase();
    const mediaType = m.startsWith("image/") ? "Image"
      : m.startsWith("video/") ? "Video"
      : m.startsWith("audio/") ? "Audio"
      : "Document";

    dbg.cdnUrl = cdnUrl.split("?")[0]; // strip auth params from debug
    dbg.mediaKeyDecodedLen = mediaKeyBytes.length;
    const res = await fetch(cdnUrl, {
      headers: {
        "User-Agent": "WhatsApp/2.24.6.77 A",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
      },
    });
    dbg.cdnStatus = res.status;
    dbg.cdnContentType = res.headers.get("content-type") ?? "none";
    if (!res.ok) {
      dbg.cdnError = `http_${res.status}`;
      console.error("CDN download failed:", res.status, cdnUrl.slice(0, 80));
      return null;
    }
    const encrypted = new Uint8Array(await res.arrayBuffer());
    dbg.encLen = encrypted.length;
    dbg.encLenMod16 = (encrypted.length - 10) % 16;
    dbg.first8hex = Array.from(encrypted.slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join("");
    console.log("CDN response:", encrypted.length, "bytes, type:", dbg.cdnContentType, "mod16:", dbg.encLenMod16);

    if (encrypted.length < 26) { dbg.cdnError = "encrypted_too_short"; return null; }

    // Uazapi (WuzAPI fork) uses HKDF WITHOUT null byte in the info string.
    // Standard WhatsApp (whatsmeow) uses WITH null byte. Try no-null first.
    const encWithoutMac = encrypted.slice(0, encrypted.length - 10);
    let decrypted: Uint8Array | null = null;
    for (const suffix of ["", "\x00"]) {
      const info = new TextEncoder().encode(`WhatsApp ${mediaType} Keys${suffix}`);
      const exp = await hkdfSha256(mediaKeyBytes, new Uint8Array(32), info, 112);
      const iv = exp.subarray(0, 16);
      const cipherKey = exp.subarray(16, 48);
      try {
        const aesKey = await crypto.subtle.importKey("raw", cipherKey, { name: "AES-CBC" }, false, ["decrypt"]);
        const buf = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, encWithoutMac);
        decrypted = new Uint8Array(buf);
        dbg.decryptVariant = suffix ? "hkdf_null" : "hkdf_no_null";
        dbg.cdnBytes = decrypted.length;
        console.log("CDN decrypt ok variant=", dbg.decryptVariant, decrypted.length, "bytes");
        break;
      } catch { /* try next */ }
    }

    if (!decrypted) { dbg.cdnError = "all_variants_failed"; return null; }
    return decrypted;
  } catch (e) {
    dbg.cdnError = `exception: ${e}`;
    console.error("decryptWhatsAppMedia exception:", e);
    return null;
  }
}

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

    // Strategy 1: Direct WhatsApp CDN decryption — bypasses Uazapi download API entirely.
    // Uses the mediaKey + CDN URL from the webhook payload (present in most Uazapi versions).
    if (mediaMeta) {
      const cdnUrl = String(mediaMeta.url || mediaMeta.URL || mediaMeta.Url || "");
      const mediaKeyRaw = mediaMeta.mediaKey || mediaMeta.MediaKey;
      if (cdnUrl.startsWith("https://") && mediaKeyRaw) {
        dbg.strategy1 = "attempt";
        const decrypted = await decryptWhatsAppMedia(
          cdnUrl,
          mediaKeyRaw as string | Record<string, unknown>,
          mime,
          dbg,
        );
        if (decrypted && looksLikeValidMedia(decrypted, mime)) {
          bytes = decrypted;
          dbg.strategy1 = "ok";
          console.log("Strategy1 CDN ok:", decrypted.length, "bytes");
        } else {
          dbg.strategy1 = `failed cdnError=${dbg.cdnError ?? "bad_sig"}`;
          console.log("Strategy1 CDN failed, fallback Uazapi API");
        }
      } else {
        dbg.strategy1 = `skip no_url=${!cdnUrl} no_key=${!mediaKeyRaw}`;
      }
    }

    // Strategy 2: Uazapi download API (fallback when CDN decryption unavailable or fails).
    // WuzAPI/Uazapi uses GET with query params, not POST with JSON body.
    for (let attempt = 1; attempt <= 3 && !bytes; attempt++) {
      const attemptInfo: Record<string, unknown> = { attempt };
      try {
        const apiUrl = new URL(`${uazapiBaseUrl}${endpoint}`);
        if (messageId) apiUrl.searchParams.set("messageId", messageId);
        if (chatId) apiUrl.searchParams.set("chatId", chatId);
        attemptInfo.apiUrl = apiUrl.toString().slice(0, 200);
        const res = await fetch(apiUrl.toString(), {
          method: "GET",
          headers: { Token: uazapiToken },
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
      : mime.includes("gif") ? "gif"
      : mime.includes("webp") ? "webp"
      : mime.includes("pdf") ? "pdf"
      : mime.includes("spreadsheetml") ? "xlsx"
      : mime.includes("wordprocessingml") || mime.includes("msword") ? "docx"
      : mime.includes("presentationml") || mime.includes("powerpoint") ? "pptx"
      : mime.includes("zip") ? "zip"
      : mime.split("/")[1]?.split(";")[0]?.split(".").pop() || "bin";

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const POSVENDA_USER_ID = Deno.env.get("POSVENDA_USER_ID") || null;
    const UAZAPI_INSTANCE_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "c6a355b6-c741-47c1-b1e6-c48938dd477b";
    const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL") || "https://liveuni.uazapi.com";

    // Parse body once — needed for both token validation and message processing
    const rawBody = await req.text();
    let body: any = null;
    try { body = rawBody ? JSON.parse(rawBody) : null; } catch { body = null; }

    // Validate that the payload comes from a known Uazapi instance.
    // Multi-instance: check against pipeline_whatsapp_instances table.
    // Fallback: compare against UAZAPI_EXPECTED_TOKEN env var (backward compat).
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const headerToken = req.headers.get("token") || req.headers.get("Token") || "";
    const bodyToken: string = body?.token || body?.instanceToken || body?.instance_token || body?.owner || "";
    const incomingToken = headerToken || bodyToken;

    // Look up the instance in DB by token
    let pipelineInstance: { id: string; pipeline_id: string; base_url: string; instance_token: string } | null = null;
    if (incomingToken) {
      const { data: instances } = await admin
        .from("pipeline_whatsapp_instances")
        .select("id, pipeline_id, base_url, instance_token")
        .eq("instance_token", incomingToken)
        .eq("active", true)
        .limit(1);
      pipelineInstance = instances?.[0] ?? null;
    }

    // If not in DB, fall back to legacy single-token env var
    if (!pipelineInstance) {
      const expectedInstanceToken = Deno.env.get("UAZAPI_EXPECTED_TOKEN");
      if (expectedInstanceToken && incomingToken !== expectedInstanceToken) {
        console.log("Reject payload: token not in DB and mismatches UAZAPI_EXPECTED_TOKEN. instanceName=", body?.instanceName);
        return new Response(JSON.stringify({ ignored: true, reason: "wrong_instance" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }

    const instanceId: string | null = pipelineInstance?.id ?? null;
    const instancePipelineId: string | null = pipelineInstance?.pipeline_id ?? null;
    const instanceBaseUrl: string = pipelineInstance?.base_url ?? UAZAPI_BASE_URL;
    const instanceToken: string = pipelineInstance?.instance_token ?? UAZAPI_INSTANCE_TOKEN;

    console.log("Uazapi webhook:", JSON.stringify(body).slice(0, 500));

    // Handle delivery/read receipts from Uazapi
    // Uazapi/WuzAPI sends ack events when contacts receive or read our messages.
    // Format: { EventType: "message_acks", data: { Key: { Id, FromMe }, Status } }
    // Status: 2=server_ack, 3=delivery_ack(delivered), 4=read, 5=played(read)
    const ackEventType = (body?.EventType || "").toLowerCase();
    if (ackEventType === "message_acks" || ackEventType === "chatmessage_status" || ackEventType === "message_status") {
      const d = body?.data || {};
      const msgId: string = d?.Key?.Id || d?.key?.id || d?.id || d?.messageId || d?.MessageID || "";
      const fromMe: boolean = d?.Key?.FromMe ?? d?.key?.fromMe ?? false;
      const rawStatus = d?.Status ?? d?.status ?? d?.Ack ?? d?.ack ?? 0;
      const statusNum = typeof rawStatus === "number" ? rawStatus : parseInt(String(rawStatus), 10);

      if (msgId && fromMe) {
        const newStatus = statusNum >= 4 ? "read" : statusNum === 3 ? "delivered" : null;
        if (newStatus) {
          await admin
            .from("whatsapp_messages")
            .update({ status: newStatus })
            .eq("manychat_message_id", msgId)
            .eq("direction", "outbound");
          console.log("Ack update:", msgId, "->", newStatus, "statusNum:", statusNum);
        }
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

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
          ...(instancePipelineId ? { pipeline_id: instancePipelineId } : {}),
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
      mediaUrl = await downloadAndStoreMedia(admin, instanceBaseUrl, instanceToken, waMessageId, mediaMime, clientId, senderChatId, mediaMeta, mediaDbg);
    }

    const { error: msgErr } = await admin.from("whatsapp_messages").insert({
      client_id: clientId,
      ticket_id: ticketId,
      direction: "inbound",
      message_text: messageText,
      media_url: mediaUrl,
      media_mime_type: mediaMime,
      media_debug: mediaUrl
        ? (mediaDbg.decryptVariant ? { ok: true, variant: mediaDbg.decryptVariant } : null)
        : (Object.keys(mediaDbg).length ? mediaDbg : null),
      sender_name: senderName,
      sender_phone: senderPhone,
      manychat_message_id: waMessageId,
      status: "received",
      instance_id: instanceId,
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
