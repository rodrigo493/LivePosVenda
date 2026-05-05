import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL") || "https://liveuni.uazapi.com";
    const UAZAPI_INSTANCE_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "c6a355b6-c741-47c1-b1e6-c48938dd477b";

    const { client_id, phone, instance_id } = await req.json();
    if (!client_id || !phone) {
      return new Response(JSON.stringify({ error: "client_id and phone required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve token/base_url from instance_id
    let token = UAZAPI_INSTANCE_TOKEN;
    let baseUrl = UAZAPI_BASE_URL;
    if (instance_id) {
      const { data: inst } = await admin
        .from("pipeline_whatsapp_instances")
        .select("instance_token, base_url")
        .eq("id", instance_id)
        .eq("active", true)
        .maybeSingle();
      if ((inst as any)?.instance_token) {
        token = (inst as any).instance_token;
        baseUrl = (inst as any).base_url || UAZAPI_BASE_URL;
      }
    }

    // Build chatId — Uazapi/WuzAPI expects {number}@s.whatsapp.net
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length <= 11) cleanPhone = "55" + cleanPhone;
    const chatId = `${cleanPhone}@s.whatsapp.net`;

    // Fetch profile picture URL from Uazapi
    const picRes = await fetch(
      `${baseUrl}/chat/getProfilePicture?chatId=${encodeURIComponent(chatId)}&preview=0`,
      { headers: { token } }
    );

    let avatarUrl: string | null = null;

    if (picRes.ok) {
      const picData = await picRes.json();
      // WuzAPI returns { eurl, url, tag } — eurl is the high-res URL
      avatarUrl = picData?.eurl || picData?.url || null;
      console.log("Profile pic response:", JSON.stringify(picData).slice(0, 200));
    } else {
      const errText = await picRes.text();
      console.log("Profile pic fetch failed:", picRes.status, errText.slice(0, 200));
    }

    // Save to clients.avatar_url if we got a URL
    if (avatarUrl) {
      await admin
        .from("clients")
        .update({ avatar_url: avatarUrl })
        .eq("id", client_id);
    }

    return new Response(JSON.stringify({ url: avatarUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get-whatsapp-avatar error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
