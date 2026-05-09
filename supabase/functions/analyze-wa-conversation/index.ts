// supabase/functions/analyze-wa-conversation/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENCLAW_URL = Deno.env.get("OPENCLAW_URL")!;
const OPENCLAW_TOKEN = Deno.env.get("OPENCLAW_HOOKS_TOKEN")!;

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

function formatThread(messages: { direction: string; message_text: string; created_at: string }[]) {
  return messages.map(m => {
    const time = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const dir  = m.direction === "inbound" ? "CLIENTE" : "ATENDENTE";
    return `${time} [${dir}] ${m.message_text}`;
  }).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Autenticação do chamador (usuário ou pg_cron via service role)
  const authHeader = req.headers.get("Authorization") ?? "";
  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await sbUser.auth.getUser();
  // Aceita chamada autenticada de usuário OU com service role key diretamente
  const isServiceRole = authHeader.includes(SERVICE_KEY);
  if (!user && !isServiceRole) return json({ error: "Unauthorized" }, 401);

  const { client_id, user_id } = await req.json();
  if (!client_id) return json({ error: "client_id obrigatório" }, 400);

  // 1. Buscar settings
  const { data: settings } = await sbAdmin
    .from("wa_analysis_settings")
    .select("*")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .single();
  const agentId = settings?.agent_id ?? "agente-feedback-wa";
  const threshold = settings?.alert_threshold ?? 5.0;

  // 2. Buscar thread
  const { data: messages } = await sbAdmin
    .from("whatsapp_messages")
    .select("direction, message_text, created_at, instance_id, pipeline_whatsapp_instances(user_id)")
    .eq("client_id", client_id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (!messages || messages.length === 0) {
    return json({ error: "Nenhuma mensagem encontrada para este cliente" }, 404);
  }

  const instanceUserId = (messages[0] as any).pipeline_whatsapp_instances?.user_id ?? user_id ?? user?.id;
  const instanceId = (messages[0] as any).instance_id ?? null;
  const thread = formatThread(messages);

  // 3. Montar prompt
  const prompt = `Você é um analista de qualidade de atendimento. Analise a conversa de WhatsApp abaixo entre um atendente e um cliente.

Retorne APENAS um objeto JSON válido, sem markdown, sem texto antes ou depois:
{
  "score_overall": <número 0-10>,
  "score_response_time": <número 0-10>,
  "score_tone": <número 0-10>,
  "score_commercial": <número 0-10>,
  "alert_level": "<ok|warning|critical>",
  "summary": "<resumo em 2 frases>",
  "recommendations": ["<rec1>", "<rec2>"]
}

Critérios:
- score_response_time: velocidade e consistência das respostas do atendente
- score_tone: educação, clareza e profissionalismo
- score_commercial: avanço no funil, aproveitamento de oportunidade comercial
- score_overall: média ponderada (tone 40%, commercial 35%, response_time 25%)
- alert_level: "critical" se score_overall < ${threshold}, "warning" se < ${threshold + 2}, "ok" caso contrário

CONVERSA:
${thread}`;

  const webhookUrl = `${SUPABASE_URL}/functions/v1/wa-feedback-webhook`;
  const runName = `feedback-wa-${client_id.slice(0, 8)}-${Date.now()}`;

  // 4. Chamar OpenClaw
  const hookRes = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENCLAW_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: prompt,
      agentId,
      deliver: "webhook",
      to: webhookUrl,
      thinking: "low",
      timeoutSeconds: 120,
      name: runName,
    }),
  });

  if (!hookRes.ok) {
    const err = await hookRes.text();
    return json({ error: `OpenClaw error: ${err}` }, 502);
  }

  const { runId } = await hookRes.json();

  // 5. Inserir wa_feedbacks pending
  await sbAdmin.from("wa_feedbacks").insert({
    client_id,
    user_id: instanceUserId,
    instance_id: instanceId,
    status: "pending",
    run_id: runId,
  });

  return json({ ok: true, run_id: runId });
});
