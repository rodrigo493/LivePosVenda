// supabase/functions/extract-supplier-quote/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label} não respondeu em ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const SYSTEM_PROMPT =
  "Você extrai dados de orçamentos de fornecedores. Responda SOMENTE com um objeto JSON válido, sem texto fora do JSON.";

function buildInstruction(items: { id: string; codigo: string | null; descricao: string | null; quantidade: number }[]): string {
  return [
    "Abaixo está a lista de itens de um Pedido de Compra (campo po_item_id é o identificador).",
    JSON.stringify(items),
    "",
    "No documento/anexo está o orçamento de um fornecedor. Para CADA item do pedido,",
    "localize a linha correspondente no orçamento e extraia: valor unitário, data de entrega",
    "(formato YYYY-MM-DD) e desconto. Liste também itens cotados no orçamento que NÃO",
    "correspondem a nenhum item do pedido. Identifique a condição de pagamento geral.",
    "",
    "Responda no schema JSON exato:",
    JSON.stringify({
      items: [{
        po_item_id: "string (um dos po_item_id acima)",
        matched: "boolean",
        confidence: "alta | media | baixa",
        valor_unitario: "number | null",
        data_entrega: "YYYY-MM-DD | null",
        percentual_desconto: "number | null",
        valor_desconto: "number | null",
        observacao: "string",
      }],
      extra_items: [{
        descricao: "string", codigo: "string | null", quantidade: "number | null",
        valor_unitario: "number | null", data_entrega: "YYYY-MM-DD | null",
        percentual_desconto: "number | null", valor_desconto: "number | null",
      }],
      condicao_pagamento: "string | null",
      aviso: "string | null (preencha se algo não ficou claro)",
    }),
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { purchase_order_id, file_url, file_type } = await req.json();
    if (!purchase_order_id || !file_url || !file_type) {
      throw new Error("purchase_order_id, file_url e file_type são obrigatórios");
    }

    const aiApiKey = Deno.env.get("AI_API_KEY");
    if (!aiApiKey) throw new Error("AI_API_KEY não configurado nos secrets");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rawItems } = await supabase
      .from("purchase_order_items")
      .select("id, produto_codigo, produto_descricao, quantidade")
      .eq("purchase_order_id", purchase_order_id)
      .order("posicao", { ascending: true });
    const items = (rawItems ?? []).map((it: Record<string, unknown>) => ({
      id: it.id as string,
      codigo: (it.produto_codigo as string) ?? null,
      descricao: (it.produto_descricao as string) ?? null,
      quantidade: Number(it.quantidade ?? 0),
    }));

    // Baixa o arquivo
    const fileRes = await withTimeout(fetch(file_url), 20000, "download do arquivo");
    if (!fileRes.ok) throw new Error(`Falha ao baixar o arquivo (HTTP ${fileRes.status})`);

    // Monta o conteúdo da mensagem do usuário conforme o tipo
    const instruction = buildInstruction(items);
    let userContent: unknown;
    if (file_type === "txt") {
      const text = await fileRes.text();
      userContent = `${instruction}\n\n--- CONTEÚDO DO ORÇAMENTO (TXT) ---\n${text}`;
    } else if (file_type === "image") {
      const b64 = bufferToBase64(await fileRes.arrayBuffer());
      userContent = [
        { type: "text", text: instruction },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
      ];
    } else if (file_type === "pdf") {
      const b64 = bufferToBase64(await fileRes.arrayBuffer());
      userContent = [
        { type: "text", text: instruction },
        { type: "file", file: { filename: "orcamento.pdf", file_data: `data:application/pdf;base64,${b64}` } },
      ];
    } else {
      throw new Error(`file_type inválido: ${file_type}`);
    }

    // Chama o Gemini via OpenRouter
    const aiRes = await withTimeout(
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${aiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 4000,
        }),
      }),
      60000,
      "leitura por IA",
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`IA indisponível (HTTP ${aiRes.status}): ${errText.slice(0, 200)}`);
    }
    const aiData = await aiRes.json();
    const content: string = aiData.choices?.[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // tenta extrair o primeiro bloco {...}
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("A IA não retornou JSON válido");
      parsed = JSON.parse(m[0]);
    }

    return new Response(JSON.stringify({ ok: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[extract-supplier-quote] ERRO:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
