import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Weighted random pick from pipeline_whatsapp_instances
function pickByDistribution(instances: { id: string; distribution_pct: number; user_id: string | null; instance_token: string; base_url: string }[]) {
  const total = instances.reduce((s, i) => s + i.distribution_pct, 0);
  if (total === 0) return instances[0] ?? null;
  let rand = Math.random() * total;
  for (const i of instances) {
    rand -= i.distribution_pct;
    if (rand <= 0) return i;
  }
  return instances[instances.length - 1];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Query params to reuse the same webhook for different forms/sources
    const url = new URL(req.url);
    const pipelineSlug = url.searchParams.get("pipeline") || "vendas";
    const sourceName   = url.searchParams.get("source")   || "Site";
    const stageKey     = url.searchParams.get("stage")    || "lead_novo";

    // ── Parse form body (Elementor sends URL-encoded) ──────────────────────
    const ct = req.headers.get("content-type") || "";
    let name = "", email = "", phone = "";

    if (ct.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const p = new URLSearchParams(text);
      // Elementor field IDs discovered from form inspection:
      name  = p.get("form_fields[name]")             || p.get("form_fields[field_name]") || "";
      email = p.get("form_fields[field_7b8ed01]")     || p.get("form_fields[email]")      || "";
      phone = p.get("form_fields[field_40eae3a]")     || p.get("form_fields[telefone]")   || p.get("form_fields[phone]") || "";
    } else {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const ff   = (body.form_fields ?? {}) as Record<string, string>;
      name  = (body.name  as string) || ff.name  || ff.field_name      || "";
      email = (body.email as string) || ff.email || ff.field_7b8ed01   || "";
      phone = (body.phone as string) || ff.phone || ff.field_40eae3a   || ff.telefone || "";
    }

    if (!name.trim() && !phone.trim()) {
      return json({ error: "Nome ou telefone obrigatório" }, 400);
    }

    // Clean phone → always store with country code
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length === 11 || cleanPhone.length === 10) cleanPhone = "55" + cleanPhone;

    // ── Resolve pipeline ────────────────────────────────────────────────────
    const { data: pipeline } = await db
      .from("pipelines")
      .select("id")
      .eq("slug", pipelineSlug)
      .single();

    if (!pipeline) return json({ error: `Pipeline '${pipelineSlug}' não encontrado` }, 422);

    // ── Distribution: pick WhatsApp instance for this pipeline ──────────────
    const { data: wInstances } = await db
      .from("pipeline_whatsapp_instances")
      .select("id, distribution_pct, user_id, instance_token, base_url")
      .eq("pipeline_id", pipeline.id)
      .eq("active", true)
      .gt("distribution_pct", 0);

    const pickedInstance = wInstances?.length ? pickByDistribution(wInstances as any[]) : null;
    const assignedTo: string | null = pickedInstance?.user_id ?? null;

    console.log(`[site-lead-webhook] pipeline=${pipelineSlug} instance=${pickedInstance?.id ?? "none"} assigned_to=${assignedTo ?? "none"}`);

    // ── Find or create client ───────────────────────────────────────────────
    let clientId: string;
    if (cleanPhone) {
      const { data: existing } = await db
        .from("clients")
        .select("id")
        .or(`phone.eq.${cleanPhone},whatsapp.eq.${cleanPhone}`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        clientId = existing.id;
      } else {
        const { data: nc, error: ce } = await db
          .from("clients")
          .insert({
            name: name.trim() || `Lead ${cleanPhone}`,
            phone: cleanPhone,
            whatsapp: cleanPhone,
            email: email.trim() || null,
            status: "ativo",
            notes: `Lead via formulário — ${sourceName}`,
          })
          .select("id")
          .single();
        if (ce) throw new Error(`Criar cliente: ${ce.message}`);
        clientId = nc.id;
      }
    } else {
      const { data: nc, error: ce } = await db
        .from("clients")
        .insert({
          name: name.trim(),
          email: email.trim() || null,
          status: "ativo",
          notes: `Lead via formulário — ${sourceName}`,
        })
        .select("id")
        .single();
      if (ce) throw new Error(`Criar cliente: ${ce.message}`);
      clientId = nc.id;
    }

    // ── Lead source ─────────────────────────────────────────────────────────
    const { data: leadSource } = await db
      .from("pipeline_lead_sources")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .eq("name", sourceName)
      .maybeSingle();

    // ── Create ticket ───────────────────────────────────────────────────────
    const title = `${name.trim() || phone} — ${sourceName}`;
    const description = [
      `Lead capturado via formulário do site.`,
      name  ? `Nome: ${name}`   : "",
      email ? `Email: ${email}` : "",
      phone ? `WhatsApp: ${phone}` : "",
    ].filter(Boolean).join("\n");

    const { data: ticket, error: te } = await db
      .from("tickets")
      .insert({
        client_id:      clientId,
        pipeline_id:    pipeline.id,
        pipeline_stage: stageKey,
        ticket_type:    "negociacao",
        title,
        description,
        status:         "aberto",
        origin:         "site",
        channel:        "formulario",
        ticket_number:  "",
        lead_source_id: leadSource?.id ?? null,
        assigned_to:    assignedTo,
      })
      .select("id")
      .single();

    if (te) throw new Error(`Criar ticket: ${te.message}`);

    console.log(`[site-lead-webhook] OK — client=${clientId} ticket=${ticket.id}`);

    // Elementor expects 200 with any body to show the success message
    return json({ success: true, ticket_id: ticket.id });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[site-lead-webhook] ERRO:", msg);
    return json({ error: msg }, 500);
  }
});
