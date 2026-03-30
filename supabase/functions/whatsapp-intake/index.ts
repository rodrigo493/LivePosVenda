import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      nome_cliente,
      telefone,
      mensagem,
      equipamento_informado,
      numero_serie,
      canal = "whatsapp",
      origem = "whatsapp_cloud",
    } = body;

    if (!telefone || !mensagem) {
      return new Response(
        JSON.stringify({ error: "telefone e mensagem são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanPhone = String(telefone).replace(/[^\d+]/g, "").slice(0, 20);
    const cleanName = String(nome_cliente || "").slice(0, 200);
    const cleanMessage = String(mensagem).slice(0, 2000);
    const cleanEquip = String(equipamento_informado || "").slice(0, 200);
    const cleanSerial = String(numero_serie || "").slice(0, 100);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiApiKey = Deno.env.get("AI_API_KEY");

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Find or create client
    let clientId: string | null = null;
    let clientData: any = null;

    const { data: existingClients } = await admin
      .from("clients")
      .select("id, name, phone, whatsapp")
      .or(`phone.eq.${cleanPhone},whatsapp.eq.${cleanPhone}`)
      .limit(1);

    if (existingClients?.length) {
      clientData = existingClients[0];
      clientId = clientData.id;
    } else {
      const { data: newClient, error: clientErr } = await admin
        .from("clients")
        .insert({
          name: cleanName || `WhatsApp ${cleanPhone}`,
          phone: cleanPhone,
          whatsapp: cleanPhone,
          notes: `Cliente criado automaticamente via ${origem}`,
          status: "ativo",
        })
        .select()
        .single();
      if (clientErr) {
        console.error("Error creating client:", clientErr);
      } else {
        clientId = newClient.id;
        clientData = newClient;
      }
    }

    // 2. Find equipment
    let equipmentId: string | null = null;
    let equipmentData: any = null;

    if (cleanSerial) {
      const { data: equips } = await admin
        .from("equipments")
        .select("id, serial_number, model_id, warranty_status, equipment_models(name)")
        .eq("serial_number", cleanSerial)
        .limit(1);
      if (equips?.length) {
        equipmentData = equips[0];
        equipmentId = equipmentData.id;
      }
    }

    if (!equipmentId && clientId) {
      const { data: clientEquips } = await admin
        .from("equipments")
        .select("id, serial_number, model_id, warranty_status, equipment_models(name)")
        .eq("client_id", clientId)
        .limit(5);
      if (clientEquips?.length === 1) {
        equipmentData = clientEquips[0];
        equipmentId = equipmentData.id;
      }
    }

    // 3. Technical history
    let techHistory: any[] = [];
    if (equipmentId) {
      const { data: history } = await admin
        .from("technical_history")
        .select("event_type, description, event_date")
        .eq("equipment_id", equipmentId)
        .order("event_date", { ascending: false })
        .limit(10);
      techHistory = history || [];
    }

    // 4. Compatible parts
    let compatibleParts: string[] = [];
    if (equipmentData?.model_id) {
      const { data: compat } = await admin
        .from("product_compatibility")
        .select("products(code, name)")
        .eq("model_id", equipmentData.model_id)
        .limit(20);
      compatibleParts = (compat || [])
        .map((c: any) => `${c.products?.code} - ${c.products?.name}`)
        .filter(Boolean);
    }

    // 5. AI triage
    let aiTriage: any = null;
    let aiSuccess = false;

    const modelName = (equipmentData as any)?.equipment_models?.name || cleanEquip || "não informado";
    const warrantyStatus = equipmentData?.warranty_status || "desconhecido";

    const triagePrompt = `Você é um assistente de triagem técnica de pós-venda de equipamentos de ginástica e fitness da marca Live.

Analise a mensagem do cliente e forneça uma triagem técnica estruturada.

DADOS DO CASO:
- Cliente: ${cleanName || "não informado"}
- Telefone: ${cleanPhone}
- Equipamento informado: ${modelName}
- Número de série: ${cleanSerial || "não informado"}
- Status de garantia: ${warrantyStatus}
- Canal: ${canal}

MENSAGEM DO CLIENTE:
"${cleanMessage}"

${techHistory.length > 0 ? `HISTÓRICO TÉCNICO RECENTE:\n${techHistory.map(h => `- ${h.event_date}: ${h.event_type} - ${h.description}`).join("\n")}` : ""}

${compatibleParts.length > 0 ? `PEÇAS COMPATÍVEIS COM O MODELO:\n${compatibleParts.join("\n")}` : ""}

RESPONDA EM JSON com esta estrutura exata:
{
  "resumo_caso": "resumo breve do caso em 1-2 frases",
  "modelo_provavel": "modelo provável do equipamento",
  "categoria_problema": "categoria do problema",
  "possiveis_causas": ["causa 1", "causa 2"],
  "pecas_relacionadas": ["peça 1", "peça 2"],
  "nivel_urgencia": "baixa|media|alta|urgente",
  "perguntas_triagem": ["pergunta 1", "pergunta 2", "pergunta 3"],
  "proximos_passos": ["passo 1", "passo 2"],
  "tipo_atendimento_sugerido": "garantia|assistencia|orcamento",
  "confianca_analise": "alta|media|baixa",
  "mensagem_cliente": "mensagem amigável e profissional para enviar ao cliente via WhatsApp",
  "orientacao_inicial": "orientação técnica breve"
}

REGRAS:
- Nunca afirme diagnóstico com certeza
- Priorize perguntas que ajudem a triagem
- Se o caso parecer garantia e o equipamento estiver em garantia, sugira "garantia"
- Inclua pedido de vídeo/foto quando relevante`;

    if (aiApiKey) {
      try {
        const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${aiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Você é um engenheiro de pós-venda especializado em equipamentos de ginástica. Responda sempre em JSON válido." },
              { role: "user", content: triagePrompt },
            ],
            max_tokens: 800,
            temperature: 0.2,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              aiTriage = JSON.parse(jsonMatch[0]);
              aiSuccess = true;
            } catch {
              console.error("Failed to parse AI JSON:", content);
            }
          }
        } else {
          const errText = await aiResponse.text();
          console.error("AI gateway error:", aiResponse.status, errText);
        }
      } catch (e) {
        console.error("AI call failed:", e);
      }
    }

    if (!aiTriage) {
      aiTriage = {
        resumo_caso: `Cliente reportou problema: "${cleanMessage.slice(0, 100)}"`,
        modelo_provavel: modelName,
        categoria_problema: "a_definir",
        possiveis_causas: ["Análise pendente - triagem automática indisponível"],
        pecas_relacionadas: [],
        nivel_urgencia: "media",
        perguntas_triagem: ["Qual o modelo exato do equipamento?", "Desde quando o problema ocorre?", "Pode enviar um vídeo mostrando o problema?"],
        proximos_passos: ["Coletar mais informações do cliente", "Encaminhar ao técnico para análise"],
        tipo_atendimento_sugerido: "assistencia",
        confianca_analise: "baixa",
        mensagem_cliente: `Olá${cleanName ? `, ${cleanName.split(" ")[0]}` : ""}! Recebemos sua mensagem sobre o equipamento. Para agilizar o atendimento, pode nos enviar: 1) Modelo do equipamento 2) Um vídeo curto mostrando o problema 3) O número de série (etiqueta no aparelho). Vamos analisar e retornar o mais breve possível!`,
        orientacao_inicial: "Coletar dados complementares antes de prosseguir.",
      };
    }

    // 6. Create placeholder equipment if needed
    if (!equipmentId && clientId) {
      const { data: placeholderEquip, error: equipErr } = await admin
        .from("equipments")
        .insert({
          serial_number: cleanSerial || `TEMP-${Date.now()}`,
          client_id: clientId,
          status: "pendente_conferencia",
          notes: `Equipamento informado via ${origem}: ${cleanEquip || "não especificado"}. Conferência pendente.`,
        })
        .select()
        .single();
      if (!equipErr && placeholderEquip) equipmentId = placeholderEquip.id;
    }

    // 7. Create ticket
    let ticketId: string | null = null;
    if (clientId && equipmentId) {
      const ticketType = aiTriage.tipo_atendimento_sugerido === "garantia" ? "garantia" : "assistencia";

      const { data: ticket, error: ticketErr } = await admin
        .from("tickets")
        .insert({
          client_id: clientId,
          equipment_id: equipmentId,
          ticket_type: ticketType,
          title: aiTriage.resumo_caso?.slice(0, 200) || cleanMessage.slice(0, 200),
          description: cleanMessage,
          problem_category: aiTriage.categoria_problema || null,
          priority: aiTriage.nivel_urgencia === "urgente" ? "urgente" : aiTriage.nivel_urgencia === "alta" ? "alta" : "media",
          status: "aberto",
          ticket_number: "",
          origin: origem,
          channel: canal,
          ai_triage: aiTriage,
        })
        .select()
        .single();

      if (ticketErr) console.error("Error creating ticket:", ticketErr);
      else ticketId = ticket.id;
    }

    // 8. Log intake
    await admin.from("whatsapp_intake_logs").insert({
      ticket_id: ticketId,
      client_phone: cleanPhone,
      client_name: cleanName || null,
      original_message: cleanMessage,
      equipment_informed: cleanEquip || null,
      serial_number: cleanSerial || null,
      ai_response: aiTriage,
      ai_model: "google/gemini-2.5-flash",
      ai_success: aiSuccess,
      manychat_response: null,
    });

    return new Response(JSON.stringify({
      success: true,
      ticket_id: ticketId,
      mensagem_resumida_cliente: aiTriage.mensagem_cliente || "Recebemos sua solicitação. Em breve retornaremos.",
      perguntas_triagem: aiTriage.perguntas_triagem || [],
      orientacao_inicial: aiTriage.orientacao_inicial || "",
      tipo_atendimento_sugerido: aiTriage.tipo_atendimento_sugerido || "assistencia",
      resumo_tecnico: aiTriage.resumo_caso || "",
      categoria_problema: aiTriage.categoria_problema || "",
      nivel_urgencia: aiTriage.nivel_urgencia || "media",
      confianca: aiTriage.confianca_analise || "baixa",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("WhatsApp intake error:", e);
    return new Response(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : "Erro interno",
        mensagem_resumida_cliente: "Recebemos sua mensagem. Nossa equipe irá analisar e retornar em breve.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
