import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Normaliza telefone BR para o formato com DDI 55 (somente dígitos)
function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

// Registra a conversão no RD Station Marketing via API de Conversões.
// A chave fica em RD_MARKETING_API_KEY (secret do Supabase) — nunca no código.
async function sendToRdMarketing(lead: {
  name: string;
  email: string;
  phone: string;
  hasStudio: boolean;
}): Promise<void> {
  const apiKey = Deno.env.get("RD_MARKETING_API_KEY");
  if (!apiKey) {
    console.warn("[lp-studio-lead] RD_MARKETING_API_KEY não configurada — RD ignorado");
    return;
  }

  const resp = await fetch(
    `https://api.rd.services/platform/conversions?api_key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "CONVERSION",
        event_family: "CDP",
        payload: {
          conversion_identifier: "lp-combo-studio-classic",
          name: lead.name,
          email: lead.email,
          mobile_phone: "+" + lead.phone,
          tags: [
            "lp-combo-studio-classic",
            lead.hasStudio ? "possui-studio-sim" : "possui-studio-nao",
          ],
        },
      }),
    },
  );

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`RD ${resp.status}: ${txt}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "Método não permitido" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const whatsappRaw = String(body.whatsapp ?? "").trim();
    const hasStudio = body.has_studio === true;

    if (!name || !email || !whatsappRaw) {
      return json({ success: false, error: "Nome, e-mail e WhatsApp são obrigatórios" }, 400);
    }

    const phone = normalizePhone(whatsappRaw);
    if (phone.length < 12) {
      return json({ success: false, error: "WhatsApp inválido" }, 400);
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve o funil "Landing Page"
    const { data: pipeline } = await db
      .from("pipelines")
      .select("id, name")
      .ilike("name", "%landing%")
      .eq("is_active", true)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (!pipeline) {
      return json({ success: false, error: "Funil Landing Page não encontrado" }, 500);
    }

    // Resolve a etapa "Novo Lead"
    const { data: stage } = await db
      .from("pipeline_stages")
      .select("key, label")
      .eq("pipeline_id", pipeline.id)
      .ilike("label", "%novo lead%")
      .order("position")
      .limit(1)
      .maybeSingle();
    const stageKey = stage?.key ?? "novo_lead";

    // Resolve (ou cria) a fonte de lead "Landing Page"
    let leadSourceId: string | null = null;
    const { data: source } = await db
      .from("pipeline_lead_sources")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .ilike("name", "landing page")
      .maybeSingle();
    if (source) {
      leadSourceId = source.id;
    } else {
      const { data: newSource } = await db
        .from("pipeline_lead_sources")
        .insert({ pipeline_id: pipeline.id, name: "Landing Page", color: "#FF5722" })
        .select("id")
        .single();
      leadSourceId = newSource?.id ?? null;
    }

    // Resolve (ou cria) o cliente — busca por phone OU whatsapp para não duplicar
    let clientId: string;
    const { data: existing } = await db
      .from("clients")
      .select("id, name, email")
      .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
      .limit(1)
      .maybeSingle();
    if (existing) {
      clientId = existing.id;
      // Corrige o cadastro se o cliente foi criado antes só com o telefone
      // (ex.: criado pela extensão do WhatsApp, com o número no campo nome).
      const nomeAtual = String(existing.name ?? "").trim();
      const nomeEhTelefone = nomeAtual === "" || /^[\d\s()+-]+$/.test(nomeAtual);
      const patch: Record<string, unknown> = {};
      if (nomeEhTelefone && name) patch.name = name;
      if (!String(existing.email ?? "").trim() && email) patch.email = email;
      if (Object.keys(patch).length > 0) {
        await db.from("clients").update(patch).eq("id", existing.id);
      }
    } else {
      const { data: nc, error: ce } = await db
        .from("clients")
        .insert({
          name,
          phone,
          whatsapp: phone,
          email: email || null,
          status: "ativo",
          notes: "Lead via Landing Page — Combo Studio Live Classic",
        })
        .select("id")
        .single();
      if (ce || !nc) throw new Error(`Criar cliente: ${ce?.message ?? "falha"}`);
      clientId = nc.id;
    }

    // Cria o card (ticket)
    const studioSuffix = hasStudio ? "Tem studio" : "Sem studio";
    const description = [
      "Lead da Landing Page — Combo Studio Live Classic.",
      `Possui studio: ${hasStudio ? "Sim" : "Não"}`,
      `E-mail: ${email}`,
      `WhatsApp: ${phone}`,
    ].join("\n");

    const { data: ticket, error: te } = await db
      .from("tickets")
      .insert({
        client_id: clientId,
        pipeline_id: pipeline.id,
        pipeline_stage: stageKey,
        ticket_type: "negociacao",
        title: `${name} · ${studioSuffix}`,
        has_studio: hasStudio,
        description,
        status: "aberto",
        origin: "landing_page",
        channel: "lp_combo_classic",
        ticket_number: "",
        lead_source_id: leadSourceId,
        new_lead: true,
      })
      .select("id")
      .single();
    if (te || !ticket) throw new Error(`Criar ticket: ${te?.message ?? "falha"}`);

    console.log(`[lp-studio-lead] OK — client=${clientId} ticket=${ticket.id}`);

    // Envia a conversão para o RD Station Marketing.
    // Isolado: se o RD falhar, o lead NÃO se perde — já está salvo no CRM acima.
    try {
      await sendToRdMarketing({ name, email, phone, hasStudio });
      console.log("[lp-studio-lead] RD Marketing OK");
    } catch (rdErr) {
      const m = rdErr instanceof Error ? rdErr.message : String(rdErr);
      console.error("[lp-studio-lead] RD Marketing falhou (lead salvo no CRM):", m);
    }

    return json({ success: true, ticket_id: ticket.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[lp-studio-lead] ERRO:", msg);
    return json({ success: false, error: msg }, 500);
  }
});
