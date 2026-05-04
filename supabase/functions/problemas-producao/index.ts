const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://posvenda.liveuni.com.br',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SQUAD_URL = 'https://squad.liveuni.com.br/api/problemas-producao/webhook';
const WEBHOOK_SECRET = 'squad-problemas-webhook-2026';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { description, client_name } = body as { description?: string; client_name?: string };

    if (!description?.trim() || !client_name?.trim()) {
      return jsonResponse({ error: 'description e client_name são obrigatórios' }, 400);
    }

    const res = await fetch(SQUAD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        description: description.trim(),
        client_name: client_name.trim(),
        received_at: new Date().toISOString(),
      }),
    });

    if (res.status === 401) return jsonResponse({ error: 'Autenticação inválida com o SquadOS.' }, 401);
    if (res.status === 400) return jsonResponse({ error: 'Campo obrigatório faltando na requisição.' }, 400);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return jsonResponse({ error: `SquadOS retornou ${res.status}: ${text.slice(0, 300)}` }, 502);
    }

    const data = await res.json().catch(() => ({}));
    return jsonResponse({ id: data?.id ?? null }, 201);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ error: msg }, 500);
  }
});
