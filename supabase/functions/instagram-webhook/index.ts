import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function verifySignature(req: Request, body: string): Promise<boolean> {
  const APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET")!;
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const [, hash] = sig.split("=");
  if (!hash) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const computed = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === hash;
}

async function getOrCreateConversation(
  ig_sender_id: string,
  sender_username: string | null,
  sender_picture: string | null,
  last_message: string | null,
): Promise<{ id: string; client_id: string | null; isNew: boolean }> {
  const { data: existing } = await sb
    .from("instagram_conversations")
    .select("id, client_id, unread_count")
    .eq("ig_sender_id", ig_sender_id)
    .maybeSingle();

  if (existing) {
    await sb.from("instagram_conversations").update({
      last_message: last_message?.slice(0, 500) ?? null,
      last_message_at: new Date().toISOString(),
      unread_count: (existing as any).unread_count + 1,
      ...(sender_username ? { sender_username } : {}),
      ...(sender_picture ? { sender_picture } : {}),
    }).eq("id", existing.id);
    return { id: existing.id, client_id: existing.client_id, isNew: false };
  }

  const { data: newConv, error } = await sb
    .from("instagram_conversations")
    .insert({
      ig_sender_id,
      sender_username,
      sender_picture,
      last_message: last_message?.slice(0, 500) ?? null,
      unread_count: 1,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Conversation insert: ${error.message}`);
  return { id: newConv.id, client_id: null, isNew: true };
}

async function ensureClientAndCard(
  conversationId: string,
  ig_sender_id: string,
  sender_username: string | null,
): Promise<void> {
  const { data: existingClient } = await sb
    .from("clients")
    .select("id")
    .eq("instagram_id", ig_sender_id)
    .maybeSingle();

  let clientId: string;

  if (existingClient) {
    clientId = existingClient.id;
  } else {
    const { data: newClient, error: clientErr } = await sb
      .from("clients")
      .insert({
        name: sender_username ?? `Instagram ${ig_sender_id.slice(-6)}`,
        instagram_id: ig_sender_id,
        source: "instagram",
      })
      .select("id")
      .single();
    if (clientErr) throw new Error(`Client insert: ${clientErr.message}`);
    clientId = newClient.id;

    const { data: pipeline } = await sb
      .from("pipelines")
      .select("id, stages:pipeline_stages(id, position)")
      .eq("active", true)
      .order("position")
      .limit(1)
      .maybeSingle();

    if (pipeline) {
      const stages = ((pipeline as any).stages ?? []).sort((a: any, b: any) => a.position - b.position);
      const firstStage = stages[0];
      if (firstStage) {
        await sb.from("tickets").insert({
          client_id: clientId,
          pipeline_id: pipeline.id,
          stage_id: firstStage.id,
          title: `Instagram — ${sender_username ?? ig_sender_id.slice(-6)}`,
          type: "negociacao",
        });
      }
    }
  }

  await sb.from("instagram_conversations")
    .update({ client_id: clientId })
    .eq("id", conversationId);
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const VERIFY_TOKEN = Deno.env.get("INSTAGRAM_VERIFY_TOKEN")!;
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await req.text();

  try {
    await sb.from("instagram_webhook_log").insert({ payload: JSON.parse(body) });
  } catch { /* ignora erros de log */ }

  const valid = await verifySignature(req, body);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const payload = JSON.parse(body);
  if (payload.object !== "instagram") return new Response("ok", { status: 200 });

  for (const entry of payload.entry ?? []) {
    for (const msg of entry.messaging ?? []) {
      const senderId: string = msg.sender?.id;
      if (!senderId) continue;

      const isStoryMention = msg.message?.attachments?.[0]?.type === "story_mention";
      const messageType = isStoryMention ? "story_mention" : "dm";
      const content: string | null = msg.message?.text ?? null;
      const igMessageId: string | null = msg.message?.mid ?? null;
      const mediaUrl: string | null = msg.message?.attachments?.[0]?.payload?.url ?? null;

      try {
        const conv = await getOrCreateConversation(senderId, null, null, content ?? "[mídia]");
        await sb.from("instagram_messages").upsert({
          conversation_id: conv.id,
          ig_message_id: igMessageId,
          message_type: messageType,
          direction: "inbound",
          content,
          media_url: mediaUrl,
        }, { onConflict: "ig_message_id", ignoreDuplicates: true });

        if (conv.isNew) {
          await ensureClientAndCard(conv.id, senderId, null);
        }
      } catch (e) {
        console.error("Error processing DM/story_mention:", e);
      }
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const v = change.value ?? {};
      const senderId: string = v.from?.id;
      const senderUsername: string | null = v.from?.username ?? null;
      const content: string | null = v.text ?? null;
      const igMessageId: string | null = v.id ?? null;
      const postId: string | null = v.media?.id ?? null;

      if (!senderId) continue;

      try {
        const conv = await getOrCreateConversation(senderId, senderUsername, null, content);
        await sb.from("instagram_messages").upsert({
          conversation_id: conv.id,
          ig_message_id: igMessageId,
          message_type: "comment",
          direction: "inbound",
          content,
          post_id: postId,
        }, { onConflict: "ig_message_id", ignoreDuplicates: true });

        if (conv.isNew) {
          await ensureClientAndCard(conv.id, senderId, senderUsername);
        }
      } catch (e) {
        console.error("Error processing comment:", e);
      }
    }
  }

  return new Response("ok", { status: 200 });
});
