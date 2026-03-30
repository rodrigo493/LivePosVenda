import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncEntry {
  name: string;
  stage: string;
}

const STAGE_MAP: Record<string, string> = {
  "sem atendimento": "sem_atendimento",
  "primeiro contato": "primeiro_contato",
  "em analise": "em_analise",
  "separacao de pecas": "separacao_pecas",
  "concluido": "concluido",
  "sem interacao": "sem_interacao",
};

function normalizeStage(raw: string): string | null {
  const key = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [pattern, stage] of Object.entries(STAGE_MAP)) {
    if (key === pattern || key.includes(pattern)) return stage;
  }
  return null;
}

function normalizeForSearch(name: string): string {
  return name
    .replace(/^(Autolead:\s*|PV:\s*|:\s*)/i, "")
    .replace(/\s*[-–]\s*(PD|PA|Pedido|Mormaii|V\d|Mormai|molas|barulho|elast|garantia|assist|franquia|defeito|carrinho|mosquetao|trava|Barrel|Studio|Fisio|manipulo|rodas|parafuso|tampas|roldanas|auxilio|Curitiba|antigo|furos|ampiezza).*/i, "")
    .replace(/\s*\(.*\)/, "")
    .replace(/\s*PD\s*\d+.*/i, "")
    .replace(/\s*PA\s*\.?\s*\d+.*/i, "")
    .replace(/[*✨]/g, "")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { entries } = (await req.json()) as { entries: SyncEntry[] };
    if (!entries?.length) {
      return new Response(JSON.stringify({ error: "No entries provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all clients
    const { data: clients } = await supabase.from("clients").select("id, name");
    // Fetch all open tickets
    const { data: tickets } = await supabase
      .from("tickets")
      .select("id, ticket_number, client_id, pipeline_stage, equipment_id, status")
      .not("status", "eq", "fechado");

    const clientList = clients || [];
    const ticketList = tickets || [];
    const now = new Date().toISOString();
    const dateStr = new Date().toLocaleDateString("pt-BR");

    const report = {
      updated: 0,
      notFound: [] as string[],
      conflicts: [] as string[],
      stageChanges: 0,
      errors: [] as string[],
      details: [] as { name: string; status: string; stage?: string; ticketNumber?: string }[],
    };

    for (const entry of entries) {
      const mappedStage = normalizeStage(entry.stage);
      if (!mappedStage) {
        report.errors.push(`${entry.name}: etapa "${entry.stage}" não reconhecida`);
        continue;
      }

      const searchName = normalizeForSearch(entry.name).toLowerCase();
      if (!searchName) {
        report.errors.push(`${entry.name}: nome vazio após normalização`);
        continue;
      }

      // Search by name - try exact first, then partial
      let matches = clientList.filter(
        (c) => c.name.toLowerCase().trim() === searchName
      );
      if (matches.length === 0) {
        matches = clientList.filter(
          (c) => c.name.toLowerCase().includes(searchName) || searchName.includes(c.name.toLowerCase().trim())
        );
      }

      if (matches.length === 0) {
        report.notFound.push(entry.name);
        report.details.push({ name: entry.name, status: "não encontrado" });
        continue;
      }

      // If multiple matches, prefer client with open ticket
      let selectedClient = matches[0];
      if (matches.length > 1) {
        const withTicket = matches.filter((c) =>
          ticketList.some((t) => t.client_id === c.id)
        );
        if (withTicket.length === 1) {
          selectedClient = withTicket[0];
        } else {
          report.conflicts.push(entry.name);
          report.details.push({ name: entry.name, status: "conflito", stage: entry.stage });
          continue;
        }
      }

      // Find ticket for this client
      const clientTickets = ticketList.filter((t) => t.client_id === selectedClient.id);
      if (clientTickets.length === 0) {
        report.notFound.push(`${entry.name} (cliente encontrado, sem ticket aberto)`);
        report.details.push({ name: entry.name, status: "sem ticket" });
        continue;
      }

      const ticket = clientTickets[0];
      const oldStage = ticket.pipeline_stage;

      // Update ticket
      const { error } = await supabase
        .from("tickets")
        .update({
          pipeline_stage: mappedStage,
          last_interaction_at: now,
          updated_at: now,
          origin: "crm_importado",
        })
        .eq("id", ticket.id);

      if (error) {
        report.errors.push(`${entry.name}: ${error.message}`);
        continue;
      }

      // Log technical history
      if (ticket.equipment_id) {
        await supabase.from("technical_history").insert({
          equipment_id: ticket.equipment_id,
          event_type: "importacao_crm",
          description: `Etapa atualizada por sincronização do CRM em lote. ${oldStage} → ${mappedStage} (${dateStr})`,
          reference_type: "ticket",
          reference_id: ticket.id,
        });
      }

      if (oldStage !== mappedStage) report.stageChanges++;
      report.updated++;
      report.details.push({
        name: entry.name,
        status: "atualizado",
        stage: mappedStage,
        ticketNumber: ticket.ticket_number,
      });
    }

    // Log import
    await supabase.from("import_logs").insert({
      file_name: "crm-batch-sync-manual",
      total_rows: entries.length,
      imported_rows: report.updated,
      skipped_rows: report.notFound.length + report.conflicts.length,
      errors: report.errors.length > 0 ? report.errors : null,
      status: "completed",
    });

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
