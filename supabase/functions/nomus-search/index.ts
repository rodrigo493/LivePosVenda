const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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
      return new Response(JSON.stringify({ error: 'Nomus não configurado' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { type, query } = await req.json();

    let url = '';
    if (type === 'clientes') {
      const searchTerm = query.trim().split(/\s+/)[0];
      url = `${NOMUS_API_URL}/rest/pessoas?query=nome==*${encodeURIComponent(searchTerm)}*`;
    } else if (type === 'produtos') {
      url = `${NOMUS_API_URL}/rest/produtos?query=codigo==*${encodeURIComponent(query)}*`;
    } else {
      return new Response(JSON.stringify({ error: 'Tipo inválido. Use: clientes ou produtos' }), {
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

    const data = await res.json();

    const results = Array.isArray(data) ? data.slice(0, 20).map((item: any) => ({
      id: type === 'clientes' ? item.id : item.id,
      nome: item.nome || item.descricao || '',
      codigo: item.codigo || '',
    })) : [];

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
