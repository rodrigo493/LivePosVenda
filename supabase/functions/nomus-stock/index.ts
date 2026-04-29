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

// Nomus é chamado via proxy Nginx no VPS (OpenSSL), pois o runtime Deno (Rustls)
// é incompatível com o TLS antigo do servidor live.nomus.com.br.
const NOMUS_PROXY = "https://posvenda.liveuni.com.br/api/nomus";

interface ProductRow {
  id: number;
  codigo: string;
  descricao: string;
  siglaUnidadeMedida: string;
  saldoTotal: number;
  custoMedioUnitario: number | null;
  custoTotal: number | null;
}

async function fetchNomus(path: string, retries = 2): Promise<any> {
  const url = `${NOMUS_PROXY}${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      });
      const rawText = await res.text();
      if (res.status === 429) {
        let wait = 5000;
        try { const b = JSON.parse(rawText); if (b.tempoAteLiberar) wait = Number(b.tempoAteLiberar) * 1000; } catch { /* */ }
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        console.error(`Nomus HTTP ${res.status} for ${path}: ${rawText.slice(0, 200)}`);
        return null;
      }
      try { return JSON.parse(rawText); } catch { return rawText; }
    } catch (err) {
      console.error(`fetchNomus attempt ${attempt + 1}/${retries + 1} failed for ${path}:`, String(err));
      if (attempt >= retries) return null;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Buscar todas as páginas de produtos ativos
    const allRaw: any[] = [];
    let page = 1;
    while (page <= 50) {
      const data = await fetchNomus(`/rest/produtos?query=ativo=true&pagina=${page}`);
      if (!Array.isArray(data) || data.length === 0) break;
      allRaw.push(...data);
      if (data.length < 20) break;
      page++;
    }

    console.log(`Total de produtos carregados: ${allRaw.length}`);

    if (allRaw.length === 0) {
      return json({ error: "Nenhum produto retornado pela API Nomus" }, 500);
    }

    // 2. Mapear produtos e agregar saldo por setor
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

    // Custo removido: cada produto requer uma chamada extra à API (timeout).
    // O saldo já está nos dados do produto via empresasSetoresEstoque.
    products.sort((a, b) => b.saldoTotal - a.saldoTotal || a.descricao.localeCompare(b.descricao, "pt-BR"));

    console.log(`Retornando ${products.length} produtos`);
    return json(products);
  } catch (err) {
    console.error("Handler error:", String(err));
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
