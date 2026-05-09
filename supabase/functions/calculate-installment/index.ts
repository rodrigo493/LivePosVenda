const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { total, brand, secret } = await req.json();

    const WEBHOOK_SECRET = Deno.env.get("SHEETS_WEBHOOK_SECRET");
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!total || !brand) {
      return new Response(JSON.stringify({ error: "total e brand são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const WEBAPP_URL = Deno.env.get("SHEETS_WEBAPP_URL");
    if (!WEBAPP_URL) {
      return new Response(JSON.stringify({ error: "SHEETS_WEBAPP_URL não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total: Number(total), brand }),
    });

    if (!resp.ok) {
      throw new Error(`Apps Script retornou ${resp.status}`);
    }

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
