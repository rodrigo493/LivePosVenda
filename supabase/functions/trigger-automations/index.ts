import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { ticket_id, stage_id } = await req.json() as {
      ticket_id: string;
      stage_id: string;
    };

    if (!ticket_id || !stage_id) {
      return new Response(
        JSON.stringify({ error: "ticket_id and stage_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: automations, error } = await supabase
      .from("pipeline_stage_automations")
      .select("id, delay_minutes")
      .eq("stage_id", stage_id)
      .eq("is_active", true)
      .eq("trigger_type", "card_enter_stage");

    if (error) throw error;
    if (!automations || automations.length === 0) {
      return new Response(
        JSON.stringify({ queued: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const entries = automations.map((a: any) => {
      const executeAt = new Date(now.getTime() + a.delay_minutes * 60 * 1000);
      return {
        automation_id: a.id,
        ticket_id,
        stage_id,
        execute_at: executeAt.toISOString(),
      };
    });

    const { error: insertError } = await supabase
      .from("pipeline_automation_queue")
      .insert(entries);

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ queued: entries.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
