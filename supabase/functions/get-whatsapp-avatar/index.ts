import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function extractAvatarUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const candidates = [
    d?.Image, d?.image,
    d?.eurl, d?.url, d?.imgUrl,
    d?.picture, d?.profilePicUrl,
    (d?.data as any)?.url, (d?.data as any)?.image,
  ];
  for (const v of candidates) {
    if (v && typeof v === "string" && v.startsWith("http")) return v as string;
  }
  return null;
}

async function tryFetchAvatar(baseUrl: string, token: string, cleanPhone: string): Promise<string | null> {
  const headers = { token, "Content-Type": "application/json" };

  // GET endpoints
  const getEndpoints = [
    `${baseUrl}/user/avatar?Phone=${cleanPhone}&Preview=false`,
    `${baseUrl}/user/avatar?phone=${cleanPhone}&preview=false`,
    `${baseUrl}/contact/profilepicture?phone=${cleanPhone}`,
    `${baseUrl}/contact/profilepicture?Phone=${cleanPhone}`,
  ];

  for (const url of getEndpoints) {
    try {
      const res = await fetch(url, { headers: { token } });
      const text = await res.text();
      console.log(`[avatar] GET ${res.status} ${url} → ${text.slice(0, 120)}`);
      if (res.ok && text.startsWith("{")) {
        const found = extractAvatarUrl(JSON.parse(text));
        if (found) return found;
      }
    } catch (e) {
      console.log(`[avatar] GET error ${url}:`, e);
    }
  }

  // POST endpoints (some Uazapi versions require POST with body)
  const postEndpoints = [
    `${baseUrl}/contact/profilepicture`,
    `${baseUrl}/contact/getprofilepicture`,
    `${baseUrl}/user/avatar`,
  ];

  for (const url of postEndpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const text = await res.text();
      console.log(`[avatar] POST ${res.status} ${url} → ${text.slice(0, 120)}`);
      if (res.ok && text.startsWith("{")) {
        const found = extractAvatarUrl(JSON.parse(text));
        if (found) return found;
      }
    } catch (e) {
      console.log(`[avatar] POST error ${url}:`, e);
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL") || "https://liveuni.uazapi.com";
    const UAZAPI_INSTANCE_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN") || "c6a355b6-c741-47c1-b1e6-c48938dd477b";

    const { client_id, phone, instance_id } = await req.json();
    if (!client_id || !phone) {
      return new Response(JSON.stringify({ error: "client_id and phone required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve token/base_url from instance_id
    let token = UAZAPI_INSTANCE_TOKEN;
    let baseUrl = UAZAPI_BASE_URL;
    if (instance_id) {
      const { data: inst } = await admin
        .from("pipeline_whatsapp_instances")
        .select("instance_token, base_url")
        .eq("id", instance_id)
        .eq("active", true)
        .maybeSingle();
      if ((inst as any)?.instance_token) {
        token = (inst as any).instance_token;
        baseUrl = (inst as any).base_url || UAZAPI_BASE_URL;
      }
    }

    // Normaliza telefone: adiciona código de país BR se não tiver
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length <= 11) cleanPhone = "55" + cleanPhone;

    const avatarUrl = await tryFetchAvatar(baseUrl, token, cleanPhone);
    console.log(`[avatar] final result for ${cleanPhone}:`, avatarUrl);

    // Salva em clients.avatar_url se encontrou
    if (avatarUrl) {
      await admin.from("clients").update({ avatar_url: avatarUrl }).eq("id", client_id);
    }

    return new Response(JSON.stringify({ url: avatarUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get-whatsapp-avatar error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
