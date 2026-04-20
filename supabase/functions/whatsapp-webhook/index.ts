import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function downloadAndStoreMedia(
  admin: ReturnType<typeof createClient>,
  uazapiBaseUrl: string,
  uazapiToken: string,
  messageid: string | null,
  mime: string,
  clientId: string,
  directUrl?: string | null,
): Promise<string | null> {
  try {
    let res: Response | null = null;

    // 1. Try direct URL from payload (Uazapi embeds it in content object)
    if (directUrl) {
      res = await fetch(directUrl, { headers: { token: uazapiToken } });
      console.log("direct_url status:", res.status, directUrl.slice(0, 80));
      if (!res.ok) { console.log("direct_url failed, trying messageid"); res = null; }
    }

    // 2. Fall back to download by messageid
    if (!res && messageid) {
      res = await fetch(`${uazapiBaseUrl}/message/download`, {
        method: "POST",
        headers: { token: uazapiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ messageid }),
      });
      console.log("messageid_download status:", res.status);
      if (!res.ok) { const t = await res.text(); console.error("messageid_download error:", t); return null; }
    }

    if (!res) return null;

    const contentType = res.headers.get("content-type") || mime;
    // Normalize ogg/opus from WhatsApp — browsers play it as audio/ogg
    const storeContentType = contentType.includes("ogg") ? "audio/ogg" : contentType.split(";")[0];
    const ext = contentType.includes("ogg") ? "ogg"
      : contentType.includes("mp4") ? "mp4"
      : contentType.includes("webm") ? "webm"
      : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
      : contentType.includes("png") ? "png"
      : contentType.includes("gif") ? "gif"
      : contentType.split("/")[1]?.split(";")[0] || "bin";
    const bytes = new Uint8Array(await res.arrayBuffer());
    console.log("media_download OK: bytes=", bytes.length, "ext=", ext, "contentType=", storeContentType);
    if (bytes.length === 0) { console.error("media_download: empty body, skipping upload"); return null; }
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
        directMediaUrl = (m.content as any).url || (m.content as any).mediaUrl || (m.content as any).directPath || null;
        messageText = resolveMediaText(mediaMime || "");
      } else {
        const rawContent: string | null = (typeof m.text === "string" && m.text) ? m.text
          : (typeof m.content === "string" && m.content) ? m.content : null;
        if (rawContent && rawContent.trim().startsWith("{") && rawContent.includes("mimetype")) {
          try {
            const parsed = JSON.parse(rawContent);
            mediaMime = parsed.mimetype || null;
            directMediaUrl = parsed.url || parsed.mediaUrl || null;
            messageText = resolveMediaText(mediaMime || "");
          } catch { messageText = "📎 Mídia"; }
        } else if (!rawContent) {
          if (m.PTT === true || m.audioMessage) {
            messageText = "🎵 Áudio";
            mediaMime = (m.audioMessage as any)?.mimetype || "audio/ogg";
            directMediaUrl = (m.audioMessage as any)?.url || (m.audioMessage as any)?.mediaUrl || null;
          } else if (m.imageMessage) {
            messageText = "📷 Imagem";
            mediaMime = (m.imageMessage as any)?.mimetype || "image/jpeg";
            directMediaUrl = (m.imageMessage as any)?.url || (m.imageMessage as any)?.mediaUrl || null;
          } else if (m.videoMessage) {
            messageText = "🎥 Vídeo";
            mediaMime = (m.videoMessage as any)?.mimetype || "video/mp4";
            directMediaUrl = (m.videoMessage as any)?.url || (m.videoMessage as any)?.mediaUrl || null;
          } else if (m.documentMessage) {
            messageText = "📎 Arquivo";
            mediaMime = (m.documentMessage as any)?.mimetype || "application/octet-stream";
            directMediaUrl = (m.documentMessage as any)?.url || (m.documentMessage as any)?.mediaUrl || null;
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
      mediaUrl = await downloadAndStoreMedia(admin, UAZAPI_BASE_URL, UAZAPI_INSTANCE_TOKEN, waMessageId, mediaMime, clientId, directMediaUrl);
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
