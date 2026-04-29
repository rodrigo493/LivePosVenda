import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://posvenda.liveuni.com.br',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SQUAD_URL = 'https://squad.liveuni.com.br/api/pos-venda';
const POSVENDA_BASE = 'https://posvenda.liveuni.com.br';

type RecordType = 'pa' | 'pg';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function pathFor(recordType: RecordType, recordId: string): string {
  const segment = recordType === 'pa' ? 'pedidos-acessorios' : 'pedidos-garantia';
  return `${POSVENDA_BASE}/${segment}/${recordId}`;
}

function tableFor(recordType: RecordType): string {
  return recordType === 'pa' ? 'service_requests' : 'warranty_claims';
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
    const { record_type, record_id, reference } = body as {
      record_type?: RecordType;
      record_id?: string;
      reference?: string;
    };

    if (record_type !== 'pa' && record_type !== 'pg') {
      return jsonResponse({ error: 'record_type must be "pa" or "pg"' }, 400);
    }
    if (!record_id || !reference) {
      return jsonResponse({ error: 'record_id and reference are required' }, 400);
    }

    const url = pathFor(record_type, record_id);
    const table = tableFor(record_type);

    // Fetch squad_notes from the record to include in the Squad payload
    const { data: record } = await supabase
      .from(table)
      .select('squad_notes')
      .eq('id', record_id)
      .maybeSingle();
    const squadNotes: string | null = (record as any)?.squad_notes ?? null;

    let status: number | null = null;
    let errorText: string | null = null;

    try {
      const res = await fetch(SQUAD_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SQUAD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reference, url, ...(squadNotes ? { notes: squadNotes } : {}) }),
      });
      status = res.status;
      if (!res.ok) {
        // 409 = instância já existe no Squad → já foi notificado, tratar como sucesso
        if (res.status === 409) {
          status = 409;
        } else {
          const text = await res.text().catch(() => '');
          errorText = `Squad [${res.status}]: ${text.slice(0, 500)}`;
        }
      }
    } catch (e) {
      errorText = e instanceof Error ? e.message : 'Falha de rede ao chamar Squad';
    }

    await supabase
      .from(table)
      .update({
        squad_sent_at: new Date().toISOString(),
        squad_response_status: status,
        squad_error: errorText,
      })
      .eq('id', record_id);

    if (errorText) return jsonResponse({ success: false, status, error: errorText });
    return jsonResponse({ success: true, status });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ error: msg }, 500);
  }
});
