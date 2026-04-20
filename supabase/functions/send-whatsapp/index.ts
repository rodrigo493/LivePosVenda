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

    const { client_id, ticket_id, message, phone, media_base64, media_mime_type, media_filename } = await req.json();

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
      const mediatype = isAudio ? "audio" : isImage ? "image" : "document";
      const caption = message || "";
      const filename = media_filename || `file.${ext}`;

      // Uazapi requires multipart/form-data with a "file" field
      const formData = new FormData();
      formData.append("number", cleanPhone);
      formData.append("mediatype", mediatype);
      if (caption) formData.append("caption", caption);
      if (!isAudio && !isImage) formData.append("fileName", filename);
      formData.append("file", new Blob([fileBytes], { type: media_mime_type }), filename);

      sendRes = await fetch(`${UAZAPI_BASE_URL}/send/media`, {
        method: "POST",
        headers: { token: UAZAPI_INSTANCE_TOKEN },
        body: formData,
      });

      savedText = isAudio ? `🎵 ${filename}` : isImage ? `🖼️ ${filename}` : `📎 ${filename}`;
    } else {
      sendRes = await fetch(`${UAZAPI_BASE_URL}/send/text`, {
        method: "POST",
        headers: { token: UAZAPI_INSTANCE_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ number: cleanPhone, text: message }),
      });
      savedText = message;
    }

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      throw new Error(`Uazapi error [${sendRes.status}]: ${JSON.stringify(sendData)}`);
    }

    const { error: insertErr } = await adminClient.from("whatsapp_messages").insert({
      client_id,
      ticket_id: ticket_id || null,
      direction: "outbound",
      message_text: savedText,
      media_url: outboundMediaUrl || null,
      sender_phone: cleanPhone,
      status: "sent",
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
