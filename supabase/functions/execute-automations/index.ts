import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SQUAD_URL = "https://squad.liveuni.com.br/api/pos-venda";
const POSVENDA_BASE = "https://posvenda.liveuni.com.br";

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const SQUAD_TOKEN = Deno.env.get("SQUAD_TOKEN") ?? "";
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") ?? "c6a355b6-c741-47c1-b1e6-c48938dd477b";
  const UAZAPI_BASE = Deno.env.get("UAZAPI_BASE_URL") ?? "https://liveuni.uazapi.com";

  // Claim up to 50 pending entries atomically
  const { data: entries, error: claimErr } = await supabase.rpc("claim_automation_queue", {
    batch_size: 50,
  });

  if (claimErr) {
    console.error("[execute-automations] claim error:", claimErr.message);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!entries || entries.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let processed = 0;

  for (const entry of entries as any[]) {
    try {
      // Load ticket with all joins needed for variable resolution
      const { data: ticket, error: tErr } = await supabase
        .from("tickets")
        .select(`
          id,
          client_id,
          assigned_to,
          pipeline_id,
          pipeline_stage,
          clients(name),
          users:assigned_to(name, phone),
          pipeline_stages!tickets_pipeline_stage_fkey(label),
          pipelines(name)
        `)
        .eq("id", entry.ticket_id)
        .single();

      if (tErr || !ticket) {
        await markFailed(supabase, entry.id, `Ticket não encontrado: ${tErr?.message ?? "null"}`);
        continue;
      }

      // Load the automation config
      const { data: automation, error: aErr } = await supabase
        .from("pipeline_stage_automations")
        .select("action_type, action_config")
        .eq("id", entry.automation_id)
        .single();

      if (aErr || !automation) {
        await markFailed(supabase, entry.id, `Automação não encontrada: ${aErr?.message ?? "null"}`);
        continue;
      }

      // Build variable substitution map
      const vars: Record<string, string> = {
        "{{cliente_nome}}": (ticket.clients as any)?.name ?? "",
        "{{tecnico_nome}}": (ticket.users as any)?.name ?? "",
        "{{tecnico_telefone}}": (ticket.users as any)?.phone ?? "",
        "{{etapa_nome}}": (ticket.pipeline_stages as any)?.label ?? "",
        "{{funil_nome}}": (ticket.pipelines as any)?.name ?? "",
        "{{ticket_numero}}": ticket.id.slice(0, 8).toUpperCase(),
      };

      const cfg = resolveVars(automation.action_config as Record<string, unknown>, vars);

      switch (automation.action_type) {
        case "whatsapp_message": {
          const { token: resolvedToken, base: resolvedBase } = await resolveInstanceForPipeline(
            supabase, ticket.pipeline_id, UAZAPI_TOKEN, UAZAPI_BASE
          );
          await executeWhatsApp(resolvedBase, resolvedToken, cfg);
          break;
        }
        case "create_task":
          await executeSquadFallback(SQUAD_TOKEN, ticket, cfg, "Tarefa");
          break;
        case "notify_user":
          await executeSquadFallback(SQUAD_TOKEN, ticket, cfg, "Notificação");
          break;
        default:
          console.log(`[execute-automations] action_type '${automation.action_type}' não implementado em v1`);
      }

      await markDone(supabase, entry.id);
      processed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[execute-automations] entry failed:", entry.id, msg);
      await markFailed(supabase, entry.id, msg);
    }
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { "Content-Type": "application/json" },
  });
});

// --- helpers ---

async function resolveInstanceForPipeline(
  supabase: any,
  pipelineId: string | null,
  fallbackToken: string,
  fallbackBase: string
): Promise<{ token: string; base: string }> {
  if (!pipelineId) return { token: fallbackToken, base: fallbackBase };

  const { data: instances } = await supabase
    .from("pipeline_whatsapp_instances")
    .select("instance_token, base_url, distribution_pct")
    .eq("pipeline_id", pipelineId)
    .eq("active", true)
    .gt("distribution_pct", 0);

  if (!instances?.length) return { token: fallbackToken, base: fallbackBase };

  const total = (instances as any[]).reduce((s: number, i: any) => s + i.distribution_pct, 0);
  let rand = Math.random() * total;
  for (const i of instances as any[]) {
    rand -= i.distribution_pct;
    if (rand <= 0) return { token: i.instance_token, base: i.base_url || fallbackBase };
  }
  const last = (instances as any[])[instances.length - 1];
  return { token: last.instance_token, base: last.base_url || fallbackBase };
}

function resolveVars(
  config: Record<string, unknown>,
  vars: Record<string, string>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === "string") {
      let result = v;
      for (const [varKey, varVal] of Object.entries(vars)) {
        result = result.replaceAll(varKey, varVal);
      }
      resolved[k] = result;
    } else {
      resolved[k] = v;
    }
  }
  return resolved;
}

async function executeWhatsApp(
  uazapiBase: string,
  uazapiToken: string,
  cfg: Record<string, unknown>
) {
  const rawPhone = (cfg.to as string) ?? "";
  const message = (cfg.message as string) ?? "";

  if (!rawPhone || !message) {
    throw new Error("whatsapp_message: campos 'to' e 'message' são obrigatórios");
  }

  let phone = rawPhone.replace(/\D/g, "");
  if (phone.length <= 11) phone = "55" + phone;

  const res = await fetch(`${uazapiBase}/send/text`, {
    method: "POST",
    headers: { token: uazapiToken, "Content-Type": "application/json" },
    body: JSON.stringify({ number: phone, text: message }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Uazapi [${res.status}]: ${text.slice(0, 300)}`);
  }
}

async function executeSquadFallback(
  squadToken: string,
  ticket: any,
  cfg: Record<string, unknown>,
  label: string
) {
  const ticketNum = ticket.id.slice(0, 8).toUpperCase();
  const url = `${POSVENDA_BASE}/crm/${ticket.id}`;
  const reference = `${label}: ${(cfg.title ?? cfg.message ?? ticketNum) as string}`.slice(0, 200);

  const res = await fetch(SQUAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${squadToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reference, url }),
  });

  // 409 = already exists in Squad, treat as success
  if (!res.ok && res.status !== 409) {
    const text = await res.text().catch(() => "");
    throw new Error(`Squad [${res.status}]: ${text.slice(0, 300)}`);
  }
}

async function markDone(supabase: any, id: string) {
  await supabase
    .from("pipeline_automation_queue")
    .update({ status: "done", executed_at: new Date().toISOString() })
    .eq("id", id);
}

async function markFailed(supabase: any, id: string, error: string) {
  await supabase
    .from("pipeline_automation_queue")
    .update({ status: "failed", error, executed_at: new Date().toISOString() })
    .eq("id", id);
}
