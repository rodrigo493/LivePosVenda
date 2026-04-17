import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    if (cleanPhone.length <= 11) {
      cleanPhone = "55" + cleanPhone;
    }

    const headers = { token: UAZAPI_INSTANCE_TOKEN, "Content-Type": "application/json" };
    let sendRes: Response;
    let savedText: string;

    if (media_base64 && media_mime_type) {
      const isImage = media_mime_type.startsWith("image/");
      const endpoint = isImage ? `${UAZAPI_BASE_URL}/send/image` : `${UAZAPI_BASE_URL}/send/document`;

      const body = isImage
        ? { number: cleanPhone, image: media_base64, caption: message || "" }
        : { number: cleanPhone, document: media_base64, fileName: media_filename || "arquivo", caption: message || "" };

      sendRes = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
      savedText = isImage ? `🖼️ ${media_filename || "imagem"}` : `📎 ${media_filename || "arquivo"}`;
    } else {
      sendRes = await fetch(`${UAZAPI_BASE_URL}/send/text`, {
        method: "POST",
        headers,
        body: JSON.stringify({ number: cleanPhone, text: message }),
      });
      savedText = message;
    }

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      throw new Error(`Uazapi error [${sendRes.status}]: ${JSON.stringify(sendData)}`);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: insertErr } = await adminClient.from("whatsapp_messages").insert({
      client_id,
      ticket_id: ticket_id || null,
      direction: "outbound",
      message_text: savedText,
      sender_phone: cleanPhone,
      status: "sent",
    });

    if (insertErr) {
      console.error("Failed to save outbound message:", insertErr);
    }

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
