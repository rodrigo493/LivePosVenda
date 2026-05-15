// supabase/functions/nomus-create-purchase-order/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // `payload` é montado no browser via buildPedidoCompraPayload
    const { purchase_order_id, payload } = await req.json();
    if (!purchase_order_id || !payload) throw new Error("purchase_order_id e payload obrigatórios");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Defaults configuráveis injetados aqui (não vêm da tela)
    const fullPayload = {
      ...payload,
      idCondicaoPagamento: Number(Deno.env.get("NOMUS_PC_ID_CONDICAO_PAGAMENTO") ?? "1"),
      idFormaPagamento: Number(Deno.env.get("NOMUS_PC_ID_FORMA_PAGAMENTO") ?? "1"),
    };

    const nomusBase = Deno.env.get("NOMUS_API_URL")!;           // ex.: https://.../empresa
    const nomusAuth = Deno.env.get("NOMUS_API_KEY")!;           // chave Basic
    const resp = await fetch(`${nomusBase}/rest/pedidoscompra`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Basic ${nomusAuth}` },
      body: JSON.stringify(fullPayload),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Nomus ${resp.status}: ${text}`);
    const result = JSON.parse(text); // { codigoPedido, id }

    await supabase.from("purchase_orders").update({
      nomus_order_id: result.id,
      nomus_codigo_pedido: result.codigoPedido,
      nomus_sent_at: new Date().toISOString(),
      status: "criado_nomus",
      updated_at: new Date().toISOString(),
    }).eq("id", purchase_order_id);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
