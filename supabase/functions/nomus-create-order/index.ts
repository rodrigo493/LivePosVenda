import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const nomusHeaders = (apiKey: string) => ({
  "Content-Type": "application/json",
  "Accept": "application/json",
  "Authorization": `Basic ${apiKey}`,
});

async function resolveClientId(name: string, apiUrl: string, apiKey: string): Promise<number | null> {
  try {
    const firstName = name.trim().split(/\s+/)[0];
    const res = await fetch(`${apiUrl}/rest/pessoas?query=nome==*${encodeURIComponent(firstName)}*`, {
      headers: nomusHeaders(apiKey),
    });
    if (!res.ok) return null;
    const people = await res.json();
    if (!Array.isArray(people) || people.length === 0) return null;
    const exact = people.find((p: any) => p.nome?.toLowerCase() === name.toLowerCase());
    if (exact) return exact.id;
    return people[0].id;
  } catch {
    return null;
  }
}

async function resolveProductId(code: string, apiUrl: string, apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(`${apiUrl}/rest/produtos?query=codigo==${code}`, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Basic ${apiKey}`,
      },
    });
    if (!res.ok) return null;
    const products = await res.json();
    if (Array.isArray(products) && products.length > 0) return products[0].id;
    return null;
  } catch {
    return null;
  }
}

async function buildNomusPayload(body: Record<string, any>, apiUrl: string, apiKey: string): Promise<Record<string, any>> {
  const {
    order_code, items, notes, client_name,
    dataEmissao: dataEmissaoInput,
    dataEntregaPadrao, cfop,
    idTipoPedido, idEmpresa, idCliente, idTipoMovimentacao,
    idSetorSaida, idTabelaPreco, idContato, pedidoCompraCliente,
    idCondicaoPagamento, idFormaPagamento, idPessoaVendedor,
    idUnidadeMedida,
  } = body;

  const movimentacaoId = idTipoMovimentacao || 60;
  const today = new Date();
  const fallbackDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  const itensPedido = await Promise.all((items || []).map(async (item: any, idx: number) => {
    let idProduto: number | string = item.product_id_nomus || "";
    const productCode = item.product_code || "";

    if (!idProduto && productCode) {
      const resolved = await resolveProductId(productCode, apiUrl, apiKey);
      if (resolved) idProduto = resolved;
    }

    return {
      idProduto,
      item: String(idx + 1),
      quantidade: String(item.quantity || 1),
      valorUnitario: String(Number(item.unit_price || 0).toFixed(2)),
      observacoes: item.description || "",
      informacoesAdicionaisProduto: "",
      percentualAcrescimo: "0",
      percentualDesconto: "0",
      valorAcrescimo: "0",
      valorDesconto: "0",
      status: 1,
      idTipoMovimentacao: movimentacaoId,
      ...(idUnidadeMedida ? { idUnidadeMedida } : {}),
      ...(idTabelaPreco ? { idTabelaPreco } : {}),
      dataEntrega: dataEntregaPadrao || dataEmissaoInput || fallbackDate,
    };
  }));

  const payload: Record<string, any> = {
    dataEmissao: dataEmissaoInput || fallbackDate,
    idCondicaoPagamento: idCondicaoPagamento || 28,
    idEmpresa: idEmpresa || 1,
    idFormaPagamento: idFormaPagamento || 10,
    idTipoMovimentacao: movimentacaoId,
    idTipoPedido: idTipoPedido || 1,
    observacoes: notes || `Pedido de Acessório - ${client_name || ''}`,
    observacoesInternas: `Gerado automaticamente pelo Live Care - ${order_code || ''}`,
    itensPedido: itensPedido.length > 0 ? itensPedido : [{
      item: "1", quantidade: "1", valorUnitario: "0",
      observacoes: order_code || "",
      informacoesAdicionaisProduto: "",
      percentualAcrescimo: "0", percentualDesconto: "0",
      valorAcrescimo: "0", valorDesconto: "0",
      status: 1, idTipoMovimentacao: movimentacaoId,
    }],
  };

  if (order_code) payload.codigoPedido = order_code;
  if (idCliente) {
    payload.idPessoaCliente = idCliente;
  } else if (client_name) {
    if (/^\d+$/.test(client_name.trim())) {
      payload.idPessoaCliente = Number(client_name.trim());
    } else {
      const resolvedClientId = await resolveClientId(client_name, apiUrl, apiKey);
      if (resolvedClientId) {
        payload.idPessoaCliente = resolvedClientId;
      } else {
        return { error: true, message: `Cliente "${client_name}" não encontrado no ERP Nomus. Use o ID numérico do cliente ou cadastre-o no Nomus primeiro.` };
      }
    }
  }
  if (idPessoaVendedor) payload.idPessoaVendedor = idPessoaVendedor;
  if (idSetorSaida) payload.idSetorSaida = idSetorSaida;
  if (idContato) payload.idContato = idContato;
  if (pedidoCompraCliente) payload.pedidoCompraCliente = pedidoCompraCliente;
  if (cfop) payload.cfop = cfop;

  return payload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const NOMUS_API_KEY = Deno.env.get('NOMUS_API_KEY');
    if (!NOMUS_API_KEY) {
      return jsonResponse({ error: 'NOMUS_API_KEY not configured' }, 500);
    }

    const NOMUS_API_URL = Deno.env.get('NOMUS_API_URL');
    if (!NOMUS_API_URL) {
      return jsonResponse({ error: 'NOMUS_API_URL not configured' }, 500);
    }

    const body = await req.json();
    const nomusPayload = await buildNomusPayload(body, NOMUS_API_URL, NOMUS_API_KEY);

    if (nomusPayload.error) {
      return jsonResponse({ error: nomusPayload.message }, 400);
    }

    const nomusResponse = await fetch(`${NOMUS_API_URL}/rest/pedidos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Basic ${NOMUS_API_KEY}`,
      },
      body: JSON.stringify(nomusPayload),
    });

    const responseText = await nomusResponse.text();
    let nomusData: any = {};
    try {
      nomusData = JSON.parse(responseText);
    } catch {
      nomusData = { raw: responseText };
    }

    if (nomusResponse.status === 429) {
      const waitSecs = Number(nomusData?.tempoAteLiberar) || 30;
      return jsonResponse({
        error: `API Nomus em throttling. Aguarde ${waitSecs} segundos e tente novamente.`,
        throttled: true,
        wait_seconds: waitSecs,
      }, 429);
    }

    if (nomusResponse.status < 200 || nomusResponse.status >= 300) {
      return jsonResponse({
        error: `Erro na API Nomus [${nomusResponse.status}]`,
        details: nomusData,
      }, nomusResponse.status > 0 ? nomusResponse.status : 502);
    }

    return jsonResponse({
      success: true,
      nomus_response: nomusData,
      message: 'Pedido enviado ao ERP com sucesso',
    });

  } catch (error: unknown) {
    console.error("Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
