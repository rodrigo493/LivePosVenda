import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const META_API_URL = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error("WhatsApp Cloud API credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const todayStr = new Date().toISOString().split("T")[0];

    const { data: plans, error: plansError } = await supabase
      .from("maintenance_plans")
      .select(`
        id, component, next_maintenance_date, equipment_id, client_id,
        equipments!inner(serial_number, model_id, equipment_models(name)),
        clients!inner(name, whatsapp, phone)
      `)
      .eq("status", "ativo")
      .eq("next_maintenance_date", todayStr);

    if (plansError) throw new Error(`Error fetching plans: ${plansError.message}`);

    if (!plans?.length) {
      return new Response(
        JSON.stringify({ message: "No reminders to send today", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    const errors: string[] = [];

    for (const plan of plans) {
      const client = plan.clients as any;
      const equipment = plan.equipments as any;
      const phone = client?.whatsapp || client?.phone;

      if (!phone) {
        errors.push(`Client ${client?.name} has no phone/whatsapp`);
        continue;
      }

      let cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length <= 11) cleanPhone = "55" + cleanPhone;

      const modelName = equipment?.equipment_models?.name || "Equipamento";
      const nextDate = plan.next_maintenance_date;

      const messageText = `Olá ${client?.name}! 👋\n\n🔔 *Lembrete de Manutenção Preventiva - HOJE*\n\n📦 Equipamento: ${modelName} (${equipment?.serial_number || "N/A"})\n🔧 Componente: ${plan.component}\n📅 Data: ${new Date(nextDate).toLocaleDateString("pt-BR")}\n\nSua manutenção preventiva está agendada para hoje! Entre em contato conosco para confirmar o atendimento. Estamos à disposição!`;

      const sendRes = await fetch(
        `${META_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "text",
            text: { body: messageText },
          }),
        }
      );

      const sendData = await sendRes.json();

      if (sendRes.ok) {
        sentCount++;
      } else {
        errors.push(`Failed to send to ${client?.name}: ${JSON.stringify(sendData)}`);
      }
    }

    console.log(`Maintenance reminders: ${sentCount} sent, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ message: `Sent ${sentCount} reminders`, sent: sentCount, total: plans.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in maintenance-reminders:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
