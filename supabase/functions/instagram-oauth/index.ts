import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_BASE_URL = "https://posvenda.liveuni.com.br";

const CORS = {
  "Access-Control-Allow-Origin": APP_BASE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function exchangeAndSave(code: string, redirectUri: string): Promise<{ username: string; picture_url: string | null; expires_at: string } | { error: string }> {
  const APP_ID = Deno.env.get("META_APP_ID")!;
  const APP_SECRET = Deno.env.get("META_APP_SECRET")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1. Troca code por short-lived user token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?` +
    `client_id=${APP_ID}&client_secret=${APP_SECRET}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
  );
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error("[instagram-oauth] token exchange failed:", JSON.stringify(tokenData));
    return { error: tokenData?.error?.message ?? "Token exchange failed" };
  }

  // 2. Troca por long-lived token (60 dias)
  const llRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?` +
    `grant_type=fb_exchange_token&client_id=${APP_ID}&` +
    `client_secret=${APP_SECRET}&access_token=${tokenData.access_token}`
  );
  const llData = await llRes.json();
  const longToken = llData.access_token ?? tokenData.access_token;
  const expiresIn = llData.expires_in ?? 5183944;

  // 3. Busca Pages do usuário
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?` +
    `fields=id,instagram_business_account{id,username,profile_picture_url}&` +
    `access_token=${longToken}`
  );
  const pagesData = await pagesRes.json();
  const page = (pagesData.data ?? []).find((p: any) => p.instagram_business_account);
  if (!page) {
    return { error: "Nenhuma conta Instagram Business encontrada vinculada a uma Página Facebook" };
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

  if (upsertErr) return { error: upsertErr.message };

  return {
    username: igAccount.username,
    picture_url: igAccount.profile_picture_url ?? null,
    expires_at: tokenExpiresAt,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const EDGE_FN_REDIRECT_URI = Deno.env.get("INSTAGRAM_REDIRECT_URI") ?? `${SUPABASE_URL}/functions/v1/instagram-oauth`;

  // ── GET: callback direto do Facebook (server-side) ───────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
      const msg = url.searchParams.get("error_description") ?? "Acesso negado";
      return Response.redirect(`${APP_BASE_URL}/configuracoes?ig_error=${encodeURIComponent(msg)}`, 302);
    }

    const result = await exchangeAndSave(code, EDGE_FN_REDIRECT_URI);
    if ("error" in result) {
      return Response.redirect(`${APP_BASE_URL}/configuracoes?ig_error=${encodeURIComponent(result.error)}`, 302);
    }
    return Response.redirect(`${APP_BASE_URL}/configuracoes?ig_connected=${encodeURIComponent(result.username)}`, 302);
  }

  // ── POST: chamada manual (compatibilidade) ────────────────────────────────────
  if (req.method === "POST") {
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await sbUser.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { code, redirect_uri } = await req.json();
    if (!code || !redirect_uri) return json({ error: "code and redirect_uri required" }, 400);

    const result = await exchangeAndSave(code, redirect_uri);
    if ("error" in result) return json({ error: result.error }, 400);
    return json({ success: true, ...result });
  }

  return json({ error: "Method not allowed" }, 405);
});
