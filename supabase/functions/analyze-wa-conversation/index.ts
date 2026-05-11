// supabase/functions/analyze-wa-conversation/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const OPENCLAW_URL   = Deno.env.get("OPENCLAW_URL")!;
const OPENCLAW_TOKEN = Deno.env.get("OPENCLAW_HOOKS_TOKEN")!;
const WEBHOOK_SECRET = Deno.env.get("OPENCLAW_WEBHOOK_SECRET") ?? "";

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

  // Validação de env vars obrigatórias
  if (!OPENCLAW_URL || !OPENCLAW_TOKEN) {
    console.error("[analyze-wa] OPENCLAW_URL ou OPENCLAW_HOOKS_TOKEN não configurados");
    return json({ error: "Configuração incompleta: OPENCLAW_URL ou OPENCLAW_HOOKS_TOKEN ausente" }, 500);
  }
  console.log("[analyze-wa] OPENCLAW_URL:", OPENCLAW_URL.slice(0, 30) + "...");

  // Extrai usuário quando disponível (JWT na sessão do browser).
  // Não rejeita se null — função usa service_role para todas as ops de banco.
  const authHeader = req.headers.get("Authorization") ?? "";
  let userId: string | null = null;
  if (authHeader.startsWith("Bearer ")) {
    const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbUser.auth.getUser().catch(() => ({ data: { user: null } }));
    userId = user?.id ?? null;
  }

  let client_id: string, user_id: string | undefined;
  try {
    const body = await req.json();
    client_id = body.client_id;
    user_id = body.user_id;
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }
  console.log("[analyze-wa] client_id:", client_id, "user_id:", user_id, "userId:", userId);
  if (!client_id) return json({ error: "client_id obrigatório" }, 400);

  // 1. Buscar settings
  const { data: settings } = await sbAdmin
    .from("wa_analysis_settings")
    .select("*")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .single();
  const agentId = settings?.agent_id ?? "agente-feedback-wa";
  const threshold = settings?.alert_threshold ?? 5.0;
  console.log("[analyze-wa] agentId:", agentId, "threshold:", threshold);

  // 2. Buscar thread
  const { data: messages, error: msgErr } = await sbAdmin
    .from("whatsapp_messages")
    .select("direction, message_text, created_at, instance_id")
    .eq("client_id", client_id)
    .order("created_at", { ascending: true })
    .limit(100);

  console.log("[analyze-wa] client_id usado:", client_id, "messages count:", messages?.length ?? 0, "error:", msgErr?.message ?? null);
  if (msgErr) return json({ error: `DB error: ${msgErr.message}` }, 500);
  if (!messages || messages.length === 0) {
    // Diagnóstico extra: contar total de mensagens na tabela (sem filtro)
    const { count } = await sbAdmin.from("whatsapp_messages").select("*", { count: "exact", head: true });
    console.log("[analyze-wa] total messages na tabela:", count);
    return json({ error: `Nenhuma mensagem para client_id=${client_id} (total na tabela: ${count})` }, 404);
  }

  const instanceId = (messages[0] as any).instance_id ?? null;

  // Busca user_id da instância separadamente se tiver instance_id
  let instanceUserId: string | null = user_id ?? userId ?? null;
  if (instanceId) {
    const { data: inst } = await sbAdmin
      .from("pipeline_whatsapp_instances")
      .select("user_id")
      .eq("id", instanceId)
      .maybeSingle();
    instanceUserId = inst?.user_id ?? instanceUserId;
  }
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

  const webhookUrl = WEBHOOK_SECRET
    ? `${SUPABASE_URL}/functions/v1/wa-feedback-webhook?secret=${WEBHOOK_SECRET}`
    : `${SUPABASE_URL}/functions/v1/wa-feedback-webhook`;
  const runName = `feedback-wa-${client_id.slice(0, 8)}-${Date.now()}`;

  // 4. Chamar OpenClaw
  console.log("[analyze-wa] chamando OpenClaw, agentId:", agentId, "to:", webhookUrl.slice(0, 50));
  let hookRes: Response;
  try {
    hookRes = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
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
  } catch (fetchErr) {
    console.error("[analyze-wa] fetch OpenClaw falhou:", fetchErr);
    return json({ error: `OpenClaw inacessível: ${String(fetchErr)}` }, 502);
  }

  if (!hookRes.ok) {
    const err = await hookRes.text();
    console.error("[analyze-wa] OpenClaw status:", hookRes.status, "body:", err);
    return json({ error: `OpenClaw error ${hookRes.status}: ${err}` }, 502);
  }

  const rawText = await hookRes.text();
  console.log("[analyze-wa] OpenClaw raw (200chars):", rawText.slice(0, 200));
  let hookBody: any;
  try {
    hookBody = JSON.parse(rawText);
  } catch {
    return json({ error: `OpenClaw retornou não-JSON (status ${hookRes.status}): ${rawText.slice(0, 150)}` }, 502);
  }
  console.log("[analyze-wa] OpenClaw parsed runId:", hookBody?.runId);
  const { runId } = hookBody;

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
