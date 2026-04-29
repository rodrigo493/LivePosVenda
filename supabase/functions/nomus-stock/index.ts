const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface ProductRow {
  id: number;
  codigo: string;
  descricao: string;
  siglaUnidadeMedida: string;
  saldoTotal: number;
  custoMedioUnitario: number | null;
  custoTotal: number | null;
}

async function fetchNomus(url: string, headers: HeadersInit, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers });
      const rawText = await res.text();
      console.log(`fetchNomus ${res.status} ${url.slice(-80)} → ${rawText.slice(0, 150)}`);
      if (res.status === 429) {
        let wait = 5000;
        try { const b = JSON.parse(rawText); if (b.tempoAteLiberar) wait = Number(b.tempoAteLiberar) * 1000; } catch { /* */ }
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`Nomus HTTP ${res.status} for ${url}`);
        return null;
      }
      try { return JSON.parse(rawText); } catch { return rawText; }
    } catch (err) {
      console.error(`fetchNomus attempt ${attempt + 1}/${retries + 1} failed for ${url}:`, String(err));
      if (attempt >= retries) return null;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const NOMUS_API_KEY = Deno.env.get("NOMUS_API_KEY");
  const NOMUS_API_URL = Deno.env.get("NOMUS_API_URL");

  if (!NOMUS_API_KEY || !NOMUS_API_URL) {
    console.error("Secrets não configurados", { hasKey: !!NOMUS_API_KEY, hasUrl: !!NOMUS_API_URL });
    return json({ error: "Secrets NOMUS_API_KEY e NOMUS_API_URL não configurados" }, 500);
  }

  const authHeaders = {
    Authorization: `Basic ${NOMUS_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  console.log("Iniciando busca de produtos no Nomus:", NOMUS_API_URL);

  // 1. Fetch all pages of /produtos (sem filtro para garantir compatibilidade)
  const allRaw: any[] = [];
  let firstPageRaw: any = undefined;
  let page = 1;
  while (page <= 50) {
    const url = `${NOMUS_API_URL}/rest/produtos?pagina=${page}`;
    console.log(`Buscando página ${page}: ${url}`);
    const data = await fetchNomus(url, authHeaders);
    if (page === 1) firstPageRaw = data;
    if (!Array.isArray(data)) {
      console.log(`Página ${page} retornou não-array:`, JSON.stringify(data)?.slice(0, 200));
      break;
    }
    console.log(`Página ${page}: ${data.length} produtos`);
    if (data.length === 0) break;
    allRaw.push(...data);
    if (data.length < 20) break;
    page++;
  }

  console.log(`Total de produtos carregados: ${allRaw.length}`);

  if (allRaw.length > 0) {
    console.log("Exemplo de produto (campos):", Object.keys(allRaw[0]).join(", "));
    console.log("Exemplo produto[0]:", JSON.stringify(allRaw[0])?.slice(0, 500));
  }

  // 2. Map products + aggregate saldo
  const products: ProductRow[] = allRaw.map((p: any) => {
    const setores: any[] = p.empresasSetoresEstoque || p.setoresEstoque || [];
    const saldoTotal = setores.reduce(
      (sum: number, e: any) =>
        sum + (Number(e.saldoEstoqueAtualEmpresa ?? e.saldoEstoque ?? e.saldo ?? 0) || 0),
      0,
    );
    return {
      id: Number(p.id),
      codigo: String(p.codigo || ""),
      descricao: String(p.descricao || p.nome || ""),
      siglaUnidadeMedida: String(p.siglaUnidadeMedida || p.unidadeMedida || ""),
      saldoTotal,
      custoMedioUnitario: null,
      custoTotal: null,
    };
  });

  // 3. Fetch cost for products with stock (batch 5)
  const withStock = products.filter((p) => p.saldoTotal > 0).slice(0, 100);
  console.log(`Produtos com estoque: ${withStock.length}`);

  const fetchCost = async (p: ProductRow) => {
    const data = await fetchNomus(`${NOMUS_API_URL}/rest/saldosEstoqueProduto/${p.id}`, authHeaders);
    if (!data) return;
    const items: any[] = Array.isArray(data) ? data : [data];
    if (items.length === 0) return;
    const totalSaldo = items.reduce((s, i) => s + (Number(i.saldoTotal) || 0), 0);
    const totalCusto = items.reduce((s, i) => s + (Number(i.custoTotal) || 0), 0);
    p.saldoTotal = totalSaldo || p.saldoTotal;
    p.custoMedioUnitario = totalSaldo > 0 ? totalCusto / totalSaldo : (items[0]?.custoMedioUnitario ?? null);
    p.custoTotal = totalCusto || null;
  };

  for (let i = 0; i < withStock.length; i += 5) {
    await Promise.all(withStock.slice(i, i + 5).map(fetchCost));
  }

  products.sort((a, b) => b.saldoTotal - a.saldoTotal || a.descricao.localeCompare(b.descricao, "pt-BR"));

  console.log(`Retornando ${products.length} produtos`);
  if (products.length === 0) {
    return json({ _debug: { nomusUrl: NOMUS_API_URL, firstPageRaw, totalRaw: allRaw.length }, products: [] });
  }
  return json(products);
});
