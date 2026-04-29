import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RD_API_BASE = "https://crm.rdstation.com/api/v1";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function logSync(
  operation: string,
  eventType: string | null,
  rdId: string | null,
  liveId: string | null,
  status: string,
  errorMessage: string | null,
) {
  try {
    await admin.from("rd_sync_log").insert({
      operation,
      event_type: eventType,
      rd_id: rdId,
      live_id: liveId,
      status,
      error_message: errorMessage,
    });
  } catch { /* log failure does not block import */ }
}

async function rdGet(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(`${RD_API_BASE}${path}`);
  url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      if (res.status === 429 && attempt < 4) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw new Error(`RD API ${path} → HTTP ${res.status}`);
    }
    return res.json();
  }
  throw new Error(`RD API ${path} → 5 tentativas excedidas (429)`);
}

async function importContacts(token: string): Promise<number> {
  let count = 0;
  let nextPage: string | null = null;

  do {
    const params: Record<string, string> = { limit: "200" };
    if (nextPage) params.page = nextPage;

    const resp = await rdGet("/contacts", token, params) as {
      contacts: Record<string, unknown>[];
      has_more: boolean;
      next_page?: string;
    };

    for (const contact of resp.contacts ?? []) {
      if (!contact.id) continue;
      try {
        const emails = (contact.emails as { email: string }[] | undefined) ?? [];
        const phones = (contact.phones as { phone: string; whatsapp_url_web?: string }[] | undefined) ?? [];
        const email = emails[0]?.email ?? null;
        const rawPhone = phones[0]?.phone ?? null;
        const phone = rawPhone ? rawPhone.replace(/\D/g, "") : null;
        const whatsapp = phones.find((p) => p.whatsapp_url_web)?.phone ?? null;

        await admin.from("clients").upsert(
          {
            rd_contact_id: contact.id as string,
            name: (contact.name as string) || "Contato RD Station",
            email: email ?? null,
            phone: phone ?? null,
            whatsapp: whatsapp ?? null,
            status: "ativo",
          },
          { onConflict: "rd_contact_id" },
        );
        count++;
      } catch (e) {
        console.error(`import contact ${contact.id} failed:`, e);
      }
    }

    await new Promise((r) => setTimeout(r, 500));
    nextPage = resp.has_more ? (resp.next_page ?? null) : null;
  } while (nextPage);

  return count;
}

async function importDeals(
  token: string,
  rdPipelineId: string,
): Promise<{ dealIds: string[]; count: number }> {
  const dealIds: string[] = [];

  // Use the first available local pipeline
  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .limit(1)
    .maybeSingle();

  const { data: stages } = pipeline?.id
    ? await admin
        .from("pipeline_stages")
        .select("key, label, position")
        .eq("pipeline_id", pipeline.id)
        .order("position", { ascending: true })
    : { data: [] };

  const stageMap = new Map((stages ?? []).map((s) => [s.label.toLowerCase(), s.key]));
  const firstStageKey = stages?.[0]?.key ?? null;

  let nextPage: string | null = null;

  do {
    const params: Record<string, string> = {
      limit: "200",
      deal_pipeline_id: rdPipelineId,
    };
    if (nextPage) params.page = nextPage;

    const resp = await rdGet("/deals", token, params) as {
      deals: Record<string, unknown>[];
      has_more: boolean;
      next_page?: string;
    };

    for (const deal of resp.deals ?? []) {
      try {
        const rdDealId = deal._id as string;
        const stageName = (deal.deal_stage as { name?: string } | null)?.name?.toLowerCase() ?? null;
        const stageKey = stageName ? (stageMap.get(stageName) ?? firstStageKey) : firstStageKey;
        const userEmail = (deal.user as { email?: string } | null)?.email ?? null;
        const contacts = (deal.contacts as Record<string, unknown>[] | undefined) ?? [];

        let assignedTo: string | null = null;
        if (userEmail) {
          const { data: profile } = await admin
            .from("profiles")
            .select("id")
            .eq("email", userEmail)
            .limit(1)
            .single();
          assignedTo = profile?.id ?? null;
        }

        let clientId: string | null = null;
        for (const contact of contacts) {
          const emails = (contact.emails as { email: string }[] | undefined) ?? [];
          const phones = (contact.phones as { phone: string }[] | undefined) ?? [];
          const email = emails[0]?.email ?? null;
          const phone = phones[0]?.phone?.replace(/\D/g, "") ?? null;

          if (email) {
            const { data } = await admin.from("clients").select("id").eq("email", email).limit(1).single();
            if (data) { clientId = data.id; break; }
          }
          if (phone && phone.length >= 8) {
            const { data } = await admin
              .from("clients")
              .select("id")
              .ilike("phone", `%${phone.slice(-8)}`)
              .limit(1)
              .single();
            if (data) { clientId = data.id; break; }
          }
          const whatsapp = (contact.phones as { phone: string; whatsapp_url_web?: string }[] | undefined)
            ?.find((p) => p.whatsapp_url_web)?.phone ?? null;
          const { data: newClient } = await admin
            .from("clients")
            .upsert(
              {
                name: (contact.name as string) || "Contato RD Station",
                email: email ?? null,
                phone: phone ?? null,
                whatsapp: whatsapp ?? null,
                rd_contact_id: (contact.id as string) ?? null,
                status: "ativo",
              },
              { onConflict: "rd_contact_id" },
            )
            .select("id")
            .single();
          if (newClient) { clientId = newClient.id; break; }
        }

        let status = "aberto";
        if (deal.win === true) status = "fechado";
        else if (deal.win === false) status = "cancelado";
        else if (deal.hold === true) status = "pausado";

        await admin.from("tickets").upsert(
          {
            rd_deal_id: rdDealId,
            title: (deal.name as string) || "Negociação sem título",
            status,
            estimated_value: Number(deal.amount_total ?? 0),
            pipeline_id: pipeline?.id ?? null,
            pipeline_stage: stageKey,
            assigned_to: assignedTo,
            client_id: clientId,
            ticket_number: `RD-${rdDealId}`,
            origin: "rd_station",
            channel: "rd_station",
            created_at: (deal.created_at as string) || new Date().toISOString(),
          },
          { onConflict: "rd_deal_id" },
        );

        dealIds.push(rdDealId);
        await logSync("import", "deal", rdDealId, null, "success", null);
      } catch (e) {
        const rdDealId = deal._id as string;
        await logSync("import", "deal", rdDealId, null, "error", String(e));
        console.error(`import deal ${rdDealId} failed:`, e);
      }
    }

    await new Promise((r) => setTimeout(r, 500));
    nextPage = resp.has_more ? (resp.next_page ?? null) : null;
  } while (nextPage);

  return { dealIds, count: dealIds.length };
}

async function importActivities(token: string, rdDealId: string): Promise<number> {
  let count = 0;

  const { data: ticket } = await admin
    .from("tickets")
    .select("id")
    .eq("rd_deal_id", rdDealId)
    .limit(1)
    .single();

  if (!ticket) return 0;

  const resp = await rdGet("/activities", token, { deal_id: rdDealId }) as {
    activities?: Record<string, unknown>[];
    deal_activities?: Record<string, unknown>[];
  };

  const activities = resp.activities ?? resp.deal_activities ?? [];

  for (const activity of activities) {
    try {
      const text = (activity.text as string) || (activity.description as string) || null;
      if (!text) continue;

      await admin.from("ticket_comments").upsert(
        {
          rd_activity_id: activity.id as string,
          ticket_id: ticket.id,
          content: text,
          author_id: null,
          created_at: (activity.date as string) || new Date().toISOString(),
        },
        { onConflict: "rd_activity_id" },
      );
      count++;
    } catch (e) {
      console.error(`import activity ${activity.id} for deal ${rdDealId} failed:`, e);
    }
  }

  return count;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1)
    .single();

  if (!role) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const { data: config, error: cfgErr } = await admin
      .from("rd_integration_config")
      .select("*")
      .limit(1)
      .single();

    if (cfgErr || !config) {
      return new Response(JSON.stringify({ error: "Configuração não encontrada. Cadastre o token primeiro." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const token = config.api_token as string;
    let rdPipelineId = config.rd_pipeline_id as string | null;

    // Auto-detect pipeline if not configured yet
    if (!rdPipelineId) {
      console.log("rd-import: rd_pipeline_id not set, auto-detecting...");
      try {
        // Try /deal_pipelines endpoint
        const plRes = await fetch(`https://crm.rdstation.com/api/v1/deal_pipelines?token=${encodeURIComponent(token)}`, {
          headers: { Accept: "application/json" },
        });
        if (plRes.ok) {
          const plData = await plRes.json() as { deal_pipelines?: Array<{ _id: string; name: string }> };
          const first = plData.deal_pipelines?.[0];
          if (first?._id) {
            rdPipelineId = first._id;
            await admin.from("rd_integration_config").update({ rd_pipeline_id: rdPipelineId }).eq("id", config.id);
            console.log(`rd-import: auto-detected pipeline ${rdPipelineId}`);
          }
        }
      } catch (e) {
        console.warn("rd-import: pipeline auto-detect failed:", e);
      }

      // Fallback: get pipeline from first deal
      if (!rdPipelineId) {
        try {
          const dRes = await fetch(`https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}&limit=1`, {
            headers: { Accept: "application/json" },
          });
          if (dRes.ok) {
            const dData = await dRes.json() as { deals?: Array<{ deal_pipeline?: { id: string } }> };
            const pid = dData.deals?.[0]?.deal_pipeline?.id;
            if (pid) {
              rdPipelineId = pid;
              await admin.from("rd_integration_config").update({ rd_pipeline_id: rdPipelineId }).eq("id", config.id);
              console.log(`rd-import: auto-detected pipeline from deal: ${rdPipelineId}`);
            }
          }
        } catch (e) {
          console.warn("rd-import: pipeline fallback detect failed:", e);
        }
      }

      if (!rdPipelineId) {
        return new Response(JSON.stringify({ error: "Não foi possível detectar o pipeline do RD Station. Verifique o token." }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    console.log("rd-import: starting historical import...");

    const totalContacts = await importContacts(token);
    console.log(`rd-import: ${totalContacts} contacts imported`);

    const { dealIds, count: totalDeals } = await importDeals(token, rdPipelineId);
    console.log(`rd-import: ${totalDeals} deals imported`);

    let totalComments = 0;
    for (const rdDealId of dealIds) {
      totalComments += await importActivities(token, rdDealId);
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log(`rd-import: ${totalComments} activities imported`);

    const importStats = {
      total_deals: totalDeals,
      total_contacts: totalContacts,
      total_comments: totalComments,
      imported_at: new Date().toISOString(),
    };

    await admin.from("rd_integration_config").update({
      last_import_at: new Date().toISOString(),
      import_stats: importStats,
    }).eq("id", config.id);

    return new Response(JSON.stringify({ ok: true, ...importStats }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rd-import error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
