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

async function fetchWithThrottle(url: string, headers: HeadersInit, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status !== 429) return res;
    let wait = 5000;
    try {
      const body = await res.clone().json();
      if (body.tempoAteLiberar) wait = Number(body.tempoAteLiberar) * 1000;
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error("Rate limit exceeded after retries");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const NOMUS_API_KEY = Deno.env.get("NOMUS_API_KEY");
  const NOMUS_API_URL = Deno.env.get("NOMUS_API_URL");

  if (!NOMUS_API_KEY || !NOMUS_API_URL) {
    return json({ error: "Secrets NOMUS_API_KEY e NOMUS_API_URL não configurados" }, 500);
  }

  const authHeader = { Authorization: `Basic ${NOMUS_API_KEY}`, "Content-Type": "application/json" };

  // 1. Fetch all pages of /produtos
  const allRaw: any[] = [];
  let page = 1;
  while (page <= 50) {
    const url = `${NOMUS_API_URL}/rest/produtos?query=ativo=true&pagina=${page}`;
    let res: Response;
    try {
      res = await fetchWithThrottle(url, authHeader);
    } catch {
      break;
    }
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    allRaw.push(...data);
    if (data.length < 20) break; // last page has fewer than 20 items
    page++;
  }

  // 2. Map products + aggregate saldo from empresasSetoresEstoque
  const products: ProductRow[] = allRaw.map((p: any) => {
    const saldoTotal = ((p.empresasSetoresEstoque as any[]) || []).reduce(
      (sum: number, e: any) => sum + (Number(e.saldoEstoqueAtualEmpresa) || 0),
      0,
    );
    return {
      id: Number(p.id),
      codigo: String(p.codigo || ""),
      descricao: String(p.descricao || p.nome || ""),
      siglaUnidadeMedida: String(p.siglaUnidadeMedida || ""),
      saldoTotal,
      custoMedioUnitario: null,
      custoTotal: null,
    };
  });

  // 3. Fetch cost details for products with stock (batch 5 at a time, max 120)
  const withStock = products.filter((p) => p.saldoTotal > 0).slice(0, 120);

  const fetchCost = async (p: ProductRow) => {
    try {
      const res = await fetchWithThrottle(
        `${NOMUS_API_URL}/rest/saldosEstoqueProduto/${p.id}`,
        authHeader,
      );
      if (!res.ok) return;
      const data = await res.json();
      const items: any[] = Array.isArray(data) ? data : [data];
      if (items.length === 0) return;
      // saldoTotal and custoMedioUnitario are at the top level or per-setor
      const totalSaldo = items.reduce((s, i) => s + (Number(i.saldoTotal) || 0), 0);
      const totalCusto = items.reduce((s, i) => s + (Number(i.custoTotal) || 0), 0);
      const custoMedio = totalSaldo > 0 ? totalCusto / totalSaldo : (items[0]?.custoMedioUnitario ?? null);
      p.saldoTotal = totalSaldo || p.saldoTotal;
      p.custoMedioUnitario = custoMedio;
      p.custoTotal = totalCusto || null;
    } catch { /* ignore individual failures */ }
  };

  for (let i = 0; i < withStock.length; i += 5) {
    await Promise.all(withStock.slice(i, i + 5).map(fetchCost));
  }

  // Sort: in-stock first, then alphabetically
  products.sort((a, b) => {
    if (b.saldoTotal !== a.saldoTotal) return b.saldoTotal - a.saldoTotal;
    return a.descricao.localeCompare(b.descricao, "pt-BR");
  });

  return json(products);
});
