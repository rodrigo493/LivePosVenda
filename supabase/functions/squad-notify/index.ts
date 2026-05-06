import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://posvenda.liveuni.com.br',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-supabase-client-runtime-version',
};

const SQUAD_BASE = 'https://squad.liveuni.com.br';
const POSVENDA_BASE = 'https://posvenda.liveuni.com.br';

type RecordType = 'pa' | 'pd' | 'pg';
type Target = 'pos-venda' | 'gerar-op' | 'pedido-acessorios';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function squadUrlFor(target: Target): string {
  const endpoints: Record<Target, string> = {
    'pos-venda': `${SQUAD_BASE}/api/pos-venda`,
    'gerar-op': `${SQUAD_BASE}/api/gerar-op`,
    'pedido-acessorios': `${SQUAD_BASE}/api/pedido-acessorios`,
  };
  return endpoints[target] ?? endpoints['pos-venda'];
}

function pathFor(recordType: RecordType, recordId: string): string {
  const segments: Record<RecordType, string> = {
    pa: 'pedidos-acessorios',
    pd: 'pedidos-direto',
    pg: 'pedidos-garantia',
  };
  const segment = segments[recordType] ?? 'pedidos-acessorios';
  return `${POSVENDA_BASE}/${segment}/${recordId}`;
}

function tableFor(recordType: RecordType): string {
  const tables: Record<RecordType, string> = {
    pa: 'service_requests',
    pd: 'service_requests',
    pg: 'warranty_claims',
  };
  return tables[recordType] ?? 'service_requests';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SQUAD_TOKEN = Deno.env.get('SQUAD_TOKEN');
    if (!SQUAD_TOKEN) return jsonResponse({ error: 'SQUAD_TOKEN not configured' }, 500);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { record_type, record_id, reference, message, target } = body as {
      record_type?: RecordType;
      record_id?: string;
      reference?: string;
      message?: string;
      target?: Target;
    };

    if (record_type !== 'pa' && record_type !== 'pd' && record_type !== 'pg') {
      return jsonResponse({ error: 'record_type must be "pa", "pd" or "pg"' }, 400);
    }
    if (!record_id || !reference) {
      return jsonResponse({ error: 'record_id and reference are required' }, 400);
    }

    const resolvedTarget: Target = target ?? 'pos-venda';
    const squadUrl = squadUrlFor(resolvedTarget);
    const url = pathFor(record_type, record_id);
    const table = tableFor(record_type);

    // Usa message passado ou busca squad_notes no banco (apenas para pos-venda)
    let notes: string | null = message ?? null;
    if (!notes && resolvedTarget === 'pos-venda') {
      const { data: record } = await supabase
        .from(table)
        .select('squad_notes')
        .eq('id', record_id)
        .maybeSingle();
      notes = (record as { squad_notes?: string | null } | null)?.squad_notes ?? null;
    }

    let status: number | null = null;
    let errorText: string | null = null;

    try {
      const res = await fetch(squadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SQUAD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reference, url, ...(notes ? { notes } : {}) }),
      });
      status = res.status;
      if (!res.ok) {
        if (res.status !== 409) {
          const text = await res.text().catch(() => '');
          errorText = `Squad [${res.status}]: ${text.slice(0, 500)}`;
        }
      }
    } catch (e) {
      errorText = e instanceof Error ? e.message : 'Falha de rede ao chamar Squad';
    }

    // Persiste resultado apenas para pos-venda (tem colunas squad_sent_at no banco)
    if (resolvedTarget === 'pos-venda') {
      const { error: dbErr } = await supabase
        .from(table)
        .update({
          squad_sent_at: new Date().toISOString(),
          squad_response_status: status,
          squad_error: errorText,
        })
        .eq('id', record_id);
      if (dbErr) console.error('[squad-notify] db update error:', dbErr.message);
    }

    if (errorText) return jsonResponse({ success: false, status, error: errorText });
    return jsonResponse({ success: true, status });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ error: msg }, 500);
  }
});
