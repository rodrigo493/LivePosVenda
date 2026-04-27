import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify caller is admin
  const authHeader = req.headers.get("authorization") ?? "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization: authHeader } },
  });
  const { data: roles } = await callerClient.rpc("get_my_roles");
  if (!Array.isArray(roles) || !roles.includes("admin")) {
    return json({ error: "Unauthorized" }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // GET — list users with roles
  if (req.method === "GET") {
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, full_name, email, created_at");
    if (error) return json({ error: error.message }, 500);

    const { data: userRoles } = await admin
      .from("user_roles")
      .select("user_id, role");

    const rolesMap: Record<string, string[]> = {};
    for (const r of userRoles ?? []) {
      if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
      rolesMap[r.user_id].push(r.role);
    }

    const result = profiles?.map((p) => ({
      ...p,
      roles: rolesMap[p.id] ?? [],
    }));

    return json(result);
  }

  // POST — create user
  if (req.method === "POST") {
    const { email, password, full_name, role } = await req.json();
    if (!email || !password || !full_name || !role) {
      return json({ error: "email, password, full_name e role são obrigatórios" }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const userId = created.user.id;

    // Insert profile
    await admin.from("profiles").upsert({ id: userId, full_name, email });

    // Assign role
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role });
    if (roleErr) return json({ error: roleErr.message }, 500);

    return json({ id: userId, email, full_name, roles: [role] });
  }

  // PATCH — update role, password, full_name or email
  if (req.method === "PATCH") {
    const body = await req.json();
    const { user_id, role, password, full_name, email } = body;
    if (!user_id) return json({ error: "user_id é obrigatório" }, 400);

    // Change password
    if (password) {
      if (password.length < 6) return json({ error: "Senha deve ter ao menos 6 caracteres" }, 400);
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // Change name and/or email
    if (full_name || email) {
      if (full_name) {
        const { error } = await admin.from("profiles").update({ full_name }).eq("user_id", user_id);
        if (error) return json({ error: error.message }, 500);
      }
      if (email) {
        const { error: authErr } = await admin.auth.admin.updateUserById(user_id, { email });
        if (authErr) return json({ error: authErr.message }, 500);
        await admin.from("profiles").update({ email }).eq("user_id", user_id);
      }
      return json({ ok: true });
    }

    // Change role
    if (!role) return json({ error: "role, password, full_name ou email é obrigatório" }, 400);
    await admin.from("user_roles").delete().eq("user_id", user_id);
    const { error } = await admin.from("user_roles").insert({ user_id, role });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  }

  // DELETE — remove user (user_id via query param)
  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const user_id = url.searchParams.get("user_id");
    if (!user_id) return json({ error: "user_id é obrigatório" }, 400);

    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
});
