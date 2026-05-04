import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// uazapiGO v2 state mapping → nosso padrão interno
// A API retorna: { instance: { status: "connected" }, status: { connected: true, jid: "..." } }
// "status" no nível raiz é um OBJETO, não string — devemos usar instance.status ou status.connected
function normalizeState(raw: unknown): "open" | "close" | "connecting" {
  const s = String(raw ?? "").toLowerCase();
  if (s === "open" || s === "connected") return "open";
  if (s === "connecting") return "connecting";
  return "close";
}

function resolveRawState(data: any): string {
  // Tenta campos string primeiro (evita pegar o objeto "status" do nível raiz)
  const candidates = [
    data?.state,
    data?.State,
    typeof data?.status === "string" ? data.status : undefined,
    data?.instance?.state,
    data?.instance?.status,          // uazapiGO: instance.status = "connected"
    data?.status?.connected === true ? "connected" : undefined, // uazapiGO: status.connected = true
    data?.data?.state,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
  }
  return "disconnected";
}

// Extrai QR code de qualquer campo possível na resposta uazapiGO
function extractQr(data: any): string | null {
  const qr =
    data?.qrcode ??
    data?.qr ??
    data?.base64 ??
    data?.qrCode ??
    data?.QRcode ??
    data?.instance?.qrcode ??
    data?.instance?.qr ??
    data?.data?.qrcode ??
    data?.data?.qr ??
    null;
  // QR vazio ("") conta como nulo
  return qr && String(qr).length > 0 ? qr : null;
}

// Extrai telefone conectado da resposta uazapiGO
function extractPhone(data: any): string | null {
  const raw =
    data?.phone ??
    data?.wid ??
    data?.instance?.phone ??
    data?.instance?.wid ??
    data?.instance?.owner ??         // uazapiGO: instance.owner = "5519997296617"
    data?.status?.jid ??             // uazapiGO: status.jid = "55...@s.whatsapp.net"
    data?.data?.phone ??
    null;
  if (!raw) return null;
  const str = String(raw);
  // Remove parte depois de ":" ou "@": "5519997296617:14@s.whatsapp.net" → "5519997296617"
  return str.split(/[:@]/)[0];
}

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

    let body: { instance_id?: string; skip_connect?: boolean };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { instance_id, skip_connect } = body;
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

    // ── 1. Status atual (uazapiGO v2: GET /instance/status) ───────────────
    // Retorna: state (disconnected/connecting/connected) + qrcode se connecting
    const statusRes = await fetch(`${baseUrl}/instance/status`, {
      headers: { token },
    });
    const statusRaw = await statusRes.text();
    console.log(`[GET /instance/status] http=${statusRes.status} body=${statusRaw.slice(0, 500)}`);

    let statusData: any = {};
    try { statusData = JSON.parse(statusRaw); } catch { /* ignorar */ }

    const rawState = resolveRawState(statusData);
    let state = normalizeState(rawState);

    let qrcode: string | null = null;
    let phone: string | null = null;

    if (state === "connecting") {
      // QR code já vem no response do status quando connecting
      qrcode = extractQr(statusData);
    }

    if (state === "close" && !skip_connect) {
      // ── 2. Inicia conexão (gera QR) via POST /instance/connect ────────
      const connectRes = await fetch(`${baseUrl}/instance/connect`, {
        method: "POST",
        headers: { token, "Content-Type": "application/json" },
        body: JSON.stringify({}), // sem phone = gera QR code
      });
      const connectRaw = await connectRes.text();
      console.log(`[POST /instance/connect] http=${connectRes.status} body=${connectRaw.slice(0, 500)}`);

      let connectData: any = {};
      try { connectData = JSON.parse(connectRaw); } catch { /* ignorar */ }

      if (connectRes.ok) {
        // Pode já vir o QR na resposta do connect
        qrcode = extractQr(connectData);
        state = "connecting";
      }

      // Se QR não veio no connect, faz nova chamada ao status (já deve estar connecting)
      if (!qrcode) {
        const status2Res = await fetch(`${baseUrl}/instance/status`, { headers: { token } });
        const status2Raw = await status2Res.text();
        console.log(`[GET /instance/status 2] http=${status2Res.status} body=${status2Raw.slice(0, 500)}`);
        let status2Data: any = {};
        try { status2Data = JSON.parse(status2Raw); } catch { /* ignorar */ }
        qrcode = extractQr(status2Data);
        const rawState2 = status2Data?.state ?? status2Data?.status;
        if (rawState2 != null) state = normalizeState(rawState2);
      }
    }

    if (state === "open") {
      // ── 3. Conectado: extrai telefone e atualiza banco ─────────────────
      phone = extractPhone(statusData);
      if (phone && phone !== instance.phone_number) {
        const { error: updateErr } = await adminClient
          .from("pipeline_whatsapp_instances")
          .update({ phone_number: phone })
          .eq("id", instance_id);
        if (updateErr) console.error("Failed to update phone_number:", updateErr);
      }
    }

    console.log(`[result] state=${state} hasQR=${!!qrcode} phone=${phone}`);

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
