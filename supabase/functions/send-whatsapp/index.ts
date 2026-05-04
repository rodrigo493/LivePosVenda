import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function base64ToUint8Array(base64: string): Uint8Array {
  const b64 = base64.includes(",") ? base64.split(",")[1] : base64;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const UAZAPI_INSTANCE_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "c6a355b6-c741-47c1-b1e6-c48938dd477b";
    const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL") || "https://liveuni.uazapi.com";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { client_id, ticket_id, message, phone, media_base64, media_mime_type, media_filename, instance_id } = await req.json();

    if (!client_id || !phone) {
      return new Response(
        JSON.stringify({ error: "client_id and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!message && !media_base64) {
      return new Response(
        JSON.stringify({ error: "message or media_base64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length <= 11) cleanPhone = "55" + cleanPhone;

    let sendRes: Response;
    let savedText: string;
    let outboundMediaUrl: string | undefined;
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve which Uazapi instance to use for this send.
    // Priority: (0) explicit instance_id → (1) last inbound on ticket → (2) pipeline distribution → (3) user instance → (4) last inbound client → (5) fallback
    let useToken = UAZAPI_INSTANCE_TOKEN;
    let useBaseUrl = UAZAPI_BASE_URL;
    let useInstanceId: string | null = null;

    // Priority 0: instance_id explícito enviado pelo cliente
    if (instance_id) {
      const { data: explicitInst } = await adminClient
        .from("pipeline_whatsapp_instances")
        .select("id, instance_token, base_url")
        .eq("id", instance_id)
        .eq("active", true)
        .maybeSingle();
      if ((explicitInst as any)?.instance_token) {
        useToken = (explicitInst as any).instance_token;
        useBaseUrl = (explicitInst as any).base_url || UAZAPI_BASE_URL;
        useInstanceId = (explicitInst as any).id;
      }
    }

    if (!useInstanceId && ticket_id) {
      // 1. Look at the last inbound message on the ticket to reuse the same number
      const { data: lastMsg } = await adminClient
        .from("whatsapp_messages")
        .select("instance_id, pipeline_whatsapp_instances(id, instance_token, base_url)")
        .eq("ticket_id", ticket_id)
        .eq("direction", "inbound")
        .not("instance_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      const inst = (lastMsg?.[0] as any)?.pipeline_whatsapp_instances;
      if (inst?.instance_token) {
        useToken = inst.instance_token;
        useBaseUrl = inst.base_url || UAZAPI_BASE_URL;
        useInstanceId = inst.id;
      } else {
        // 2. No inbound history on ticket — pick by distribution from the ticket's pipeline
        const { data: ticket } = await adminClient
          .from("tickets")
          .select("pipeline_id")
          .eq("id", ticket_id)
          .single();

        if (ticket?.pipeline_id) {
          const { data: instances } = await adminClient
            .from("pipeline_whatsapp_instances")
            .select("id, instance_token, base_url, distribution_pct")
            .eq("pipeline_id", ticket.pipeline_id)
            .eq("active", true)
            .gt("distribution_pct", 0);

          if (instances?.length) {
            const total = instances.reduce((s: number, i: any) => s + i.distribution_pct, 0);
            let rand = Math.random() * total;
            for (const i of instances as any[]) {
              rand -= i.distribution_pct;
              if (rand <= 0) { useToken = i.instance_token; useBaseUrl = i.base_url || UAZAPI_BASE_URL; useInstanceId = i.id; break; }
            }
            if (!useInstanceId) { const last = (instances as any[])[instances.length - 1]; useToken = last.instance_token; useBaseUrl = last.base_url || UAZAPI_BASE_URL; useInstanceId = last.id; }
          }
        }
      }
    }

    // 3. Usa instância vinculada ao usuário logado (prioridade sobre histórico do cliente)
    if (!useInstanceId) {
      const { data: userInst } = await adminClient
        .from("pipeline_whatsapp_instances")
        .select("id, instance_token, base_url")
        .eq("user_id", user.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if ((userInst as any)?.instance_token) {
        useToken = (userInst as any).instance_token;
        useBaseUrl = (userInst as any).base_url || UAZAPI_BASE_URL;
        useInstanceId = (userInst as any).id;
      }
    }

    // 4. Fallback: busca último inbound do cliente (usuário sem instância própria)
    if (!useInstanceId && client_id) {
      const { data: clientMsg } = await adminClient
        .from("whatsapp_messages")
        .select("instance_id, pipeline_whatsapp_instances(id, instance_token, base_url)")
        .eq("client_id", client_id)
        .eq("direction", "inbound")
        .not("instance_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const clientInst = (clientMsg as any)?.pipeline_whatsapp_instances;
      if (clientInst?.instance_token) {
        useToken = clientInst.instance_token;
        useBaseUrl = clientInst.base_url || UAZAPI_BASE_URL;
        useInstanceId = clientInst.id;
      }
    }

    if (media_base64 && media_mime_type) {
      const ext = (media_filename || "file").split(".").pop() || "bin";
      const fileBytes = base64ToUint8Array(media_base64);

      // Upload to Storage for DB media_url (player)
      const storagePath = `${client_id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await adminClient.storage
        .from("whatsapp-media")
        .upload(storagePath, fileBytes, { contentType: media_mime_type, upsert: true });
      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);
      const { data: urlData } = adminClient.storage.from("whatsapp-media").getPublicUrl(storagePath);
      outboundMediaUrl = urlData.publicUrl;

      const isImage = media_mime_type.startsWith("image/");
      const isAudio = media_mime_type.startsWith("audio/");
      const isVideo = media_mime_type.startsWith("video/");
      const mediaType = isAudio ? "ptt" : isImage ? "image" : isVideo ? "video" : "document";
      const caption = message || "";
      const filename = media_filename || `file.${ext}`;

      // Uazapi v2: JSON with 'type' (not 'mediatype') and 'file' as public URL
      const uazapiBody: Record<string, string> = {
        number: cleanPhone,
        type: mediaType,
        file: outboundMediaUrl,
      };
      if (caption) uazapiBody.text = caption;
      if (!isAudio && !isImage && !isVideo) uazapiBody.filename = filename;

      console.log("send/media phone:", cleanPhone, "type:", mediaType, "mime:", media_mime_type, "url:", outboundMediaUrl);

      sendRes = await fetch(`${useBaseUrl}/send/media`, {
        method: "POST",
        headers: { token: useToken, "Content-Type": "application/json" },
        body: JSON.stringify(uazapiBody),
      });

      savedText = isAudio ? `🎵 ${filename}` : isImage ? `🖼️ ${filename}` : `📎 ${filename}`;
    } else {
      sendRes = await fetch(`${useBaseUrl}/send/text`, {
        method: "POST",
        headers: { token: useToken, "Content-Type": "application/json" },
        body: JSON.stringify({ number: cleanPhone, text: message }),
      });
      savedText = message;
    }

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      throw new Error(`Uazapi error [${sendRes.status}]: ${JSON.stringify(sendData)}`);
    }

    // Log FULL response so we can identify the actual message ID field name
    const fullJson = JSON.stringify(sendData);
    console.log("UAZAPI_SEND_FULL:", fullJson.slice(0, 800));

    // Recursive extractor — tries every known UazapiGO/Uazapi path
    function extractMsgId(d: any): string | null {
      if (!d || typeof d !== "object") return null;
      // Direct scalar fields (various casings)
      const candidates = [
        d.MessageID, d.messageID, d.message_id, d.messageId, d.msgId, d.MsgId,
        d.Id, d.id, d.ID, d.wamid, d.WAMID,
        d.Key?.Id, d.Key?.ID, d.key?.id, d.key?.ID,
        d.Info?.ID, d.Info?.Id, d.info?.id,
        d.Message?.Key?.Id, d.Message?.Key?.ID, d.message?.key?.id,
      ];
      for (const v of candidates) {
        if (v && typeof v === "string" && v.length > 4) return v;
      }
      // UazapiGO Results array format: { Results: [{ Message: { Key: { Id } } }] }
      const results = d.Results ?? d.results ?? d.messages ?? d.Messages;
      if (Array.isArray(results) && results.length > 0) {
        const inner = results[0];
        const fromArr = extractMsgId(inner?.Message ?? inner?.message ?? inner);
        if (fromArr) return fromArr;
      }
      // Wrapper objects
      for (const key of ["result", "data", "message", "Message", "response"]) {
        if (d[key] && typeof d[key] === "object") {
          const found = extractMsgId(d[key]);
          if (found) return found;
        }
      }
      return null;
    }

    const outboundMsgIdRaw = extractMsgId(sendData);
    // Uazapi retorna "phone:rawId" — guardamos só o rawId para casar com ACK events
    // que chegam com apenas o rawId em data.Key.Id
    const outboundMsgId = outboundMsgIdRaw?.includes(":")
      ? outboundMsgIdRaw.split(":").pop() ?? outboundMsgIdRaw
      : outboundMsgIdRaw;
    console.log("outboundMsgId resolved:", outboundMsgId, "(raw:", outboundMsgIdRaw, ")| keys:", Object.keys(sendData || {}).join(","));

    const { error: insertErr } = await adminClient.from("whatsapp_messages").insert({
      client_id,
      ticket_id: ticket_id || null,
      direction: "outbound",
      message_text: savedText,
      media_url: outboundMediaUrl || null,
      sender_phone: cleanPhone,
      status: "sent",
      manychat_message_id: outboundMsgId || null,
      instance_id: useInstanceId,
    });

    if (insertErr) console.error("Failed to save outbound message:", insertErr);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
