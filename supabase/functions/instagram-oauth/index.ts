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

  const APP_ID = Deno.env.get("META_APP_ID")!;
  const APP_SECRET = Deno.env.get("META_APP_SECRET")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Valida JWT do usuário (deve ser admin)
  const authHeader = req.headers.get("Authorization") ?? "";
  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const { code, redirect_uri } = await req.json();
  if (!code || !redirect_uri) return json({ error: "code and redirect_uri required" }, 400);

  // 1. Troca code por short-lived user token (Facebook OAuth)
  const tokenRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?` +
    `client_id=${APP_ID}&client_secret=${APP_SECRET}&` +
    `redirect_uri=${encodeURIComponent(redirect_uri)}&code=${code}`
  );
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error("[instagram-oauth] token exchange failed:", JSON.stringify(tokenData));
    console.error("[instagram-oauth] redirect_uri used:", redirect_uri);
    console.error("[instagram-oauth] APP_ID:", APP_ID ? APP_ID.slice(0, 6) + "..." : "MISSING");
    return json({ error: "Token exchange failed", detail: tokenData }, 400);
  }

  // 2. Troca por long-lived token (60 dias)
  const llRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?` +
    `grant_type=fb_exchange_token&client_id=${APP_ID}&` +
    `client_secret=${APP_SECRET}&access_token=${tokenData.access_token}`
  );
  const llData = await llRes.json();
  const longToken = llData.access_token ?? tokenData.access_token;
  const expiresIn = llData.expires_in ?? 5183944; // 60 days default

  // 3. Busca Pages do usuário e encontra a conta Instagram Business vinculada
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?` +
    `fields=id,instagram_business_account{id,username,profile_picture_url}&` +
    `access_token=${longToken}`
  );
  const pagesData = await pagesRes.json();

  // Encontra a primeira página com Instagram Business Account
  const page = (pagesData.data ?? []).find((p: any) => p.instagram_business_account);
  if (!page) {
    return json({ error: "Nenhuma conta Instagram Business encontrada vinculada a uma Página Facebook" }, 400);
  }

  const igAccount = page.instagram_business_account;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // 4. Salva em instagram_account (upsert)
  const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error: upsertErr } = await sbAdmin
    .from("instagram_account")
    .upsert({
      ig_user_id: igAccount.id,
      username: igAccount.username,
      picture_url: igAccount.profile_picture_url ?? null,
      access_token: longToken,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "ig_user_id" });

  if (upsertErr) return json({ error: upsertErr.message }, 500);

  return json({
    success: true,
    username: igAccount.username,
    picture_url: igAccount.profile_picture_url ?? null,
    expires_at: tokenExpiresAt,
  });
});
