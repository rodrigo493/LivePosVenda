import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const { conversation_id, content, message_type, ig_message_id } = await req.json();
  if (!conversation_id || !content) return json({ error: "conversation_id e content são obrigatórios" }, 400);

  const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: conv } = await sbAdmin
    .from("instagram_conversations")
    .select("ig_sender_id")
    .eq("id", conversation_id)
    .single();
  if (!conv) return json({ error: "Conversa não encontrada" }, 404);

  const { data: account } = await sbAdmin
    .from("instagram_account")
    .select("ig_user_id, access_token")
    .limit(1)
    .single();
  if (!account) return json({ error: "Conta Instagram não conectada" }, 400);

  let graphRes: Response;

  if (message_type === "comment" && ig_message_id) {
    graphRes = await fetch(
      `https://graph.facebook.com/v21.0/${ig_message_id}/replies`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          access_token: account.access_token,
        }),
      }
    );
  } else {
    graphRes = await fetch(
      `https://graph.facebook.com/v21.0/${account.ig_user_id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: conv.ig_sender_id },
          message: { text: content },
          access_token: account.access_token,
        }),
      }
    );
  }

  const graphData = await graphRes.json();
  if (!graphRes.ok) return json({ error: "Graph API error", detail: graphData.error?.message }, 502);

  await sbAdmin.from("instagram_messages").insert({
    conversation_id,
    ig_message_id: graphData.id ?? graphData.message_id ?? null,
    message_type: message_type ?? "dm",
    direction: "outbound",
    content,
  });

  await sbAdmin.from("instagram_conversations").update({
    last_message: content.slice(0, 500),
    last_message_at: new Date().toISOString(),
  }).eq("id", conversation_id);

  return json({ success: true });
});
