import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  // Validate JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return jsonRes({ error: "Unauthorized" }, 401);

  let body: { client_name?: string; client_phone?: string; client_id?: string };
  try { body = await req.json(); }
  catch { return jsonRes({ error: "JSON inválido" }, 400); }

  const { client_name, client_phone, client_id } = body;
  if (!client_id && !client_phone && !client_name) {
    return jsonRes({ error: "client_id ou client_name+client_phone são obrigatórios" }, 400);
  }

  // Look up or create client using service role (bypasses RLS)
  let resolvedClientId: string = client_id ?? "";
  let resolvedClientName: string = client_name ?? "";

  if (!resolvedClientId && client_phone) {
    const normalized = client_phone.replace(/\D/g, "");
    const { data: existing } = await sbAdmin
      .from("clients")
      .select("id, name")
      .or(`phone.ilike.%${normalized}%,whatsapp.ilike.%${normalized}%`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      resolvedClientId = existing.id;
      resolvedClientName = existing.name;
    } else {
      // Create new client
      const { data: newClient, error: clientErr } = await sbAdmin
        .from("clients")
        .insert({
          name: client_name || client_phone,
          whatsapp: client_phone,
          created_by: user.id,
        })
        .select("id, name")
        .single();
      if (clientErr) return jsonRes({ error: clientErr.message }, 500);
      resolvedClientId = newClient.id;
      resolvedClientName = newClient.name;
    }
  }

  if (!resolvedClientId) return jsonRes({ error: "Não foi possível resolver o cliente" }, 400);

  // Check if there's already a CRM card for this client
  const { data: existingTicket } = await sbAdmin
    .from("tickets")
    .select("id")
    .eq("client_id", resolvedClientId)
    .not("pipeline_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as any;

  if (existingTicket?.id) {
    return jsonRes({ ticket_id: existingTicket.id, created: false });
  }

  // Create the CRM card using service role (bypasses all RLS)
  const { data: ticket, error: ticketErr } = await sbAdmin
    .from("tickets")
    .insert({
      client_id: resolvedClientId,
      ticket_type: "chamado_tecnico",
      title: `Atendimento - ${resolvedClientName}`,
      ticket_number: "",
      pipeline_stage: "sem_atendimento",
      created_by: user.id,
    } as any)
    .select("id")
    .single();

  if (ticketErr) return jsonRes({ error: ticketErr.message }, 500);

  return jsonRes({ ticket_id: ticket.id, created: true });
});
