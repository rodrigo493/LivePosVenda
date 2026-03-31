import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle webhook verification (GET request from Meta)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (!VERIFY_TOKEN) {
      console.error("WHATSAPP_VERIFY_TOKEN environment variable is not set");
      return new Response("Server misconfigured", { status: 500 });
    }

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    // Meta webhook payload structure
    const entries = body?.entry || [];

    for (const entry of entries) {
      const changes = entry?.changes || [];

      for (const change of changes) {
        if (change?.field !== "messages") continue;

        const value = change?.value;
        const messages = value?.messages || [];
        const contacts = value?.contacts || [];

        for (const msg of messages) {
          if (msg.type !== "text") continue;

          const senderPhone = msg.from || "";
          const messageText = msg.text?.body || "";
          const waMessageId = msg.id || "";
          const senderName = contacts?.find((c: any) => c.wa_id === senderPhone)?.profile?.name || "";

          if (!messageText) continue;

          // Clean phone for DB lookup
          const cleanPhone = senderPhone.replace(/\D/g, "");
          const localPhone = cleanPhone.startsWith("55") ? cleanPhone.substring(2) : cleanPhone;

          // Find client by phone
          let clientId: string | null = null;

          if (localPhone) {
            const { data: clients } = await supabase
              .from("clients")
              .select("id")
              .or(`whatsapp.ilike.%${localPhone},phone.ilike.%${localPhone}`)
              .limit(1);

            if (clients?.length) {
              clientId = clients[0].id;
            }
          }

          if (!clientId) {
            console.log(`No client found for phone ${senderPhone}, skipping`);
            continue;
          }

          // Find most recent open ticket
          let ticketId: string | null = null;
          const { data: tickets } = await supabase
            .from("tickets")
            .select("id")
            .eq("client_id", clientId)
            .not("status", "in", '("fechado","resolvido")')
            .order("created_at", { ascending: false })
            .limit(1);

          if (tickets?.length) {
            ticketId = tickets[0].id;
          }

          // Save inbound message
          const { error: insertError } = await supabase
            .from("whatsapp_messages")
            .insert({
              client_id: clientId,
              ticket_id: ticketId,
              direction: "inbound",
              message_text: messageText,
              sender_name: senderName,
              sender_phone: senderPhone,
              manychat_message_id: waMessageId,
              status: "received",
            });

          if (insertError) {
            console.error("Failed to save inbound message:", insertError);
          } else {
            console.log(`Saved inbound message from ${senderName} (${senderPhone})`);
          }
        }
      }
    }

    // Meta requires 200 response
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error in whatsapp-webhook:", error);
    // Still return 200 to avoid Meta retries
    return new Response("OK", { status: 200 });
  }
});
