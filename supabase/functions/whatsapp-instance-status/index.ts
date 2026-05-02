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

    let body: { instance_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { instance_id } = body;
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

    // ── 1. Verifica estado da conexão ──────────────────────────────────────
    const stateRes = await fetch(`${baseUrl}/instance/connectionState`, {
      headers: { token },
    });
    const stateRaw = await stateRes.text();
    console.log(`[state] status=${stateRes.status} body=${stateRaw.slice(0, 400)}`);
    const stateData = JSON.parse(stateRaw || "{}");

    // Uazapi GO retorna { instance: { state } } ou { state } ou { State }
    const state: string =
      stateData?.instance?.state ??
      stateData?.state ??
      stateData?.State ??
      "close";

    let qrcode: string | null = null;
    let phone: string | null = null;

    if (state === "open") {
      // ── 2a. Conectado: busca número e atualiza banco ───────────────────
      const infoRes = await fetch(`${baseUrl}/instance/info`, { headers: { token } });
      const infoRaw = await infoRes.text();
      console.log(`[info] status=${infoRes.status} body=${infoRaw.slice(0, 400)}`);
      const infoData = JSON.parse(infoRaw || "{}");

      const wid: string | null =
        infoData?.instance?.wid ??
        infoData?.wid ??
        infoData?.phone ??
        infoData?.instance?.phone ??
        null;

      if (wid) {
        phone = wid.includes("@") ? wid.split("@")[0] : wid;
        if (phone && phone !== instance.phone_number) {
          const { error: updateErr } = await adminClient
            .from("pipeline_whatsapp_instances")
            .update({ phone_number: phone })
            .eq("id", instance_id);
          if (updateErr) console.error("Failed to update phone_number:", updateErr);
        }
      }
    } else {
      // ── 2b. Desconectado/conectando: reinicia se necessário e busca QR ──
      if (state === "close") {
        // Reinicia a instância para entrar em modo "connecting" e gerar QR
        const restartRes = await fetch(`${baseUrl}/instance/restart`, {
          method: "GET",
          headers: { token },
        });
        const restartRaw = await restartRes.text();
        console.log(`[restart] status=${restartRes.status} body=${restartRaw.slice(0, 300)}`);
      }

      // Tenta buscar QR — pode demorar 1-2s após restart, mas polling no frontend compensa
      // Tenta endpoints alternativos caso o principal não retorne QR
      const qrEndpoints = ["/instance/qrcode", "/instance/qr"];
      for (const endpoint of qrEndpoints) {
        const qrRes = await fetch(`${baseUrl}${endpoint}`, { headers: { token } });
        const qrRaw = await qrRes.text();
        console.log(`[qr ${endpoint}] status=${qrRes.status} body=${qrRaw.slice(0, 500)}`);

        let qrData: any = {};
        try { qrData = JSON.parse(qrRaw); } catch { /* imagem raw ou erro */ }

        // Tenta campos mais comuns da resposta Uazapi
        const candidate =
          qrData?.qrcode ??
          qrData?.qr ??
          qrData?.base64 ??
          qrData?.QRcode ??
          qrData?.qrCode ??
          qrData?.image ??
          null;

        if (candidate) {
          qrcode = candidate;
          break;
        }

        // Alguns endpoints retornam a imagem PNG diretamente (content-type image/png)
        const ct = qrRes.headers.get("content-type") || "";
        if (ct.startsWith("image/")) {
          // converte para data URL
          qrcode = `data:${ct};base64,${btoa(qrRaw)}`;
          break;
        }
      }

      console.log(`[result] state=${state} hasQR=${!!qrcode}`);
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
