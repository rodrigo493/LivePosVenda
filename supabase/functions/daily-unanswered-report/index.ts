import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const UAZAPI_INSTANCE_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "c6a355b6-c741-47c1-b1e6-c48938dd477b";
const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL") || "https://liveuni.uazapi.com";

function calcBusinessHours(from: Date, to: Date): number {
  if (from >= to) return 0;
  let hours = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    const day = cursor.getDay();
    if (day === 0) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(8, 0, 0, 0); continue; }
    if (day === 6) { cursor.setDate(cursor.getDate() + 2); cursor.setHours(8, 0, 0, 0); continue; }
    const h = cursor.getHours();
    if (h < 8) { cursor.setHours(8, 0, 0, 0); continue; }
    if (h >= 17) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(8, 0, 0, 0); continue; }
    const endOfSlot = new Date(cursor);
    endOfSlot.setHours(17, 0, 0, 0);
    const until = to < endOfSlot ? to : endOfSlot;
    hours += (until.getTime() - cursor.getTime()) / 3_600_000;
    cursor.setTime(until.getTime());
    if (cursor >= endOfSlot) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(8, 0, 0, 0); }
  }
  return hours;
}

Deno.serve(async (req) => {
  try {
    // Autenticação: worker_token do pg_cron ou header interno
    const workerToken = req.headers.get("x-worker-token");

    // Busca configuração com notification_phone
    const { data: config } = await admin
      .from("rd_integration_config")
      .select("id, is_active, notification_phone, worker_token, unanswered_ack_at")
      .eq("is_active", true)
      .not("notification_phone", "is", null)
      .limit(1)
      .maybeSingle();

    if (!config) {
      return new Response(JSON.stringify({ ok: false, reason: "config not found or notification_phone not set" }), { status: 200 });
    }

    // Valida o worker_token quando fornecido
    if (workerToken && workerToken !== config.worker_token) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid token" }), { status: 401 });
    }

    const now = new Date();
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Busca as últimas mensagens de cada cliente (última por cliente)
    const { data: messages } = await admin
      .from("whatsapp_messages")
      .select("client_id, direction, created_at, clients(name, phone, whatsapp)")
      .order("created_at", { ascending: false });

    if (!messages?.length) {
      return new Response(JSON.stringify({ ok: true, sent: false, reason: "no messages" }), { status: 200 });
    }

    // Agrupa por cliente, pega a última mensagem de cada um
    const lastByClient = new Map<string, { name: string; last_at: Date; direction: string }>();
    for (const msg of messages) {
      if (!msg.client_id) continue;
      const client = msg.clients as any;
      if (!client?.name) continue;
      if (!lastByClient.has(msg.client_id)) {
        lastByClient.set(msg.client_id, {
          name: client.name,
          last_at: new Date(msg.created_at),
          direction: msg.direction,
        });
      }
    }

    const ackAt = config.unanswered_ack_at ? new Date(config.unanswered_ack_at) : null;

    // Filtra: última mensagem é inbound, dentro dos últimos 30 dias, ≥ 12h úteis sem resposta
    // e chegou APÓS o último "zerar"
    const unanswered: { name: string; hours: number }[] = [];
    for (const conv of lastByClient.values()) {
      if (conv.direction !== "inbound") continue;
      if (conv.last_at < cutoff30d) continue;
      if (ackAt && conv.last_at <= ackAt) continue;
      const bh = calcBusinessHours(conv.last_at, now);
      if (bh >= 12) {
        unanswered.push({ name: conv.name, hours: Math.floor(bh) });
      }
    }

    if (unanswered.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: false, reason: "no unanswered" }), { status: 200 });
    }

    // Formata a mensagem
    unanswered.sort((a, b) => b.hours - a.hours);
    const lines = unanswered.slice(0, 20).map((u) => `• ${u.name} (${u.hours}h sem resposta)`).join("\n");
    const total = unanswered.length;
    const text =
      `📋 *Relatório diário — Cards sem resposta*\n` +
      `${total} ${total === 1 ? "cliente aguarda" : "clientes aguardam"} resposta há 12+ horas úteis:\n\n` +
      `${lines}` +
      (total > 20 ? `\n…e mais ${total - 20} clientes` : "") +
      `\n\n_LivePosVenda · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(now)}_`;

    // Envia via Uazapi
    let phone = config.notification_phone.replace(/\D/g, "");
    if (phone.length <= 11) phone = "55" + phone;

    const resp = await fetch(`${UAZAPI_BASE_URL}/send/text`, {
      method: "POST",
      headers: { token: UAZAPI_INSTANCE_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ number: phone, text }),
    });

    const result = await resp.json().catch(() => ({}));
    console.log("daily-unanswered-report sent:", total, "clients, status:", resp.status, JSON.stringify(result).slice(0, 200));

    // Zera o ack após enviar — novos cards só aparecem se chegarem mensagens depois deste instante
    await admin
      .from("rd_integration_config")
      .update({ unanswered_ack_at: now.toISOString() } as any)
      .eq("id", config.id);

    return new Response(
      JSON.stringify({ ok: true, sent: true, total, status: resp.status }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("daily-unanswered-report error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
