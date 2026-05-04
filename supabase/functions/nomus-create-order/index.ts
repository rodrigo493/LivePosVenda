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
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const NOMUS_API_KEY = Deno.env.get('NOMUS_API_KEY');
    const NOMUS_API_URL = Deno.env.get('NOMUS_API_URL');
    if (!NOMUS_API_KEY) return jsonResponse({ error: 'NOMUS_API_KEY not configured' }, 500);
    if (!NOMUS_API_URL) return jsonResponse({ error: 'NOMUS_API_URL not configured' }, 500);

    const body = await req.json();
    const {
      order_code, items, notes, client_name,
      dataEmissao: dataEmissaoInput, dataEntregaPadrao, cfop,
      idEmpresa, idCliente,
    } = body;

    const today = new Date();
    const fallbackDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    // Resolve client ID — from direct param, numeric string, or cache
    let idPessoaCliente: number | null = idCliente || null;
    if (!idPessoaCliente && client_name) {
      if (/^\d+$/.test(client_name.trim())) {
        idPessoaCliente = Number(client_name.trim());
      } else {
        const { data: cached } = await supabase.rpc("nomus_get_cached_id", {
          p_type: "cliente",
          p_key: client_name.trim(),
        });
        if (cached) idPessoaCliente = cached;
      }
    }

    if (!idPessoaCliente) {
      return jsonResponse({
        error: `ID do cliente "${client_name}" não encontrado. Cadastre o ID Nomus deste cliente na tela de configuração.`,
        missing_client: client_name,
      });
    }

    // Resolve product IDs — from direct param or cache
    const itensPedido = await Promise.all((items || []).map(async (item: any, idx: number) => {
      let idProduto: number | null = item.product_id_nomus || null;
      if (!idProduto && item.product_code) {
        const { data: cached } = await supabase.rpc("nomus_get_cached_id", {
          p_type: "produto",
          p_key: item.product_code,
        });
        if (cached) idProduto = cached;
      }
      if (!idProduto) throw new Error(`ID do produto "${item.product_code}" não encontrado. Cadastre o ID Nomus deste produto na tela de configuração.`);
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

    // Chama o proxy VPS (NOMUS_API_URL) — proxy adiciona Authorization e resolve TLS
    const nomusRes = await fetch(`${NOMUS_API_URL}/rest/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(nomusPayload),
    });

    const statusCode = nomusRes.status;
    if (statusCode === 429) return jsonResponse({ error: 'API Nomus em throttling. Aguarde e tente novamente.', throttled: true, wait_seconds: 30 });

    let nomusBody: any = {};
    try { nomusBody = await nomusRes.json(); } catch { /* ok */ }

    if (statusCode < 200 || statusCode >= 300) return jsonResponse({ error: `Erro Nomus [${statusCode}]: ${JSON.stringify(nomusBody)}` });

    return jsonResponse({ success: true, nomus_response: nomusBody, message: 'Pedido criado no ERP com sucesso' });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return jsonResponse({ error: msg });
  }
});
