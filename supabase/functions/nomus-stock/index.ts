import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function fetchSaldo(nomusId: number): Promise<{
  saldoTotal: number;
  custoMedioUnitario: number | null;
  custoTotal: number | null;
  saldoPorSetor: NomusSectorStock[];
}> {
  const data = await fetchNomus(`/rest/saldosEstoqueProduto/${nomusId}`);

  if (!Array.isArray(data) || data.length === 0) {
    return { saldoTotal: 0, custoMedioUnitario: null, custoTotal: null, saldoPorSetor: [] };
  }

  // Filtrar empresa 2 (Live Equipamentos) — idEmpresa pode ser string ou número
  const empresa = data.find((e: any) => String(e.idEmpresa) === "2") ?? null;
  if (!empresa) {
    console.log(`Produto ${nomusId}: empresa 2 não encontrada. Empresas disponíveis: ${data.map((e: any) => e.idEmpresa).join(", ")}`);
    return { saldoTotal: 0, custoMedioUnitario: null, custoTotal: null, saldoPorSetor: [] };
  }

  // saldos[] é a única fonte de estoque — saldoTotal não existe na resposta
  const rawSaldos: any[] = Array.isArray(empresa.saldos) ? empresa.saldos : [];

  const saldoPorSetor: NomusSectorStock[] = rawSaldos.map((s: any) => ({
    idSetorEstoque: Number(s.idSetorEstoque || 0),
    nomeSetorEstoque: String(s.nomeSetorEstoque || ""),
    saldo: parseNomusBR(s.saldo),
  }));

  const saldoTotal = saldoPorSetor.reduce((sum, s) => sum + s.saldo, 0);

  // custoMedioUnitario pode não existir — só aparece para produtos com custo registrado
  const custoMedioUnitario = empresa.custoMedioUnitario != null
    ? parseNomusBR(empresa.custoMedioUnitario)
    : null;

  const custoTotal = custoMedioUnitario != null && saldoTotal > 0
    ? custoMedioUnitario * saldoTotal
    : null;

  return { saldoTotal, custoMedioUnitario, custoTotal, saldoPorSetor };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Buscar códigos do catálogo interno no Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: internalProducts } = await supabase
      .from("products")
      .select("code, secondary_code")
      .eq("status", "ativo");

    const catalogCodes = new Set<string>();
    for (const p of internalProducts || []) {
      if (p.code) catalogCodes.add(p.code.trim().toUpperCase());
      if (p.secondary_code) catalogCodes.add(p.secondary_code.trim().toUpperCase());
    }

    console.log(`Catálogo interno: ${catalogCodes.size} códigos ativos`);

    // 2. Buscar todas as páginas de produtos Nomus (500ms entre páginas para evitar rate limit)
    const allRaw: any[] = [];
    let page = 1;
    while (page <= 50) {
      if (page > 1) await new Promise((r) => setTimeout(r, 500));
      const data = await fetchNomus(`/rest/produtos?query=ativo=true&pagina=${page}`);
      if (!Array.isArray(data) || data.length === 0) break;
      allRaw.push(...data);
      if (data.length < 20) break;
      page++;
    }

    console.log(`Nomus: ${allRaw.length} produtos ativos`);

    if (allRaw.length === 0) {
      return json({ error: "Nenhum produto retornado pela API Nomus" }, 500);
    }

    // 3. Identificar quais produtos Nomus estão no catálogo interno
    const catalogMatches = allRaw.filter((p) =>
      catalogCodes.has(String(p.codigo || "").trim().toUpperCase())
    );

    console.log(`${catalogMatches.length} produtos Nomus correspondem ao catálogo interno`);

    // 4. Buscar saldo apenas para os produtos do catálogo (sequencial, 600ms entre chamadas)
    const saldoMap = new Map<number, Awaited<ReturnType<typeof fetchSaldo>>>();

    for (const p of catalogMatches) {
      const nomusId = Number(p.id);
      await new Promise((r) => setTimeout(r, 600));
      saldoMap.set(nomusId, await fetchSaldo(nomusId));
    }

    const comSaldo = [...saldoMap.values()].filter((s) => s.saldoTotal !== 0).length;
    console.log(`Saldos buscados: ${saldoMap.size} produtos, ${comSaldo} com saldo não-zero`);

    // 5. Montar response final com todos os produtos Nomus
    const products: ProductRow[] = allRaw.map((p: any) => {
      const nomusId = Number(p.id);
      const saldo = saldoMap.get(nomusId) ?? {
        saldoTotal: 0,
        custoMedioUnitario: null,
        custoTotal: null,
        saldoPorSetor: [],
      };

      return {
        id: nomusId,
        codigo: String(p.codigo || ""),
        descricao: String(p.descricao || p.nome || ""),
        siglaUnidadeMedida: String(p.siglaUnidadeMedida || p.unidadeMedida || ""),
        ...saldo,
      };
    });

    products.sort((a, b) => b.saldoTotal - a.saldoTotal || a.descricao.localeCompare(b.descricao, "pt-BR"));

    return json(products);
  } catch (err) {
    console.error("Handler error:", String(err));
    return json({ error: `Erro interno: ${String(err)}` }, 500);
  }
});
