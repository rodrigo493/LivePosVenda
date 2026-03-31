import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiApiKey = Deno.env.get("AI_API_KEY");

    // Verify user is admin
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    // Use service role for data gathering
    const admin = createClient(supabaseUrl, serviceKey);

    // Check admin role
    const { data: roleCheck } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });
    }

    const { reportDate } = await req.json().catch(() => ({}));
    const targetDate = reportDate || new Date().toISOString().split("T")[0];
    const dayStart = `${targetDate}T00:00:00Z`;
    const dayEnd = `${targetDate}T23:59:59Z`;

    // Gather all staff users with profiles
    const { data: staffRoles } = await admin
      .from("user_roles")
      .select("user_id, role")
      .neq("role", "cliente");

    const staffUserIds = [...new Set((staffRoles || []).map((r) => r.user_id))];
    if (staffUserIds.length === 0) {
      return new Response(
        JSON.stringify({ report: "Nenhum usuário staff encontrado.", users: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", staffUserIds);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const roleMap = new Map<string, string[]>();
    for (const r of staffRoles || []) {
      const arr = roleMap.get(r.user_id) || [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    }

    // Gather operational data
    const [ticketsRes, workOrdersRes, quotesRes, warrantyRes] = await Promise.all([
      admin.from("tickets").select("id, status, created_by, assigned_to, created_at, updated_at, priority").gte("updated_at", dayStart).lte("updated_at", dayEnd),
      admin.from("work_orders").select("id, status, created_by, technician_id, created_at, updated_at, completed_at").gte("updated_at", dayStart).lte("updated_at", dayEnd),
      admin.from("quotes").select("id, status, created_by, created_at, updated_at").gte("updated_at", dayStart).lte("updated_at", dayEnd),
      admin.from("warranty_claims").select("id, warranty_status, ticket_id, created_at, updated_at").gte("updated_at", dayStart).lte("updated_at", dayEnd),
    ]);

    const tickets = ticketsRes.data || [];
    const workOrders = workOrdersRes.data || [];
    const quotes = quotesRes.data || [];
    const warranty = warrantyRes.data || [];

    // Also check for delayed items (all time, not just today)
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [delayedTicketsRes, delayedWarrantyRes, delayedOsRes] = await Promise.all([
      admin.from("tickets").select("id, status, assigned_to, updated_at, title").in("status", ["aberto", "em_analise", "aguardando_informacoes"]).lte("updated_at", twoDaysAgo),
      admin.from("warranty_claims").select("id, warranty_status, updated_at").eq("warranty_status", "em_analise").lte("updated_at", threeDaysAgo),
      admin.from("work_orders").select("id, status, technician_id, updated_at, order_number").in("status", ["aberta", "agendada", "em_andamento"]).lte("updated_at", sevenDaysAgo),
    ]);

    const delayedTickets = delayedTicketsRes.data || [];
    const delayedWarranty = delayedWarrantyRes.data || [];
    const delayedOs = delayedOsRes.data || [];

    // Build per-user stats
    const userStats: Record<string, any> = {};
    for (const uid of staffUserIds) {
      const profile = profileMap.get(uid);
      const roles = roleMap.get(uid) || [];
      userStats[uid] = {
        name: profile?.full_name || profile?.email || uid.slice(0, 8),
        roles,
        ticketsCreated: tickets.filter((t) => t.created_by === uid).length,
        ticketsAssigned: tickets.filter((t) => t.assigned_to === uid).length,
        ticketsResolved: tickets.filter((t) => (t.assigned_to === uid || t.created_by === uid) && ["resolvido", "fechado"].includes(t.status)).length,
        ticketsPending: tickets.filter((t) => (t.assigned_to === uid || t.created_by === uid) && !["resolvido", "fechado"].includes(t.status)).length,
        osCreated: workOrders.filter((w) => w.created_by === uid).length,
        osCompleted: workOrders.filter((w) => (w.technician_id === uid || w.created_by === uid) && w.status === "concluida").length,
        osPending: workOrders.filter((w) => (w.technician_id === uid || w.created_by === uid) && !["concluida", "cancelada"].includes(w.status)).length,
        quotesCreated: quotes.filter((q) => q.created_by === uid).length,
        quotesApproved: quotes.filter((q) => q.created_by === uid && q.status === "aprovado").length,
        warrantyAnalyzed: warranty.filter(() => false).length, // warranty doesn't have assigned_to
        delayedTickets: delayedTickets.filter((t) => t.assigned_to === uid).length,
        delayedOs: delayedOs.filter((w) => w.technician_id === uid).length,
        delayedItems: [] as string[],
      };

      // Collect delayed item details
      const delayed: string[] = [];
      delayedTickets.filter((t) => t.assigned_to === uid).forEach((t) => delayed.push(`Chamado "${t.title}" parado`));
      delayedOs.filter((w) => w.technician_id === uid).forEach((w) => delayed.push(`OS ${w.order_number} atrasada`));
      userStats[uid].delayedItems = delayed;
    }

    // Calculate totals
    const totalActions = Object.values(userStats).reduce((s: number, u: any) => s + u.ticketsCreated + u.ticketsResolved + u.osCreated + u.osCompleted + u.quotesCreated, 0);
    const totalDelays = delayedTickets.length + delayedWarranty.length + delayedOs.length;

    // Classification logic
    for (const uid of staffUserIds) {
      const u = userStats[uid];
      const actions = u.ticketsCreated + u.ticketsResolved + u.osCreated + u.osCompleted + u.quotesCreated;
      u.totalActions = actions;
      if (u.delayedTickets + u.delayedOs > 3) u.classification = "critico";
      else if (u.delayedTickets + u.delayedOs > 0) u.classification = "atencao";
      else if (actions >= 5) u.classification = "alta_performance";
      else u.classification = "em_dia";
    }

    // Build prompt for AI
    const userSummaries = staffUserIds.map((uid) => {
      const u = userStats[uid];
      return `- ${u.name} (${u.roles.join("/")}): ${u.ticketsCreated} chamados criados, ${u.ticketsResolved} resolvidos, ${u.ticketsPending} pendentes, ${u.osCreated} OS criadas, ${u.osCompleted} OS concluídas, ${u.quotesCreated} orçamentos, ${u.delayedTickets + u.delayedOs} atrasos.${u.delayedItems.length > 0 ? " Itens atrasados: " + u.delayedItems.join("; ") : ""}`;
    }).join("\n");

    const prompt = `Com base nos dados operacionais do dia ${targetDate}, gere um resumo executivo da equipe de assistência técnica Live Care.

Dados por usuário:
${userSummaries}

Totais do dia: ${totalActions} ações, ${totalDelays} itens em atraso, ${tickets.length} chamados movimentados, ${workOrders.length} OS movimentadas, ${quotes.length} orçamentos movimentados.

Gere um resumo executivo claro e direto com:
1. Visão geral do dia
2. Destaques positivos (quem performou bem)
3. Pontos de atenção (atrasos, pendências críticas)
4. Recomendações

Formato: texto corrido, linguagem gerencial, máximo 400 palavras. Em português brasileiro.`;

    let aiReport = "";

    if (aiApiKey) {
      try {
        const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${aiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Você é um analista de operações de pós-venda. Gere relatórios executivos claros e diretos." },
              { role: "user", content: prompt },
            ],
            max_tokens: 600,
            temperature: 0.2,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiReport = aiData.choices?.[0]?.message?.content || "";
        } else {
          const errText = await aiResponse.text();
          console.error("AI gateway error:", aiResponse.status, errText);
          // Fallback to rule-based report
        }
      } catch (e) {
        console.error("AI call failed:", e);
      }
    }

    // Fallback rule-based report if AI failed
    if (!aiReport) {
      const topPerformers = staffUserIds
        .filter((uid) => userStats[uid].classification === "alta_performance")
        .map((uid) => userStats[uid].name);
      const criticalUsers = staffUserIds
        .filter((uid) => userStats[uid].classification === "critico")
        .map((uid) => userStats[uid].name);
      const attentionUsers = staffUserIds
        .filter((uid) => userStats[uid].classification === "atencao")
        .map((uid) => userStats[uid].name);

      aiReport = `Resumo Operacional - ${targetDate}\n\nA equipe realizou ${totalActions} ações no dia. ${tickets.length} chamados foram movimentados e ${workOrders.length} ordens de serviço foram atualizadas.\n\n`;
      if (topPerformers.length > 0) aiReport += `Destaque positivo: ${topPerformers.join(", ")} com alta performance.\n`;
      if (criticalUsers.length > 0) aiReport += `Atenção crítica: ${criticalUsers.join(", ")} com múltiplos atrasos.\n`;
      if (attentionUsers.length > 0) aiReport += `Requer atenção: ${attentionUsers.join(", ")} com pendências.\n`;
      if (totalDelays > 0) aiReport += `\nTotal de ${totalDelays} itens em atraso no sistema.`;
    }

    // Save reports using service role
    await admin.from("ai_daily_reports").upsert({
      report_date: targetDate,
      report_content: aiReport,
      total_users: staffUserIds.length,
      total_delays: totalDelays,
      total_tickets: tickets.length,
      total_actions: totalActions,
    }, { onConflict: "report_date" });

    // Save per-user reports
    for (const uid of staffUserIds) {
      const u = userStats[uid];
      await admin.from("ai_user_reports").upsert({
        user_id: uid,
        report_date: targetDate,
        user_summary: `${u.name}: ${u.totalActions} ações, ${u.ticketsResolved} resolvidos, ${u.ticketsPending} pendentes, ${u.delayedTickets + u.delayedOs} atrasos.`,
        total_actions: u.totalActions,
        total_completed: u.ticketsResolved + u.osCompleted,
        total_pending: u.ticketsPending + u.osPending,
        total_delays: u.delayedTickets + u.delayedOs,
        classification: u.classification,
      }, { onConflict: "user_id,report_date" });
    }

    // Return data
    const usersArray = staffUserIds.map((uid) => ({
      user_id: uid,
      ...userStats[uid],
    }));

    return new Response(
      JSON.stringify({
        report: aiReport,
        report_date: targetDate,
        total_actions: totalActions,
        total_delays: totalDelays,
        total_tickets: tickets.length,
        total_users: staffUserIds.length,
        users: usersArray,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
