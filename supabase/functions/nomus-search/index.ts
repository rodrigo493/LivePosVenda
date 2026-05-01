const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://posvenda.liveuni.com.br',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NOMUS_API_KEY = Deno.env.get('NOMUS_API_KEY');
    const NOMUS_API_URL = Deno.env.get('NOMUS_API_URL');
    if (!NOMUS_API_KEY || !NOMUS_API_URL) {
      return new Response(JSON.stringify({ results: [], _debug: { error: 'Secrets não configurados', hasKey: !!NOMUS_API_KEY, hasUrl: !!NOMUS_API_URL } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { type, query } = await req.json();

    let url = '';
    if (type === 'clientes') {
      const term = encodeURIComponent(query.trim());
      url = `${NOMUS_API_URL}/rest/pessoas?query=nomeFantasia==*${term}*,razaoSocial==*${term}*,nome==*${term}*`;
    } else if (type === 'produtos') {
      url = `${NOMUS_API_URL}/rest/produtos?query=codigo==*${encodeURIComponent(query)}*`;
    } else if (type === 'estoque') {
      // Proxy nginx já adiciona Authorization — não enviar header aqui (TLS Deno/Rustls incompatível com Nomus direto)
      const nomusHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

      // 1. Buscar ID do produto pelo código exato
      const resProd = await fetch(
        `${NOMUS_API_URL}/rest/produtos?query=codigo==${encodeURIComponent(query)}`,
        { headers: nomusHeaders }
      );
      const produtos = await resProd.json();
      const produto = Array.isArray(produtos) ? produtos.find((p: any) => p.codigo === query) : null;
      if (!produto) {
        return new Response(JSON.stringify({ saldo: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 2. Buscar saldo de estoque — soma saldos[] da empresa 2
      const resSaldo = await fetch(
        `${NOMUS_API_URL}/rest/saldosEstoqueProduto/${produto.id}`,
        { headers: nomusHeaders }
      );
      const saldos = await resSaldo.json();
      const empresa = Array.isArray(saldos) ? saldos.find((s: any) => String(s.idEmpresa) === '2') : null;
      const toNum = (v: string = '0') => parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;
      const saldo = empresa?.saldos?.reduce((acc: number, s: any) => acc + toNum(String(s.saldo ?? '0')), 0) ?? 0;
      const custoMedio = empresa?.custoMedioUnitario ? toNum(String(empresa.custoMedioUnitario)) : 0;
      const preco = toNum(String(produto.preco ?? '0'));

      return new Response(JSON.stringify({ saldo, idNomus: produto.id, custoMedio, preco }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else {
      return new Response(JSON.stringify({ error: 'Tipo inválido. Use: clientes, produtos ou estoque' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Basic ${NOMUS_API_KEY}`,
      },
    });

    const rawText = await res.text();
    let data: any;
    try { data = JSON.parse(rawText); } catch { data = rawText; }

    const results = Array.isArray(data) ? data.slice(0, 20).map((item: any) => ({
      id: type === 'clientes' ? item.id : item.id,
      nome: item.nomeFantasia || item.razaoSocial || item.nome || item.descricao || '',
      codigo: item.codigo || '',
    })) : [];

    return new Response(JSON.stringify({ results, _debug: { status: res.status, url, dataType: typeof data, isArray: Array.isArray(data), sample: Array.isArray(data) ? data[0] : data } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ results: [], _debug: { error: msg } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
