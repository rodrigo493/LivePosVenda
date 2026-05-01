import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { token } = await req.json() as { token: string };
    if (!token) {
      return new Response(JSON.stringify({ error: "token obrigatório" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Valida token
    const testUrl = `https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}&limit=1`;
    const testRes = await fetch(testUrl, { headers: { Accept: "application/json" } });

    if (!testRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, status: testRes.status }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Busca pipelines
    const pipelinesRes = await fetch(
      `https://crm.rdstation.com/api/v1/deal_pipelines?token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" } },
    );
    let pipelines: { id: string; name: string }[] = [];
    if (pipelinesRes.ok) {
      const pData = await pipelinesRes.json() as { deal_pipelines?: Array<{ _id: string; name: string }> };
      pipelines = (pData.deal_pipelines ?? []).map((p) => ({ id: p._id, name: p.name }));
    }

    // Contagem total de deals
    let totalDeals: number | null = null;
    try {
      const countData = await testRes.json() as { total?: number };
      if (typeof countData.total === "number") totalDeals = countData.total;
    } catch { /* não bloqueia */ }

    // Busca usuários do RD Station
    let rdUsers: { name: string; email: string }[] = [];
    try {
      const usersRes = await fetch(
        `https://crm.rdstation.com/api/v1/users?token=${encodeURIComponent(token)}`,
        { headers: { Accept: "application/json" } },
      );
      if (usersRes.ok) {
        const uData = await usersRes.json() as {
          users?: Array<{ name?: string; email?: string }>;
        };
        rdUsers = (uData.users ?? [])
          .filter((u) => u.email)
          .map((u) => ({ name: u.name ?? "", email: u.email! }));
      }
    } catch { /* não bloqueia */ }

    // Busca usuários locais (auth.users)
    let userMapping: { rd_email: string; rd_name: string; local_id: string | null; matched: boolean }[] = [];
    try {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const localRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      );
      if (localRes.ok) {
        const localData = await localRes.json() as { users?: Array<{ id: string; email?: string }> };
        const localEmailMap = new Map(
          (localData.users ?? [])
            .filter((u) => u.email)
            .map((u) => [u.email!.toLowerCase(), u.id]),
        );

        userMapping = rdUsers.map((ru) => {
          const localId = localEmailMap.get(ru.email.toLowerCase()) ?? null;
          return { rd_email: ru.email, rd_name: ru.name, local_id: localId, matched: !!localId };
        });

        // Também verifica usuários locais sem equivalente no RD
        const rdEmails = new Set(rdUsers.map((u) => u.email.toLowerCase()));
        const unmatchedLocal = (localData.users ?? [])
          .filter((u) => u.email && !rdEmails.has(u.email.toLowerCase()))
          .map((u) => ({ local_email: u.email!, local_id: u.id }));

        (admin as unknown); // satisfaz lint
        return new Response(
          JSON.stringify({
            ok: true,
            pipeline: pipelines[0] ?? null,
            pipelines,
            total_deals: totalDeals,
            user_mapping: userMapping,
            unmatched_local_users: unmatchedLocal,
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
    } catch { /* não bloqueia */ }

    return new Response(
      JSON.stringify({
        ok: true,
        pipeline: pipelines[0] ?? null,
        pipelines,
        total_deals: totalDeals,
        user_mapping: userMapping,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
