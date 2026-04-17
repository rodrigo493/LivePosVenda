import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return new Response("OK", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const POSVENDA_USER_ID = Deno.env.get("POSVENDA_USER_ID") || null;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    console.log("Uazapi webhook:", JSON.stringify(body).slice(0, 500));

    let senderPhone: string | null = null;
    let messageText: string | null = null;
    let senderName: string | null = null;
    let waMessageId: string | null = null;

    // Uazapi actual format: { EventType, message: { fromMe, sender_pn, chatid, text, senderName, messageid }, chat }
    if (body?.EventType && body?.message) {
      const m = body.message;
      if (m.fromMe === true || m.wasSentByApi === true) return new Response("OK", { status: 200 });
      senderPhone = (m.sender_pn || m.chatid || m.sender || "").toString().replace("@s.whatsapp.net", "").replace(/\D/g, "");
      messageText = m.text || m.content || null;
      senderName = m.senderName || body.chat?.name || null;
      waMessageId = m.messageid || null;
    } else if (body?.event && body?.data) {
      // Uazapi legacy format
      const d = body.data;
      if (d.fromMe === true || d.key?.fromMe === true) return new Response("OK", { status: 200 });
      senderPhone = (d.phone || d.sender || d.chatid || "").toString().replace("@s.whatsapp.net", "").replace(/\D/g, "");
      messageText = d.text || d.message || d.body || null;
      senderName = d.senderName || d.pushName || null;
      waMessageId = d.messageid || d.key?.id || null;
    } else if (body?.data?.key) {
      // Evolution API format
      const key = body.data.key;
      if (key.fromMe === true) return new Response("OK", { status: 200 });
      senderPhone = (key.remoteJid || "").replace("@s.whatsapp.net", "").replace(/\D/g, "");
      messageText = body.data.message?.conversation || body.data.message?.extendedTextMessage?.text || null;
      senderName = body.data.pushName || null;
      waMessageId = key.id || null;
    } else if (body?.phone && body?.message) {
      // Simple format
      senderPhone = String(body.phone).replace(/\D/g, "");
      messageText = String(body.message);
      senderName = body.name || null;
      waMessageId = body.message_id || null;
    }

    if (!senderPhone || !messageText) {
      console.log("Ignoring: no phone or message. Raw body:", JSON.stringify(body));
      return new Response(JSON.stringify({ ignored: true, body }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const localPhone = senderPhone.startsWith("55") ? senderPhone.slice(2) : senderPhone;

    const { data: existingClients } = await admin
      .from("clients")
      .select("id, name")
      .or(`phone.ilike.%${localPhone},whatsapp.ilike.%${localPhone}`)
      .limit(1);

    let clientId: string;
    let ticketId: string | null = null;

    if (existingClients?.length) {
      clientId = existingClients[0].id;

      const { data: tickets } = await admin
        .from("tickets")
        .select("id")
        .eq("client_id", clientId)
        .not("status", "in", '("fechado","resolvido")')
        .order("created_at", { ascending: false })
        .limit(1);

      ticketId = tickets?.[0]?.id || null;
    } else {
      const { data: newClient, error: clientErr } = await admin
        .from("clients")
        .insert({
          name: senderName || `WhatsApp ${localPhone}`,
          phone: localPhone,
          whatsapp: localPhone,
          status: "ativo",
          notes: "Criado automaticamente via WhatsApp",
        })
        .select("id")
        .single();

      if (clientErr || !newClient) {
        console.error("Failed to create client:", clientErr);
        return new Response(JSON.stringify({ error: "client", detail: clientErr }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      clientId = newClient.id;

      const { data: newTicket } = await admin
        .from("tickets")
        .insert({
          client_id: clientId,
          title: `WhatsApp — ${senderName || localPhone}`,
          description: messageText,
          status: "aberto",
          pipeline_stage: "sem_atendimento",
          pipeline_position: 0,
          assigned_to: POSVENDA_USER_ID,
          ticket_number: "",
          origin: "whatsapp",
          channel: "whatsapp",
        })
        .select("id")
        .single();

      ticketId = newTicket?.id || null;
    }

    const { error: msgErr } = await admin.from("whatsapp_messages").insert({
      client_id: clientId,
      ticket_id: ticketId,
      direction: "inbound",
      message_text: messageText,
      sender_name: senderName,
      sender_phone: senderPhone,
      status: "received",
    });

    if (msgErr) {
      return new Response(JSON.stringify({ error: "msg_insert", detail: msgErr }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, client_id: clientId }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
