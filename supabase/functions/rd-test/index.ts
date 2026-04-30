const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { token } = await req.json() as { token: string };
    if (!token) {
      return new Response(JSON.stringify({ error: "token obrigatório" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Valida token com chamada leve
    const testUrl = `https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}&limit=1`;
    const testRes = await fetch(testUrl, { headers: { Accept: "application/json" } });

    if (!testRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, status: testRes.status }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Busca todos os pipelines
    const pipelinesUrl = `https://crm.rdstation.com/api/v1/deal_pipelines?token=${encodeURIComponent(token)}`;
    const pipelinesRes = await fetch(pipelinesUrl, { headers: { Accept: "application/json" } });

    let pipelines: { id: string; name: string }[] = [];

    if (pipelinesRes.ok) {
      const pData = await pipelinesRes.json() as { deal_pipelines?: Array<{ _id: string; name: string }> };
      pipelines = (pData.deal_pipelines ?? []).map((p) => ({ id: p._id, name: p.name }));
    }

    // Fallback: tenta extrair pipeline do primeiro deal
    if (pipelines.length === 0) {
      const dealsData = await testRes.json() as { deals?: Array<{ deal_pipeline?: { id: string; name: string } }> };
      const p = dealsData.deals?.[0]?.deal_pipeline;
      if (p) pipelines = [{ id: p.id, name: p.name }];
    }

    // Contagem total de deals (sem filtro de pipeline)
    let totalDeals: number | null = null;
    try {
      const countUrl = `https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}&limit=1&page=1`;
      const countRes = await fetch(countUrl, { headers: { Accept: "application/json" } });
      if (countRes.ok) {
        const countData = await countRes.json() as { total?: number };
        if (typeof countData.total === "number") totalDeals = countData.total;
      }
    } catch { /* não bloqueia */ }

    return new Response(
      JSON.stringify({
        ok: true,
        // Compatibilidade: mantém campo `pipeline` apontando para o primeiro
        pipeline: pipelines[0] ?? null,
        pipelines,
        total_deals: totalDeals,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
