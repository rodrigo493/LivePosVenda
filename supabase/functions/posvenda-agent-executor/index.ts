import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_API_KEY   = Deno.env.get("AI_API_KEY");

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // Aceita chamadas com a service role key (pg_cron) ou invocação interna
  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (bearer !== SERVICE_KEY) return jsonRes({ error: "Unauthorized" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Carrega configuração do agente PosVenda
  const { data: agente, error: agErr } = await sb
    .from("agentes_config")
    .select("id, soul_prompt")
    .eq("nome", "PosVenda")
    .eq("ativo", true)
    .single();

  if (agErr || !agente) {
    return jsonRes({ error: "Agente PosVenda não encontrado ou inativo" }, 500);
  }

  // Busca até 10 eventos pendentes, ordenados por prioridade e data
  const { data: eventos = [] } = await sb
    .from("eventos_autonomos")
    .select("*")
    .eq("status", "pendente")
    .eq("id_agente", agente.id)
    .order("prioridade", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(10);

  const results: Array<{ id: string; status: string; erro?: string }> = [];

  for (const evento of eventos) {
    // Marca como processando antes de começar
    await sb
      .from("eventos_autonomos")
      .update({ status: "processando" })
      .eq("id", evento.id);

    try {
      let resultado: Record<string, unknown> = {};

      if (evento.tipo === "triagem_ticket") {
        resultado = await triagemTicket(sb, agente, evento);
      }

      await sb.from("eventos_autonomos").update({
        status:       "concluido",
        resultado,
        processed_at: new Date().toISOString(),
      }).eq("id", evento.id);

      results.push({ id: evento.id, status: "concluido" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`Evento ${evento.id} falhou:`, msg);
      await sb.from("eventos_autonomos").update({
        status:       "erro",
        erro:         msg,
        processed_at: new Date().toISOString(),
      }).eq("id", evento.id);
      results.push({ id: evento.id, status: "erro", erro: msg });
    }
  }

  return jsonRes({ processed: results.length, results });
});

// ─── Consulta de memória ─────────────────────────────────────────────────────

async function buscarMemoria(
  sb: ReturnType<typeof createClient>,
  titulo: string,
  descricao: string | null,
  modelName: string | undefined,
): Promise<MemoriaRow[]> {
  // 1ª tentativa: filtrar por modelo + FTS no sintoma
  if (modelName) {
    const { data } = await sb
      .from("memoria_problema_solucao")
      .select("id, modelo_aparelho, sintoma, solucao_md, pecas, tags")
      .eq("aprovada", true)
      .ilike("modelo_aparelho", `%${modelName}%`)
      .limit(3);
    if (data && data.length > 0) return data as MemoriaRow[];
  }

  // 2ª tentativa: FTS pela coluna ts_search usando palavras do título
  const palavras = titulo
    .replace(/[^a-záàâãéêíóôõúüçñ\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" ");

  if (palavras.trim()) {
    const { data } = await (sb as any)
      .from("memoria_problema_solucao")
      .select("id, modelo_aparelho, sintoma, solucao_md, pecas, tags")
      .eq("aprovada", true)
      .textSearch("ts_search", palavras, { config: "portuguese", type: "plain" })
      .limit(3);
    if (data && data.length > 0) return data as MemoriaRow[];
  }

  return [];
}

// ─── Triagem de ticket ────────────────────────────────────────────────────────

interface AgenteInfo {
  id: string;
  soul_prompt: string;
}

interface EventoRow {
  id: string;
  ticket_id: string | null;
  [key: string]: unknown;
}

interface MemoriaRow {
  id: string;
  modelo_aparelho: string;
  sintoma: string;
  solucao_md: string;
  pecas: unknown[];
  tags: string[];
}

async function triagemTicket(
  sb: ReturnType<typeof createClient>,
  agente: AgenteInfo,
  evento: EventoRow,
): Promise<Record<string, unknown>> {
  const ticketId = evento.ticket_id;
  if (!ticketId) throw new Error("evento sem ticket_id");

  // Carrega ticket com cliente e equipamento
  const { data: ticket, error } = await sb
    .from("tickets")
    .select(`
      id, ticket_number, title, description, problem_category,
      priority, status, assigned_to, channel, created_at,
      clients!tickets_client_id_fkey ( id, name, phone, whatsapp, email ),
      equipments!tickets_equipment_id_fkey (
        id, serial_number, warranty_status, warranty_expires_at,
        equipment_models ( name )
      )
    `)
    .eq("id", ticketId)
    .single();

  if (error || !ticket) throw new Error(`Ticket ${ticketId} não encontrado: ${error?.message}`);

  const equip      = ticket.equipments as Record<string, unknown> | null;
  const client     = ticket.clients    as Record<string, unknown> | null;
  const equipModel = (equip?.equipment_models as Record<string, unknown> | null);
  const modelName  = equipModel?.name as string | undefined;

  // Detecta informações faltantes
  const missing: string[] = [];
  if (!equip?.serial_number)                                           missing.push("número de série do equipamento");
  if (!ticket.description || String(ticket.description).length < 20)  missing.push("descrição detalhada do problema");
  if (!client?.whatsapp && !client?.phone)                             missing.push("telefone/WhatsApp do cliente");

  // ── Consulta base de memória antes de gerar triagem ───────────────────────
  const memorias = await buscarMemoria(sb, ticket.title as string, ticket.description as string | null, modelName);

  // Monta contexto para o modelo de IA
  const memCtx = memorias.length > 0
    ? "\n\nSOLUÇÕES JÁ CONHECIDAS NA BASE INTERNA:\n" +
      memorias.map((m: MemoriaRow, i: number) =>
        `[${i + 1}] Modelo: ${m.modelo_aparelho} | Sintoma: ${m.sintoma.slice(0, 100)}\nSolução: ${m.solucao_md.slice(0, 300)}`
      ).join("\n\n")
    : "";

  const ctx = [
    `Ticket: ${ticket.ticket_number} | ${ticket.title}`,
    `Status: ${ticket.status} | Prioridade: ${ticket.priority}`,
    `Descrição: ${ticket.description ?? "Não informada"}`,
    `Categoria do problema: ${ticket.problem_category ?? "Não categorizada"}`,
    `Canal: ${ticket.channel ?? "Não informado"}`,
    `Cliente: ${client?.name ?? "Não identificado"}`,
    `WhatsApp/Telefone: ${client?.whatsapp ?? client?.phone ?? "Não informado"}`,
    `Modelo do equipamento: ${modelName ?? "Não identificado"}`,
    `Serial do equipamento: ${equip?.serial_number ?? "NÃO INFORMADO"}`,
    `Garantia: ${equip?.warranty_status ?? "Não verificada"}`,
    `Aberto em: ${new Date(ticket.created_at as string).toLocaleString("pt-BR")}`,
    memCtx,
  ].filter(Boolean).join("\n");

  // Tenta gerar triagem via IA (OpenRouter)
  let conteudo = "";

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
          messages: [
            { role: "system", content: agente.soul_prompt },
            { role: "user",   content: `Analise este ticket de suporte:\n\n${ctx}` },
          ],
          max_tokens:  600,
          temperature: 0.15,
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        conteudo = aiData.choices?.[0]?.message?.content ?? "";
      } else {
        console.error("AI gateway error:", aiRes.status, await aiRes.text().catch(() => ""));
      }
    } catch (e) {
      console.error("AI call failed:", e);
    }
  }

  // Fallback baseado em regras se IA falhar ou não estiver configurada
  if (!conteudo) {
    const checklist = [
      `- [${equip?.serial_number ? "x" : " "}] Número de série do equipamento`,
      `- [ ] Fotos do defeito`,
      `- [ ] Nota fiscal / comprovante de compra`,
      `- [ ] Endereço completo para envio (se necessário)`,
      `- [ ] Vídeo do problema em operação`,
    ];

    const descSnippet = ticket.description
      ? String(ticket.description).slice(0, 150)
      : "Não informada";

    const partes: string[] = [
      `## Triagem automática — ${ticket.ticket_number}`,
      "",
      `**Resumo:** ${ticket.title}. ${descSnippet}`,
      "",
      "**Checklist de informações:**",
      ...checklist,
    ];

    if (memorias.length > 0) {
      partes.push("", "---", "### ✅ Soluções já conhecidas (base interna)");
      memorias.forEach((m: MemoriaRow, i: number) => {
        partes.push(`\n**[${i + 1}] ${m.modelo_aparelho}** — ${m.sintoma.slice(0, 80)}`);
        partes.push(m.solucao_md.slice(0, 500));
        if ((m.pecas as unknown[]).length > 0) {
          partes.push(`> Peças: ${JSON.stringify(m.pecas)}`);
        }
      });
    }

    partes.push(
      "",
      `**Próximo passo:** ${
        missing.length > 0
          ? `Solicitar ao cliente: ${missing.join(", ")}. Aguardar antes de acionar técnico.`
          : memorias.length > 0
            ? "Verificar solução conhecida acima. Confirmar serial e fotos antes de executar."
            : "Encaminhar para equipe técnica com as informações completas."
      }`,
    );

    conteudo = partes.join("\n");
  }

  // Salva entregável (resumo + checklist)
  await sb.from("entregaveis_agente").insert({
    id_agente:   agente.id,
    evento_id:   evento.id,
    ticket_id:   ticket.id,
    tipo:        "resumo",
    conteudo_md: conteudo,
  });

  // Cria tarefa para humano quando faltam informações críticas
  if (missing.length > 0) {
    const assignTo = (ticket.assigned_to as string | null) ?? agente.id;
    await sb.from("tasks").insert({
      title:       `[IA] Aguardando informações — ${ticket.ticket_number}`,
      description: `Laivinha identificou informações faltantes: ${missing.join(", ")}. Solicitar ao cliente antes de prosseguir com o atendimento.`,
      ticket_id:   ticket.id,
      client_id:   (client?.id as string) ?? null,
      assigned_to: assignTo,
      priority:    ticket.priority,
      status:      "pendente",
      created_by:  agente.id,
    });
  }

  // Registra no log de atividades (performed_by = null → ação do sistema, service_role bypassa RLS)
  await sb.from("activity_logs").insert({
    entity_type:  "ticket",
    entity_id:    ticket.id,
    action:       "agente_posvenda_triagem",
    description:  `Laivinha realizou triagem automática do ticket ${ticket.ticket_number}`,
    new_data:     {
      info_faltante:  missing,
      tarefa_criada:  missing.length > 0,
      gerado_por_ia:  Boolean(AI_API_KEY && conteudo),
    },
    performed_by: null,
  });

  return {
    ticket_id:    ticket.id,
    missing_info: missing,
    task_created: missing.length > 0,
  };
}
