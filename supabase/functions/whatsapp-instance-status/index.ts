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
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { instance_id } = await req.json();
    if (!instance_id) {
      return new Response(JSON.stringify({ error: "instance_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: instance, error: instError } = await adminClient
      .from("pipeline_whatsapp_instances")
      .select("id, user_id, instance_token, base_url, phone_number")
      .eq("id", instance_id)
      .single();

    if (instError || !instance) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Autorização: dono da instância OU admin
    const isOwner = instance.user_id === user.id;
    if (!isOwner) {
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isAdmin = roles?.some((r: { role: string }) => r.role === "admin");
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const token = instance.instance_token;
    const baseUrl = (instance.base_url || "https://liveuni.uazapi.com").replace(/\/$/, "");

    // Verifica estado da conexão
    const stateRes = await fetch(`${baseUrl}/instance/connectionState`, {
      headers: { token },
    });
    const stateData = await stateRes.json().catch(() => ({}));
    // Uazapi GO: { instance: { state: "open"|"close"|"connecting" } } ou { state: "..." }
    const state: string = stateData?.instance?.state ?? stateData?.state ?? "close";

    let qrcode: string | null = null;
    let phone: string | null = null;

    if (state !== "open") {
      const qrRes = await fetch(`${baseUrl}/instance/qrcode`, {
        headers: { token },
      });
      const qrData = await qrRes.json().catch(() => ({}));
      qrcode = qrData?.qrcode ?? qrData?.qr ?? qrData?.base64 ?? null;
    } else {
      const infoRes = await fetch(`${baseUrl}/instance/info`, {
        headers: { token },
      });
      const infoData = await infoRes.json().catch(() => ({}));
      const wid: string | null =
        infoData?.instance?.wid ??
        infoData?.wid ??
        infoData?.phone ??
        infoData?.instance?.phone ??
        null;

      if (wid) {
        phone = wid.includes("@") ? wid.split("@")[0] : wid;
        if (phone && phone !== instance.phone_number) {
          await adminClient
            .from("pipeline_whatsapp_instances")
            .update({ phone_number: phone })
            .eq("id", instance_id);
        }
      }
    }

    return new Response(
      JSON.stringify({ state, qrcode, phone }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in whatsapp-instance-status:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
