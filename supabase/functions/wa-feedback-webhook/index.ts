// supabase/functions/wa-feedback-webhook/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("OPENCLAW_WEBHOOK_SECRET") ?? "";

const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function parseAgentOutput(raw: string) {
  // Parser defensivo — LLM pode retornar JSON dentro de markdown
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Valida secret embutido na URL — OpenClaw não envia header próprio no callback
  if (WEBHOOK_SECRET) {
    const urlSecret = new URL(req.url).searchParams.get("secret") ?? "";
    if (urlSecret !== WEBHOOK_SECRET) return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json();

  // Salva body bruto para debug na v1 (campo do OpenClaw não documentado publicamente)
  const rawBody = JSON.stringify(body);

  // OpenClaw pode entregar o resultado em qualquer destes campos
  const raw: string = body.output ?? body.text ?? body.message ?? body.content ?? body.result ?? "";
  const runId: string = body.runId ?? body.run_id ?? "";

  if (!runId) return json({ error: "runId ausente no payload" }, 400);

  // Buscar feedback pending por run_id
  const { data: feedback } = await sbAdmin
    .from("wa_feedbacks")
    .select("id, user_id")
    .eq("run_id", runId)
    .eq("status", "pending")
    .maybeSingle();

  if (!feedback) {
    // Pode ser uma sugestão — tentar wa_suggestions
    const { data: suggestion } = await sbAdmin
      .from("wa_suggestions")
      .select("id")
      .eq("run_id", runId)
      .eq("status", "pending")
      .maybeSingle();

    if (suggestion) {
      const text = raw.trim();
      await sbAdmin
        .from("wa_suggestions")
        .update({ suggested_response: text, status: text ? "done" : "error" })
        .eq("id", suggestion.id);
      return json({ ok: true });
    }

    return json({ error: "run_id não encontrado" }, 404);
  }

  // Parsear JSON do feedback
  const data = parseAgentOutput(raw);

  if (!data) {
    await sbAdmin
      .from("wa_feedbacks")
      .update({ status: "error", raw_response: rawBody })
      .eq("id", feedback.id);
    return json({ ok: true, warning: "parse falhou — raw_response salvo" });
  }

  const {
    score_overall, score_response_time, score_tone, score_commercial,
    alert_level, summary, recommendations,
  } = data;

  await sbAdmin.from("wa_feedbacks").update({
    score_overall, score_response_time, score_tone, score_commercial,
    alert_level, summary,
    recommendations: JSON.stringify(recommendations ?? []),
    status: "done",
    raw_response: rawBody,
  }).eq("id", feedback.id);

  // Disparar alertas se critical
  if (alert_level === "critical" && feedback.user_id) {
    const { data: feedbackFull } = await sbAdmin
      .from("wa_feedbacks")
      .select("client_id, clients(name, phone)")
      .eq("id", feedback.id)
      .maybeSingle();

    const clientName = (feedbackFull as any)?.clients?.name
      ?? (feedbackFull as any)?.clients?.phone
      ?? "cliente";

    const notifBase = {
      type: "wa_feedback_alert",
      title: "⚠️ Conversa crítica detectada",
      body: `A conversa com ${clientName} foi avaliada abaixo do threshold. Nota: ${score_overall}`,
      link: `/minhas-conversas-wa`,
    };

    // Notificar usuário
    await sbAdmin.from("notifications").insert({ ...notifBase, user_id: feedback.user_id });

    // Notificar todos admins
    const { data: admins } = await sbAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (admins && admins.length > 0) {
      const adminNotifs = admins
        .filter((a: { user_id: string }) => a.user_id !== feedback.user_id)
        .map((a: { user_id: string }) => ({
          ...notifBase,
          user_id: a.user_id,
          link: `/admin/conversas`,
        }));
      if (adminNotifs.length > 0) {
        await sbAdmin.from("notifications").insert(adminNotifs);
      }
    }
  }

  return json({ ok: true });
});
