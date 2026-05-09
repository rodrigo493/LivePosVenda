// supabase/functions/suggest-wa-response/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY        = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENCLAW_URL    = Deno.env.get("OPENCLAW_URL")!;
const OPENCLAW_TOKEN  = Deno.env.get("OPENCLAW_HOOKS_TOKEN")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { client_id, inbound_text } = await req.json();
  if (!client_id || !inbound_text) {
    return json({ error: "client_id e inbound_text são obrigatórios" }, 400);
  }

  // Buscar instância ativa do usuário
  const { data: instance } = await sbAdmin
    .from("pipeline_whatsapp_instances")
    .select("id")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  // Buscar últimas 10 mensagens do cliente (ordem cronológica)
  const { data: history } = await sbAdmin
    .from("whatsapp_messages")
    .select("direction, message_text, created_at")
    .eq("client_id", client_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const chronological = (history ?? []).reverse();

  const historyText = chronological.map(m => {
    const time = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const dir  = m.direction === "inbound" ? "CLIENTE" : "ATENDENTE";
    return `${time} [${dir}] ${m.message_text}`;
  }).join("\n");

  const prompt = `Você é um assistente de vendas e atendimento da Live Equipamentos, fabricante de equipamentos de Pilates com IA embarcada.
Analise a conversa abaixo e sugira UMA resposta para a última mensagem recebida do lead/cliente.
Seja direto, profissional e natural. Retorne APENAS o texto da resposta, sem explicações, sem aspas, sem prefixos.

HISTÓRICO DA CONVERSA:
${historyText}

ÚLTIMA MENSAGEM DO LEAD:
${inbound_text}`;

  const webhookUrl = `${SUPABASE_URL}/functions/v1/wa-feedback-webhook`;
  const runName = `suggest-wa-${client_id.slice(0, 8)}-${Date.now()}`;

  const hookRes = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENCLAW_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: prompt,
      agentId: "agente-feedback-wa",
      deliver: "webhook",
      to: webhookUrl,
      thinking: "low",
      timeoutSeconds: 60,
      name: runName,
    }),
  });

  if (!hookRes.ok) {
    const err = await hookRes.text();
    return json({ error: `OpenClaw error: ${err}` }, 502);
  }

  const { runId } = await hookRes.json();

  // Inserir suggestion pending
  const { data: suggestion } = await sbAdmin
    .from("wa_suggestions")
    .insert({
      client_id,
      user_id: user.id,
      instance_id: instance?.id ?? null,
      inbound_message: inbound_text,
      status: "pending",
      run_id: runId,
    })
    .select("id")
    .single();

  return json({ ok: true, suggestion_id: suggestion?.id, run_id: runId });
});
