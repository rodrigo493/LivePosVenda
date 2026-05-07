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

    const { client_id, ticket_id, message, phone, media_base64, instance_id } = await req.json();

    if (!client_id || !phone) {
      return new Response(
        JSON.stringify({ error: "client_id and phone são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Envio de mídia fora de escopo na extensão
    if (media_base64) {
      return new Response(
        JSON.stringify({ error: "Envio de mídia pelo CRM temporariamente indisponível. Use somente texto." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!message) {
      return new Response(
        JSON.stringify({ error: "message é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length <= 11) cleanPhone = "55" + cleanPhone;

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let useInstanceId: string | null = null;

    // Prioridade 0: instance_id explícito
    if (instance_id) {
      const { data: explicitInst } = await adminClient
        .from("pipeline_whatsapp_instances")
        .select("id")
        .eq("id", instance_id)
        .eq("active", true)
        .maybeSingle();
      if ((explicitInst as any)?.id) useInstanceId = (explicitInst as any).id;
    }

    // Prioridade 1: último inbound no ticket
    if (!useInstanceId && ticket_id) {
      const { data: lastMsg } = await adminClient
        .from("whatsapp_messages")
        .select("instance_id")
        .eq("ticket_id", ticket_id)
        .eq("direction", "inbound")
        .not("instance_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (lastMsg?.[0]?.instance_id) useInstanceId = lastMsg[0].instance_id;
    }

    // Prioridade 2: instância vinculada ao usuário logado
    if (!useInstanceId) {
      const { data: userInst } = await adminClient
        .from("pipeline_whatsapp_instances")
        .select("id")
        .eq("user_id", user.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if ((userInst as any)?.id) useInstanceId = (userInst as any).id;
    }

    // Prioridade 3: último inbound do cliente
    if (!useInstanceId && client_id) {
      const { data: clientMsg } = await adminClient
        .from("whatsapp_messages")
        .select("instance_id")
        .eq("client_id", client_id)
        .eq("direction", "inbound")
        .not("instance_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if ((clientMsg as any)?.instance_id) useInstanceId = (clientMsg as any).instance_id;
    }

    if (!useInstanceId) {
      return new Response(
        JSON.stringify({ error: "Nenhuma instância WhatsApp encontrada para este usuário" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Inserir no relay — extensão do usuário da instância vai executar o envio
    const { error: pendingErr } = await adminClient
      .from("whatsapp_pending_sends")
      .insert({
        instance_id: useInstanceId,
        phone: cleanPhone,
        message,
        created_by: user.id,
      });

    if (pendingErr) throw new Error(`Erro ao enfileirar mensagem: ${pendingErr.message}`);

    // Inserir imediatamente em whatsapp_messages (outbound) para CRM mostrar sem esperar
    const { error: insertErr } = await adminClient.from("whatsapp_messages").insert({
      client_id,
      ticket_id: ticket_id || null,
      direction: "outbound",
      message_text: message,
      sender_phone: cleanPhone,
      status: "sent",
      instance_id: useInstanceId,
    });
    if (insertErr) console.error("Erro ao salvar outbound:", insertErr);

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
