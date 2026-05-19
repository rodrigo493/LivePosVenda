// supabase/functions/suggest-wa-response/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

// Slug do modelo no OpenRouter — confirmar contra https://openrouter.ai/models
const MODEL = "anthropic/claude-haiku-4.5";

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

  if (!OPENROUTER_API_KEY) {
    console.error("[suggest-wa] OPENROUTER_API_KEY não configurado");
    return json({ error: "Configuração incompleta: OPENROUTER_API_KEY ausente" }, 500);
  }

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

  // Instância WhatsApp ativa do usuário
  const { data: instance } = await sbAdmin
    .from("pipeline_whatsapp_instances")
    .select("id")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  // Últimas 10 mensagens do cliente, em ordem cronológica
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

  const systemPrompt = `Você é um copiloto de vendas consultivas da Live Equipamentos, fabricante brasileira de equipamentos de Pilates com inteligência artificial embarcada. Você ajuda um vendedor da Live sugerindo a próxima resposta a ser enviada para um lead no WhatsApp.

Diretrizes:
- Tom consultivo, cordial e profissional, em português do Brasil. Nunca agressivo ou insistente.
- Foque em entender a necessidade do lead, gerar valor e avançar a conversa no funil de vendas.
- Seja objetivo: a sugestão deve ser uma mensagem pronta para enviar, curta o suficiente para WhatsApp.
- Se o lead pedir algo que exige decisão humana (preço final, condição especial de pagamento, prazo de entrega, reclamação) ou demonstrar irritação, sugira que o vendedor assuma a conversa pessoalmente.
- Não invente informações sobre produtos, preços ou prazos que não estejam no histórico.

Responda APENAS com o texto da mensagem sugerida, sem aspas, sem markdown, sem comentários antes ou depois.`;

  const userPrompt = `HISTÓRICO (últimas mensagens):
${historyText}

MENSAGEM DO LEAD:
${inbound_text}`;

  // Chamar o OpenRouter (síncrono)
  let suggestionText = "";
  let runId: string | null = null;
  let callOk = true;
  try {
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "LivePosVenda - Copiloto WA",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 500,
      }),
    });
    if (!orRes.ok) {
      console.warn("[suggest-wa] OpenRouter status:", orRes.status, await orRes.text());
      callOk = false;
    } else {
      const orBody = await orRes.json();
      suggestionText = (orBody?.choices?.[0]?.message?.content ?? "").trim();
      runId = orBody?.id ?? null;
    }
  } catch (e) {
    console.warn("[suggest-wa] OpenRouter fetch error:", String(e));
    callOk = false;
  }

  const status = callOk && suggestionText ? "done" : "error";

  // Grava o resultado já finalizado — a extensão faz polling e acha pronto no 1º poll
  const { data: suggestion, error: insErr } = await sbAdmin
    .from("wa_suggestions")
    .insert({
      client_id,
      user_id: user.id,
      instance_id: instance?.id ?? null,
      inbound_message: inbound_text,
      suggested_response: suggestionText || null,
      status,
      run_id: runId,
    })
    .select("id")
    .single();
  if (insErr) {
    console.error("[suggest-wa] insert wa_suggestions falhou:", insErr.message);
    return json({ error: `Falha ao gravar sugestão: ${insErr.message}` }, 500);
  }

  return json({ ok: status === "done", suggestion_id: suggestion?.id });
});
