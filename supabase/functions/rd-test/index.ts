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

    const url = `https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}&limit=1`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, status: res.status }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json() as { deals?: Array<{ deal_pipeline?: { id: string; name: string } }> };
    const pipeline = data.deals?.[0]?.deal_pipeline ?? null;

    return new Response(
      JSON.stringify({ ok: true, pipeline }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
