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

interface NomusSectorStock {
  idSetorEstoque: number;
  nomeSetorEstoque: string;
  saldo: number;
}

interface ProductRow {
  id: number;
  codigo: string;
  descricao: string;
  siglaUnidadeMedida: string;
  saldoTotal: number;
  custoMedioUnitario: number | null;
  custoTotal: number | null;
  saldoPorSetor: NomusSectorStock[];
}

// Nomus retorna números no formato BR ("1.234,56") — Number() puro retorna NaN
function parseNomusBR(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
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

    // 2. Mapear produtos — saldo, custo e setores vindos de empresasSetoresEstoque
    const products: ProductRow[] = allRaw.map((p: any) => {
      const empresas: any[] = p.empresasSetoresEstoque || p.setoresEstoque || [];

      // Preferir empresa 2 (Live Equipamentos), fallback para a primeira disponível
      const empresa = empresas.find((e: any) => Number(e.idEmpresa) === 2) ?? empresas[0];

      let saldoTotal = 0;
      let custoMedioUnitario: number | null = null;
      let custoTotal: number | null = null;
      const saldoPorSetor: NomusSectorStock[] = [];

      if (empresa) {
        saldoTotal = parseNomusBR(
          empresa.saldoTotal ?? empresa.saldoEstoqueAtualEmpresa ?? empresa.saldoEstoque ?? empresa.saldo ?? 0,
        );

        if (empresa.custoMedioUnitario != null) {
          custoMedioUnitario = parseNomusBR(empresa.custoMedioUnitario);
        }

        // Extrair setores aninhados (campo pode variar conforme versão da API)
        const rawSetores = empresa.saldos || empresa.setores || empresa.saldosPorSetor || empresa.setoresEstoque || [];
        if (Array.isArray(rawSetores)) {
          for (const s of rawSetores) {
            saldoPorSetor.push({
              idSetorEstoque: Number(s.idSetorEstoque || s.id || 0),
              nomeSetorEstoque: String(s.nomeSetorEstoque || s.nome || s.descricao || ""),
              saldo: parseNomusBR(s.saldo ?? s.saldoEstoque ?? 0),
            });
          }
          // Se há setores com dados, recalcular total por eles
          if (saldoPorSetor.length > 0) {
            const totalSetor = saldoPorSetor.reduce((sum, s) => sum + s.saldo, 0);
            if (totalSetor !== 0) saldoTotal = totalSetor;
          }
        }

        custoTotal = custoMedioUnitario != null ? custoMedioUnitario * saldoTotal : null;
      } else {
        // Fallback: somar todas as empresas com parse BR correto
        saldoTotal = empresas.reduce(
          (sum: number, e: any) =>
            sum + parseNomusBR(e.saldoTotal ?? e.saldoEstoqueAtualEmpresa ?? e.saldoEstoque ?? e.saldo ?? 0),
          0,
        );
      }

      return {
        id: Number(p.id),
        codigo: String(p.codigo || ""),
        descricao: String(p.descricao || p.nome || ""),
        siglaUnidadeMedida: String(p.siglaUnidadeMedida || p.unidadeMedida || ""),
        saldoTotal,
        custoMedioUnitario,
        custoTotal,
        saldoPorSetor,
      };
    });

    products.sort((a, b) => b.saldoTotal - a.saldoTotal || a.descricao.localeCompare(b.descricao, "pt-BR"));

    const comEstoque = products.filter((p) => p.saldoTotal > 0).length;
    console.log(`Retornando ${products.length} produtos (${comEstoque} com estoque positivo)`);
    return json(products);
  } catch (err) {
    console.error("Handler error:", String(err));
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
