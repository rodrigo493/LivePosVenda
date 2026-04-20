import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://posvenda.liveuni.com.br',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const NOMUS_API_KEY = Deno.env.get('NOMUS_API_KEY');
    if (!NOMUS_API_KEY) return jsonResponse({ error: 'NOMUS_API_KEY not configured' }, 500);

    const body = await req.json();
    const {
      order_code, items, notes, client_name,
      dataEmissao: dataEmissaoInput, dataEntregaPadrao, cfop,
      idEmpresa, idCliente,
    } = body;

    const today = new Date();
    const fallbackDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    // Resolve client ID via pg_net
    let idPessoaCliente: number | null = idCliente || null;
    if (!idPessoaCliente && client_name) {
      if (/^\d+$/.test(client_name.trim())) {
        idPessoaCliente = Number(client_name.trim());
      } else {
        const { data: clientData } = await supabase.rpc("nomus_search_clientes", {
          search_term: client_name.trim(),
          auth_header: NOMUS_API_KEY,
        });
        if (clientData?.body) {
          try {
            const people = JSON.parse(clientData.body);
            if (Array.isArray(people) && people.length > 0) {
              const exact = people.find((p: any) => p.nome?.toLowerCase() === client_name.toLowerCase());
              idPessoaCliente = exact?.id || people[0].id;
            }
          } catch { /* sem resultado */ }
        }
      }
    }

    if (!idPessoaCliente) {
      return jsonResponse({ error: `Cliente "${client_name}" não encontrado no ERP Nomus.` }, 400);
    }

    // Resolve product IDs via pg_net
    const itensPedido = await Promise.all((items || []).map(async (item: any, idx: number) => {
      let idProduto: number | null = item.product_id_nomus || null;
      if (!idProduto && item.product_code) {
        const { data: prodData } = await supabase.rpc("nomus_search_produtos", {
          product_code: item.product_code,
          auth_header: NOMUS_API_KEY,
        });
        if (prodData?.body) {
          try {
            const prods = JSON.parse(prodData.body);
            if (Array.isArray(prods) && prods.length > 0) idProduto = prods[0].id;
          } catch { /* sem resultado */ }
        }
      }
      if (!idProduto) throw new Error(`Produto "${item.product_code}" não encontrado no ERP Nomus.`);
      return {
        idProduto,
        item: String(idx + 1),
        quantidade: String(item.quantity || 1),
        valorUnitario: String(Number(item.unit_price || 0).toFixed(2)),
        observacoes: item.description || "",
        informacoesAdicionaisProduto: "",
        percentualAcrescimo: "0", percentualDesconto: "0",
        valorAcrescimo: "0", valorDesconto: "0",
        status: 1, idTipoMovimentacao: 60,
        dataEntrega: dataEntregaPadrao || fallbackDate,
      };
    }));

    const nomusPayload = {
      codigoPedido: order_code,
      dataEmissao: dataEmissaoInput || fallbackDate,
      idCondicaoPagamento: 28,
      idEmpresa: idEmpresa || 2,
      idFormaPagamento: 10,
      idPessoaCliente,
      idTipoMovimentacao: 60,
      idTipoPedido: 1,
      observacoes: notes || `Pedido de Acessório - ${client_name || ''}`,
      observacoesInternas: `Gerado pelo Live Care - ${order_code || ''}`,
      itensPedido,
      ...(cfop ? { cfop } : {}),
    };

    // Create order via pg_net (avoids Deno TLS issue with Nomus)
    const { data: orderData, error: orderError } = await supabase.rpc("nomus_http_post", {
      payload: nomusPayload,
      auth_header: NOMUS_API_KEY,
    });

    if (orderError) return jsonResponse({ error: orderError.message }, 500);

    const statusCode = orderData?.status_code;
    if (statusCode === 429) {
      return jsonResponse({ error: 'API Nomus em throttling. Aguarde e tente novamente.', throttled: true, wait_seconds: 30 }, 200);
    }
    if (statusCode < 200 || statusCode >= 300) {
      return jsonResponse({ error: `Erro Nomus [${statusCode}]: ${orderData?.body || ''}` }, 200);
    }

    let nomusBody: any = {};
    try { nomusBody = JSON.parse(orderData.body); } catch { /* ok */ }

    return jsonResponse({ success: true, nomus_response: nomusBody, message: 'Pedido criado no ERP com sucesso' });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return jsonResponse({ error: msg }, 200);
  }
});
