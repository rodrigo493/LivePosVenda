import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const AI_API_KEY   = Deno.env.get("AI_API_KEY");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Important 1: sbAdmin at module scope — created once, not per-request
const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

interface MediaItem  { type: "image" | "video"; url: string }
interface ChatMsg    { role: "user" | "assistant"; content: string }
interface MemoriaRow { modelo_aparelho: string; sintoma: string; solucao_md: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Important 4: reject non-POST methods early
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return jsonRes({ error: "Unauthorized" }, 401);

  let body: { message: string; history?: ChatMsg[]; media?: MediaItem[] };
  try { body = await req.json(); }
  catch { return jsonRes({ error: "JSON inválido" }, 400); }

  const { message = "", history = [], media = [] } = body;
  if (!message.trim() && media.length === 0) {
    return jsonRes({ error: "message ou media são obrigatórios" }, 400);
  }

  // Critical 1: only allow https:// media URLs (blocks SSRF via file://, internal IPs, etc.)
  const safeMedia = media.filter(m => typeof m.url === "string" && m.url.startsWith("https://"));

  // Critical 2: sanitize history — only valid roles and string content
  const safeHistory = history
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10);

  // Important 3: run independent DB queries in parallel
  const [agenteResult, memorias] = await Promise.all([
    sbAdmin
      .from("agentes_config")
      .select("soul_prompt")
      .eq("nome", "PosVenda")
      .eq("ativo", true)
      .single(),
    buscarMemoria(sbAdmin, message),
  ]);
  const agente = agenteResult.data;

  const memCtx = memorias.length > 0
    ? "\n\nSOLUÇÕES CONHECIDAS NA BASE INTERNA:\n" +
      memorias.map((m, i) =>
        `[${i + 1}] Modelo: ${m.modelo_aparelho} | Sintoma: ${m.sintoma.slice(0, 100)}\nSolução: ${m.solucao_md.slice(0, 300)}`
      ).join("\n\n")
    : "";

  const systemPrompt =
    (agente?.soul_prompt ?? "Você é a Laivinha, assistente técnica de pós-venda da Live Equipamentos.") +
    memCtx;

  const aiMessages: unknown[] = [
    { role: "system", content: systemPrompt },
    ...safeHistory,
  ];

  const userText = message.trim() || "Analise esta mídia e me diga o que está errado.";
  if (safeMedia.length > 0) {
    const parts: unknown[] = [{ type: "text", text: userText }];
    for (const m of safeMedia) {
      parts.push({ type: "image_url", image_url: { url: m.url } });
    }
    aiMessages.push({ role: "user", content: parts });
  } else {
    aiMessages.push({ role: "user", content: userText });
  }

  // (safeMedia used above; original media variable no longer referenced beyond this point)

  let reply = "";
  if (AI_API_KEY) {
    try {
      const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${AI_API_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          model:       "google/gemini-2.5-flash",
          messages:    aiMessages,
          max_tokens:  500,
          temperature: 0.2,
        }),
      });
      if (aiRes.ok) {
        const data = await aiRes.json();
        reply = data.choices?.[0]?.message?.content ?? "";
      } else {
        console.error("AI error:", aiRes.status, await aiRes.text().catch(() => ""));
      }
    } catch (e) {
      console.error("AI call failed:", e);
    }
  }

  if (!reply) {
    reply = memorias.length > 0
      ? "Com base na minha base de conhecimento:\n\n" +
        memorias.map((m) =>
          `**${m.modelo_aparelho}**\n${m.sintoma.slice(0, 80)}\n\n${m.solucao_md.slice(0, 400)}`
        ).join("\n\n---\n\n")
      : "Não encontrei soluções para esta consulta. Tente descrever o modelo e o sintoma com mais detalhes.";
  }

  return jsonRes({ reply, sources: memorias.length });
});

async function buscarMemoria(
  sb: ReturnType<typeof createClient>,
  query: string,
): Promise<MemoriaRow[]> {
  const models = ["V12", "V5 Plus", "V4", "V8X", "V1", "V2", "V6", "V8 Plus", "V5X"];
  const detected = models.find((m) => query.toUpperCase().includes(m.toUpperCase()));

  if (detected) {
    // Important 2: log DB errors instead of silently discarding them
    const { data, error } = await sb
      .from("memoria_problema_solucao")
      .select("modelo_aparelho, sintoma, solucao_md")
      .eq("aprovada", true)
      .ilike("modelo_aparelho", `%${detected}%`)
      .limit(3);
    if (error) console.error("buscarMemoria error:", error.message);
    if (data && data.length > 0) return data as MemoriaRow[];
  }

  const palavras = query
    .replace(/[^a-záàâãéêíóôõúüçñ\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" ");

  if (palavras.trim()) {
    // Important 2: log DB errors instead of silently discarding them
    const { data, error } = await (sb as any)
      .from("memoria_problema_solucao")
      .select("modelo_aparelho, sintoma, solucao_md")
      .eq("aprovada", true)
      .textSearch("ts_search", palavras, { config: "portuguese", type: "plain" })
      .limit(3);
    if (error) console.error("buscarMemoria error:", error.message);
    if (data && data.length > 0) return data as MemoriaRow[];
  }

  return [];
}
