import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function norm(s: string): string {
  return s.toLowerCase()
    .replace(/[áàâãä]/g,"a").replace(/[éèêë]/g,"e")
    .replace(/[íìîï]/g,"i").replace(/[óòôõö]/g,"o")
    .replace(/[úùûü]/g,"u").replace(/[ç]/g,"c").trim();
}

Deno.serve(async (req) => {
  try {
    const body = await req.json() as Record<string, unknown>;

    // Diagnostic mode: return all pipelines + stages
    if (body.diagnostic) {
      const { data: pipelines } = await admin.from("pipelines").select("id, name").order("name");
      const result: Record<string, unknown[]> = {};
      for (const p of pipelines ?? []) {
        const { data: stages } = await admin.from("pipeline_stages").select("key, label, position").eq("pipeline_id", p.id).order("position");
        result[p.name] = stages ?? [];
      }
      return new Response(JSON.stringify({ ok: true, pipelines: result }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Cleanup mode: delete all tickets from a named pipeline
    if (body.cleanup_pipeline) {
      const { data: pipeline } = await admin.from("pipelines").select("id, name").ilike("name", `%${body.cleanup_pipeline}%`).limit(1).maybeSingle();
      if (!pipeline) return new Response(JSON.stringify({ ok: false, error: "Pipeline não encontrado" }), { status: 200 });
      const { count } = await admin.from("tickets").delete({ count: "exact" }).eq("pipeline_id", pipeline.id);
      return new Response(JSON.stringify({ ok: true, pipeline: pipeline.name, deleted: count }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Stage distribution: show how many tickets are in each stage for a pipeline
    if (body.stage_dist) {
      const { data: pipelines } = await admin.from("pipelines").select("id, name").ilike("name", "%vendas%");
      const result: Record<string, unknown> = {};
      for (const p of pipelines ?? []) {
        const { data: stages } = await admin.from("pipeline_stages").select("key, label").eq("pipeline_id", p.id).order("position");
        const { data: tickets } = await admin.from("tickets").select("pipeline_stage").eq("pipeline_id", p.id);
        const dist: Record<string, number> = {};
        for (const t of tickets ?? []) { dist[t.pipeline_stage] = (dist[t.pipeline_stage] ?? 0) + 1; }
        const stageLabels: Record<string, string> = {};
        for (const s of stages ?? []) stageLabels[s.key] = s.label;
        result[p.name] = { total: tickets?.length ?? 0, dist: Object.entries(dist).map(([k,v]) => ({ key: k, label: stageLabels[k] ?? "?", count: v })).sort((a,b)=>b.count-a.count) };
      }
      return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const { deals, assigned_email } = body as {
      deals: Array<{ title: string; contact_name: string; email: string|null; phone: string|null; stage: string; estado: string; valor: number; created_date: string; campanha: string|null; fonte: string|null }>;
      assigned_email: string;
    };

    // 1. Resolve Ariane's user ID
    const usersRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users?per_page=1000`, {
      headers: { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
    });
    const usersBody = await usersRes.json() as { users?: Array<{ id: string; email?: string }> };
    const arianeId = usersBody.users?.find(u => u.email?.toLowerCase() === assigned_email.toLowerCase())?.id ?? null;

    // 2. Pipeline + stages
    const { data: pipeline } = await admin.from("pipelines").select("id").ilike("name", "%vendas%").limit(1).maybeSingle();
    if (!pipeline) return new Response(JSON.stringify({ ok: false, error: "Pipeline não encontrado" }), { status: 200 });

    const { data: stages } = await admin.from("pipeline_stages").select("key, label").eq("pipeline_id", pipeline.id).order("position");
    const stageKeySet = new Set((stages ?? []).map(s => s.key));
    const stageMap = new Map((stages ?? []).map(s => [norm(s.label), s.key]));
    const firstStage = stages?.[0]?.key ?? "sem_atendimento";

    function resolveStage(name: string): string {
      if (stageKeySet.has(name)) return name;
      const n = norm(name);
      for (const [k, v] of stageMap) { if (k === n || k.includes(n) || n.includes(k)) return v; }
      return firstStage;
    }

    // 3. Pre-load existing clients by email and phone (last 8 digits)
    const { data: existingClients } = await admin.from("clients").select("id, email, phone");
    const byEmail = new Map<string, string>();
    const byPhone = new Map<string, string>();
    for (const c of existingClients ?? []) {
      if (c.email) byEmail.set(c.email.toLowerCase(), c.id);
      if (c.phone) {
        const p = c.phone.replace(/\D/g, "");
        if (p.length >= 8) byPhone.set(p.slice(-8), c.id);
      }
    }

    // 4. Separate deals into: found client vs need new client
    const toInsertClients: Array<{ name: string; email: string|null; phone: string|null; status: string }> = [];
    const dealClientMap: Array<{ deal_index: number; client_id: string|null; needs_insert: boolean; insert_index?: number }> = [];

    for (let i = 0; i < deals.length; i++) {
      const d = deals[i];
      const phone = d.phone ? d.phone.replace(/\D/g,"").slice(-11) : null;
      let clientId: string|null = null;
      if (d.email) clientId = byEmail.get(d.email.toLowerCase()) ?? null;
      if (!clientId && phone && phone.length >= 8) clientId = byPhone.get(phone.slice(-8)) ?? null;

      if (clientId) {
        dealClientMap.push({ deal_index: i, client_id: clientId, needs_insert: false });
      } else {
        dealClientMap.push({ deal_index: i, client_id: null, needs_insert: true, insert_index: toInsertClients.length });
        toInsertClients.push({ name: d.contact_name || d.title, email: d.email ?? null, phone: phone ? `+55${phone}` : null, status: "ativo" });
      }
    }

    // 5. Batch insert new clients
    let newClientIds: string[] = [];
    if (toInsertClients.length > 0) {
      const { data: inserted } = await admin.from("clients").insert(toInsertClients).select("id");
      newClientIds = (inserted ?? []).map((c: any) => c.id);
    }

    // 6. Resolve final client IDs
    for (const entry of dealClientMap) {
      if (entry.needs_insert && entry.insert_index !== undefined) {
        entry.client_id = newClientIds[entry.insert_index] ?? null;
      }
    }

    // 7. Batch insert tickets
    const ticketsBatch = deals.map((d, i) => {
      const entry = dealClientMap[i];
      const stageKey = resolveStage(d.stage);
      let status = "aberto";
      if (d.estado === "Ganho") status = "fechado";
      else if (d.estado === "Perdido") status = "cancelado";
      else if (d.estado === "Pausado") status = "pausado";

      let createdAt: string|null = null;
      if (d.created_date?.match(/\d{2}\/\d{2}\/\d{4}/)) {
        const [dd, mm, yyyy] = d.created_date.split("/");
        createdAt = `${yyyy}-${mm}-${dd}T00:00:00Z`;
      }

      const shortId = (d.title.replace(/\s/g,"").substring(0,5) + i.toString().padStart(3,"0")).toUpperCase();
      const t: Record<string, unknown> = {
        title: d.title,
        ticket_type: "negociacao",
        status,
        estimated_value: d.valor,
        pipeline_id: pipeline!.id,
        pipeline_stage: stageKey,
        assigned_to: arianeId,
        ticket_number: `CSV-${shortId}`,
        origin: d.fonte ?? "rd_station",
        channel: "rd_station",
      };
      if (d.campanha) t.campanha = d.campanha;
      if (entry.client_id) t.client_id = entry.client_id;
      if (createdAt) t.created_at = createdAt;
      return t;
    });

    const { error, count } = await admin.from("tickets").insert(ticketsBatch, { count: "exact" });

    if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 200 });

    return new Response(JSON.stringify({ ok: true, created: count ?? ticketsBatch.length, new_clients: toInsertClients.length, ariane_id: arianeId }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
});
