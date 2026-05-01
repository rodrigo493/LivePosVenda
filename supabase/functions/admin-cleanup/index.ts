import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(async () => {
  const { error: t, count: tc } = await admin.from("tasks").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
  if (t) return new Response(JSON.stringify({ ok: false, step: "tasks", error: t.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  const { data: pipeline } = await admin.from("pipelines").select("id, name").ilike("name", "%vendas%").limit(1).maybeSingle();
  if (!pipeline) return new Response(JSON.stringify({ ok: false, error: "Pipeline não encontrado" }), { status: 200, headers: { "Content-Type": "application/json" } });
  const { error: tk, count: tkc } = await admin.from("tickets").delete({ count: "exact" }).eq("pipeline_id", pipeline.id);
  if (tk) return new Response(JSON.stringify({ ok: false, step: "tickets", error: tk.message }), { status: 200, headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ ok: true, pipeline: pipeline.name, tasks_deleted: tc, tickets_deleted: tkc }), { status: 200, headers: { "Content-Type": "application/json" } });
});
