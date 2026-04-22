import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type RecordType = 'pa' | 'pg';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const expectedToken = Deno.env.get('POSVENDA_READ_TOKEN');
    if (!expectedToken) return jsonResponse({ error: 'POSVENDA_READ_TOKEN not configured' }, 500);

    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || match[1] !== expectedToken) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { record_type, record_id } = body as { record_type?: RecordType; record_id?: string };

    if (record_type !== 'pa' && record_type !== 'pg') {
      return jsonResponse({ error: 'record_type must be "pa" or "pg"' }, 400);
    }
    if (!record_id) {
      return jsonResponse({ error: 'record_id is required' }, 400);
    }

    const selectRecord = record_type === 'pa'
      ? `id, request_number, status, notes, estimated_cost, squad_sent_at,
         created_at, updated_at,
         tickets (
           id, ticket_number, title, description,
           clients ( id, name, phone, whatsapp, email, city, address ),
           equipments ( id, serial_number, notes, equipment_models ( id, name ) )
         )`
      : `id, claim_number, warranty_status, defect_description, technical_analysis,
         covered_parts, internal_cost, purchase_date, installation_date,
         warranty_period_months, squad_sent_at, created_at, updated_at,
         tickets (
           id, ticket_number, title, description,
           clients ( id, name, phone, whatsapp, email, city, address ),
           equipments ( id, serial_number, notes, equipment_models ( id, name ) )
         )`;

    const table = record_type === 'pa' ? 'service_requests' : 'warranty_claims';
    const { data: record, error: recErr } = await supabase
      .from(table)
      .select(selectRecord)
      .eq('id', record_id)
      .maybeSingle();

    if (recErr) return jsonResponse({ error: recErr.message }, 500);
    if (!record) return jsonResponse({ error: 'Record not found' }, 404);

    const quoteFilter = record_type === 'pa' ? 'service_request_id' : 'warranty_claim_id';
    const { data: quote } = await supabase
      .from('quotes')
      .select(`
        id, quote_number, status, subtotal, discount, freight, total, notes, valid_until, created_at,
        quote_items (
          id, quantity, unit_price, unit_cost, description, item_type,
          products ( id, code, name )
        )
      `)
      .eq(quoteFilter, record_id)
      .maybeSingle();

    const rec = record as Record<string, unknown>;
    const ticket = (rec.tickets as Record<string, unknown> | null) || null;
    const client = ticket ? (ticket.clients as Record<string, unknown> | null) : null;
    const equipment = ticket ? (ticket.equipments as Record<string, unknown> | null) : null;
    const equipmentModel = equipment ? (equipment.equipment_models as Record<string, unknown> | null) : null;

    const items = (quote?.quote_items || []).map((item: Record<string, unknown>) => {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      const isWarranty = String(item.item_type || '').includes('garantia');
      return {
        id: item.id,
        code: (item.products as Record<string, unknown> | null)?.code ?? null,
        product_name: (item.products as Record<string, unknown> | null)?.name ?? null,
        description: item.description,
        item_type: item.item_type,
        quantity: qty,
        unit_price: unitPrice,
        unit_cost: Number(item.unit_cost),
        line_total: qty * unitPrice,
        is_warranty: isWarranty,
      };
    });

    const payload = {
      record_type,
      record_id,
      number: (rec.request_number || rec.claim_number) as string | null,
      status: (rec.status || rec.warranty_status) as string | null,
      notes: rec.notes ?? null,
      created_at: rec.created_at,
      updated_at: rec.updated_at,
      squad_sent_at: rec.squad_sent_at ?? null,
      url: `https://posvenda.liveuni.com.br/${record_type === 'pa' ? 'pedidos-acessorios' : 'pedidos-garantia'}/${record_id}`,
      client: client ? {
        id: client.id,
        name: client.name,
        phone: client.phone,
        whatsapp: client.whatsapp,
        email: client.email,
        city: client.city,
        address: client.address,
      } : null,
      ticket: ticket ? {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        description: ticket.description,
      } : null,
      equipment: equipment ? {
        id: equipment.id,
        serial_number: equipment.serial_number,
        notes: equipment.notes,
        model: equipmentModel ? { id: equipmentModel.id, name: equipmentModel.name } : null,
      } : null,
      pg_details: record_type === 'pg' ? {
        defect_description: rec.defect_description,
        technical_analysis: rec.technical_analysis,
        covered_parts: rec.covered_parts,
        internal_cost: Number(rec.internal_cost ?? 0),
        purchase_date: rec.purchase_date,
        installation_date: rec.installation_date,
        warranty_period_months: rec.warranty_period_months,
      } : undefined,
      pa_details: record_type === 'pa' ? {
        estimated_cost: Number(rec.estimated_cost ?? 0),
      } : undefined,
      quote: quote ? {
        id: quote.id,
        quote_number: quote.quote_number,
        status: quote.status,
        subtotal: Number(quote.subtotal ?? 0),
        discount: Number(quote.discount ?? 0),
        freight: Number(quote.freight ?? 0),
        total: Number(quote.total ?? 0),
        notes: quote.notes,
        valid_until: quote.valid_until,
        created_at: quote.created_at,
      } : null,
      items,
    };

    return jsonResponse(payload);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ error: msg }, 500);
  }
});
