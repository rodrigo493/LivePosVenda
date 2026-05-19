// supabase/functions/analyze-wa-conversation/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

// Slug do modelo no OpenRouter — confirmar contra https://openrouter.ai/models
const MODEL = "anthropic/claude-sonnet-4.6";

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

// Parser defensivo — o modelo pode devolver JSON dentro de markdown
function parseAgentOutput(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!OPENROUTER_API_KEY) {
    console.error("[analyze-wa] OPENROUTER_API_KEY não configurado");
    return json({ error: "Configuração incompleta: OPENROUTER_API_KEY ausente" }, 500);
  }

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

  // 1. Buscar settings (threshold de alerta)
  const { data: settings } = await sbAdmin
    .from("wa_analysis_settings")
    .select("*")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .single();
  const threshold = settings?.alert_threshold ?? 5.0;

  // 2. Buscar thread
  const { data: messages, error: msgErr } = await sbAdmin
    .from("whatsapp_messages")
    .select("direction, message_text, created_at, instance_id")
    .eq("client_id", client_id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (msgErr) return json({ error: `DB error: ${msgErr.message}` }, 500);
  if (!messages || messages.length === 0) {
    return json({ error: `Nenhuma mensagem para client_id=${client_id}` }, 404);
  }

  const instanceId = (messages[0] as any).instance_id ?? null;

  // Resolve o user_id responsável: body > JWT > instância WhatsApp
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

  // 3. Montar prompts
  const systemPrompt = `Você é um analista de qualidade de atendimento da Live Equipamentos, fabricante brasileira de equipamentos de Pilates. Sua função é avaliar conversas de WhatsApp entre um atendente da Live e um cliente/lead.

Avalie a conversa segundo três dimensões, cada uma de 0 a 10:
- score_response_time: velocidade e consistência das respostas do atendente.
- score_tone: educação, clareza e profissionalismo do atendente.
- score_commercial: avanço no funil de vendas e aproveitamento da oportunidade comercial.

Calcule score_overall como a média ponderada com os pesos canônicos: tone 40%, commercial 35%, response_time 25%.

Defina alert_level assim: "critical" se score_overall < ${threshold}; "warning" se score_overall < ${threshold + 2}; "ok" caso contrário.

Escreva summary como um resumo objetivo da conversa em no máximo 2 frases, em português. Escreva recommendations como uma lista de 2 a 3 recomendações práticas e acionáveis para o atendente melhorar, em português.

Responda APENAS com um objeto JSON válido, sem markdown, sem texto antes ou depois, exatamente neste formato:
{
  "score_overall": <número 0-10>,
  "score_response_time": <número 0-10>,
  "score_tone": <número 0-10>,
  "score_commercial": <número 0-10>,
  "alert_level": "<ok|warning|critical>",
  "summary": "<resumo em até 2 frases>",
  "recommendations": ["<rec1>", "<rec2>"]
}`;

  const userPrompt = `CONVERSA:\n${thread}`;

  // 4. Chamar o OpenRouter (síncrono)
  let orRes: Response;
  try {
    orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "LivePosVenda - Analise WA",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });
  } catch (fetchErr) {
    console.error("[analyze-wa] fetch OpenRouter falhou:", fetchErr);
    return json({ error: `OpenRouter inacessível: ${String(fetchErr)}` }, 502);
  }

  if (!orRes.ok) {
    const err = await orRes.text();
    console.error("[analyze-wa] OpenRouter status:", orRes.status, "body:", err);
    return json({ error: `OpenRouter error ${orRes.status}: ${err}` }, 502);
  }

  const orBody = await orRes.json();
  const rawText: string = orBody?.choices?.[0]?.message?.content ?? "";
  const runId: string | null = orBody?.id ?? null;
  console.log("[analyze-wa] OpenRouter raw (200chars):", rawText.slice(0, 200));

  // 5. Parsear e gravar wa_feedbacks
  const parsed = parseAgentOutput(rawText);
  if (!parsed) {
    console.error("[analyze-wa] parse falhou — rawText length:", rawText.length);
    const { data: errRow, error: errInsErr } = await sbAdmin.from("wa_feedbacks").insert({
      client_id,
      user_id: instanceUserId,
      instance_id: instanceId,
      status: "error",
      run_id: runId,
      raw_response: rawText,
    }).select("id").single();
    if (errInsErr) console.error("[analyze-wa] insert wa_feedbacks (error) falhou:", errInsErr.message);
    return json({ error: "Resposta da IA não pôde ser interpretada", feedback_id: errRow?.id }, 502);
  }

  const {
    score_overall, score_response_time, score_tone, score_commercial,
    alert_level, summary, recommendations,
  } = parsed;

  const { data: fb, error: fbErr } = await sbAdmin.from("wa_feedbacks").insert({
    client_id,
    user_id: instanceUserId,
    instance_id: instanceId,
    score_overall, score_response_time, score_tone, score_commercial,
    alert_level, summary,
    recommendations: JSON.stringify(Array.isArray(recommendations) ? recommendations : []),
    status: "done",
    run_id: runId,
    raw_response: rawText,
  }).select("id").single();
  if (fbErr) {
    console.error("[analyze-wa] insert wa_feedbacks falhou:", fbErr.message);
    return json({ error: `Falha ao gravar feedback: ${fbErr.message}` }, 500);
  }

  // 6. Disparar notificações se a conversa for crítica
  if (alert_level === "critical" && instanceUserId) {
    const { data: clientRow } = await sbAdmin
      .from("clients")
      .select("name, phone")
      .eq("id", client_id)
      .maybeSingle();
    const clientName = clientRow?.name ?? clientRow?.phone ?? "cliente";

    const notifBase = {
      type: "wa_feedback_alert",
      title: "⚠️ Conversa crítica detectada",
      body: `A conversa com ${clientName} foi avaliada abaixo do threshold. Nota: ${score_overall}`,
      link: "/minhas-conversas-wa",
    };

    await sbAdmin.from("notifications").insert({ ...notifBase, user_id: instanceUserId });

    const { data: admins } = await sbAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminNotifs = (admins ?? [])
      .filter((a: { user_id: string }) => a.user_id !== instanceUserId)
      .map((a: { user_id: string }) => ({ ...notifBase, user_id: a.user_id, link: "/admin/conversas" }));
    if (adminNotifs.length > 0) {
      await sbAdmin.from("notifications").insert(adminNotifs);
    }
  }

  return json({ ok: true, feedback_id: fb?.id, score_overall, alert_level });
});
