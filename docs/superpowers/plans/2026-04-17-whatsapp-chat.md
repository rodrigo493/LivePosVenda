# WhatsApp Chat Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar WhatsApp via Uazapi ao LivePosVenda — aba `/chat` com todas as conversas, tab WhatsApp no card do cliente, e criação automática de cliente+ticket quando mensagem de número desconhecido chegar.

**Architecture:** Uazapi envia webhook POST para Supabase Edge Function `whatsapp-webhook` (adaptada de Meta para Uazapi). A Edge Function salva em `whatsapp_messages`, cria cliente+ticket se número desconhecido. O frontend usa Supabase Realtime para atualização em tempo real. A aba `/chat` lista conversas agrupadas por cliente.

**Tech Stack:** Supabase Edge Functions (Deno), Supabase Realtime, React + TanStack Query, Tailwind CSS, Uazapi REST API.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/functions/whatsapp-webhook/index.ts` | Modify | Receber webhook Uazapi, salvar mensagem, criar cliente+ticket |
| `supabase/functions/send-whatsapp/index.ts` | Modify | Enviar mensagem via Uazapi em vez de Meta |
| `src/hooks/useWhatsAppConversations.ts` | Create | Buscar lista de conversas agrupadas por cliente |
| `src/pages/ChatPage.tsx` | Create | Painel duplo: lista conversas + chat aberto |
| `src/components/layout/AppSidebar.tsx` | Modify | Adicionar "Chat" no nav com badge de não-lidas |
| `src/App.tsx` | Modify | Adicionar rota `/chat` |

---

## Task 1: Run `whatsapp_messages` migration on new Supabase project

**Files:**
- Run SQL via Management API

- [ ] **Step 1: Execute migration via node**

```bash
node -e "
(async () => {
  const sql = \`
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  message_text text NOT NULL,
  sender_name text,
  sender_phone text,
  wa_message_id text,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS 'staff_view_messages' ON public.whatsapp_messages FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY IF NOT EXISTS 'staff_insert_messages' ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY IF NOT EXISTS 'webhook_insert_messages' ON public.whatsapp_messages FOR INSERT TO anon WITH CHECK (direction = 'inbound');
CREATE INDEX IF NOT EXISTS idx_wamsg_client ON public.whatsapp_messages(client_id, created_at DESC);
  \`;
  const r = await fetch('https://api.supabase.com/v1/projects/ehqkggiuouczmafmlzls/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer sbp_c51ba5c5ea4fcf6be4980274d23730b284f99c04', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  const d = await r.json();
  console.log(JSON.stringify(d));
})();
"
```

Expected output: `[]` (empty array = success)

- [ ] **Step 2: Enable Realtime for the table**

```bash
node -e "
(async () => {
  const r = await fetch('https://api.supabase.com/v1/projects/ehqkggiuouczmafmlzls/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer sbp_c51ba5c5ea4fcf6be4980274d23730b284f99c04', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages' })
  });
  const d = await r.json();
  console.log(JSON.stringify(d));
})();
"
```

Expected output: `[]`

---

## Task 2: Set Supabase Secrets for Uazapi

**Files:** Supabase project secrets (via CLI or dashboard)

- [ ] **Step 1: Set secrets via Supabase CLI**

```bash
cd c:/VS_CODE/LivePosVenda
npx supabase secrets set --project-ref ehqkggiuouczmafmlzls \
  UAZAPI_API_KEY="ZaW1qwTEkuq7Ub1cBUuyMiK5bNSu3nnMQ9lh7klElc2clSRV8t" \
  UAZAPI_INSTANCE_TOKEN="81a82558-de29-480b-8649-fe4155209fee" \
  UAZAPI_BASE_URL="https://free.uazapi.com" \
  POSVENDA_USER_ID="46ed7639-3a8c-4540-bad0-68d11a82f188"
```

Expected: `Finished supabase secrets set`

- [ ] **Step 2: Verify secrets were set**

```bash
npx supabase secrets list --project-ref ehqkggiuouczmafmlzls
```

Expected: list includes `UAZAPI_API_KEY`, `UAZAPI_INSTANCE_TOKEN`, `UAZAPI_BASE_URL`, `POSVENDA_USER_ID`

---

## Task 3: Update `send-whatsapp` Edge Function for Uazapi

**Files:**
- Modify: `supabase/functions/send-whatsapp/index.ts`

- [ ] **Step 1: Replace the file content**

Replace the entire `supabase/functions/send-whatsapp/index.ts` with:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://posvenda.liveuni.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const UAZAPI_API_KEY = Deno.env.get("UAZAPI_API_KEY");
    const UAZAPI_INSTANCE_TOKEN = Deno.env.get("UAZAPI_INSTANCE_TOKEN");
    const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL") || "https://free.uazapi.com";

    if (!UAZAPI_API_KEY || !UAZAPI_INSTANCE_TOKEN) {
      throw new Error("Uazapi credentials not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { client_id, ticket_id, message, phone } = await req.json();

    if (!client_id || !message || !phone) {
      return new Response(
        JSON.stringify({ error: "client_id, message, and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone: digits only, with country code
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length <= 11) {
      cleanPhone = "55" + cleanPhone;
    }

    // Send via Uazapi
    const sendRes = await fetch(
      `${UAZAPI_BASE_URL}/message/sendText/${UAZAPI_INSTANCE_TOKEN}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${UAZAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ number: cleanPhone, text: message }),
      }
    );

    const sendData = await sendRes.json();

    if (!sendRes.ok) {
      throw new Error(`Uazapi error [${sendRes.status}]: ${JSON.stringify(sendData)}`);
    }

    const waMessageId = sendData?.key?.id || sendData?.id || null;

    // Save outbound message
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await adminClient.from("whatsapp_messages").insert({
      client_id,
      ticket_id: ticket_id || null,
      direction: "outbound",
      message_text: message,
      sender_phone: cleanPhone,
      wa_message_id: waMessageId,
      status: "sent",
    });

    return new Response(
      JSON.stringify({ success: true, message_id: waMessageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-whatsapp/index.ts
git commit -m "feat(whatsapp): switch send-whatsapp to Uazapi provider"
```

---

## Task 4: Update `whatsapp-webhook` Edge Function for Uazapi

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

- [ ] **Step 1: Replace the file content**

Replace the entire `supabase/functions/whatsapp-webhook/index.ts` with:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Allow GET for webhook verification (some providers)
  if (req.method === "GET") {
    return new Response("OK", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const POSVENDA_USER_ID = Deno.env.get("POSVENDA_USER_ID")!;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    console.log("Uazapi webhook:", JSON.stringify(body).slice(0, 500));

    // Uazapi webhook payload:
    // { event: "messages.upsert", data: { key: { remoteJid, fromMe, id }, message: { conversation }, pushName } }
    // OR simpler: { event: "messages", phone, message, name, message_id }

    let senderPhone: string | null = null;
    let messageText: string | null = null;
    let senderName: string | null = null;
    let waMessageId: string | null = null;
    let fromMe = false;

    // Handle both Uazapi payload formats
    if (body?.data?.key) {
      // Evolution-style format
      const key = body.data.key;
      fromMe = key.fromMe === true;
      if (fromMe) return new Response("OK", { status: 200 }); // ignore outbound
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
      console.log("Ignoring: no phone or message");
      return new Response("OK", { status: 200 });
    }

    // Normalize phone for lookup
    const localPhone = senderPhone.startsWith("55") ? senderPhone.slice(2) : senderPhone;

    // Find client by phone or whatsapp field
    const { data: existingClients } = await admin
      .from("clients")
      .select("id, name")
      .or(`phone.ilike.%${localPhone},whatsapp.ilike.%${localPhone}`)
      .limit(1);

    let clientId: string;
    let ticketId: string | null = null;

    if (existingClients?.length) {
      clientId = existingClients[0].id;

      // Find latest open ticket
      const { data: tickets } = await admin
        .from("tickets")
        .select("id")
        .eq("client_id", clientId)
        .not("status", "in", '("fechado","resolvido")')
        .order("created_at", { ascending: false })
        .limit(1);

      ticketId = tickets?.[0]?.id || null;
    } else {
      // New contact: create client
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
        return new Response("OK", { status: 200 });
      }

      clientId = newClient.id;

      // Create ticket in first funnel stage
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

    // Save inbound message
    await admin.from("whatsapp_messages").insert({
      client_id: clientId,
      ticket_id: ticketId,
      direction: "inbound",
      message_text: messageText,
      sender_name: senderName,
      sender_phone: senderPhone,
      wa_message_id: waMessageId,
      status: "received",
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("OK", { status: 200 }); // always 200 to avoid retries
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "feat(whatsapp): update webhook handler to Uazapi format"
```

---

## Task 5: Deploy Edge Functions to Supabase

**Files:** Remote Supabase project

- [ ] **Step 1: Deploy send-whatsapp**

```bash
cd c:/VS_CODE/LivePosVenda
npx supabase functions deploy send-whatsapp --project-ref ehqkggiuouczmafmlzls --no-verify-jwt
```

Expected: `Deployed Function send-whatsapp`

- [ ] **Step 2: Deploy whatsapp-webhook**

```bash
npx supabase functions deploy whatsapp-webhook --project-ref ehqkggiuouczmafmlzls --no-verify-jwt
```

Expected: `Deployed Function whatsapp-webhook`

- [ ] **Step 3: Get webhook URL and configure in Uazapi**

Webhook URL to configure in Uazapi dashboard:
```
https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/whatsapp-webhook
```

In Uazapi, go to the instance settings and set this as the webhook URL for incoming messages. Event to subscribe: `messages.upsert` or `messages`.

---

## Task 6: Create `useWhatsAppConversations` hook

**Files:**
- Create: `src/hooks/useWhatsAppConversations.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Conversation {
  client_id: string;
  client_name: string;
  client_phone: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export function useWhatsAppConversations() {
  return useQuery({
    queryKey: ["whatsapp-conversations"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      // Get last message per client, with client info
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("client_id, message_text, direction, created_at, clients(name, phone, whatsapp)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Group by client_id, keep only latest message per client
      const map = new Map<string, Conversation>();
      for (const msg of data || []) {
        if (!msg.client_id) continue;
        if (!map.has(msg.client_id)) {
          const client = msg.clients as any;
          map.set(msg.client_id, {
            client_id: msg.client_id,
            client_name: client?.name || msg.client_id,
            client_phone: client?.whatsapp || client?.phone || null,
            last_message: msg.message_text,
            last_message_at: msg.created_at,
            unread_count: msg.direction === "inbound" ? 1 : 0,
          });
        } else if (msg.direction === "inbound") {
          const conv = map.get(msg.client_id)!;
          conv.unread_count += 1;
        }
      }

      return Array.from(map.values()).sort(
        (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useWhatsAppConversations.ts
git commit -m "feat(whatsapp): add useWhatsAppConversations hook"
```

---

## Task 7: Create `ChatPage` with dual-panel layout

**Files:**
- Create: `src/pages/ChatPage.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { useState, useEffect } from "react";
import { MessageSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { WhatsAppChat } from "@/components/whatsapp/WhatsAppChat";
import { useWhatsAppConversations } from "@/hooks/useWhatsAppConversations";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function ChatPage() {
  const { data: conversations, isLoading } = useWhatsAppConversations();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  // Realtime: refresh conversation list on new message
  useEffect(() => {
    const channel = supabase
      .channel("chat-page-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const filtered = (conversations || []).filter((c) =>
    c.client_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.client_phone || "").includes(search)
  );

  const selected = filtered.find((c) => c.client_id === selectedClientId) || filtered[0];

  // Auto-select first conversation
  useEffect(() => {
    if (!selectedClientId && filtered.length > 0) {
      setSelectedClientId(filtered[0].client_id);
    }
  }, [filtered, selectedClientId]);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border bg-card shadow-card">
      {/* Left panel — conversation list */}
      <div className="w-80 shrink-0 flex flex-col border-r">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Nenhuma conversa ainda.</p>
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.client_id}
                onClick={() => setSelectedClientId(conv.client_id)}
                className={`w-full flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors border-b last:border-0 text-left ${
                  selectedClientId === conv.client_id ? "bg-muted/60" : ""
                }`}
              >
                <div className="h-9 w-9 shrink-0 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700">
                  {conv.client_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium truncate">{conv.client_name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                      {formatRelativeTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
                    {conv.unread_count > 0 && (
                      <span className="ml-1 shrink-0 h-4 min-w-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center px-1">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <motion.div key={selected.client_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700">
                {selected.client_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{selected.client_name}</p>
                {selected.client_phone && (
                  <p className="text-xs text-muted-foreground">{selected.client_phone}</p>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <WhatsAppChat
                clientId={selected.client_id}
                clientPhone={selected.client_phone || ""}
                clientName={selected.client_name}
              />
            </div>
          </motion.div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/ChatPage.tsx
git commit -m "feat(whatsapp): add ChatPage with dual-panel conversation list"
```

---

## Task 8: Add Chat to sidebar and App routes

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add MessageSquare import and Chat nav entry in AppSidebar.tsx**

In `src/components/layout/AppSidebar.tsx`, add `MessageSquare` to the lucide import line and add to `mainNav`:

```typescript
// Add to lucide imports (the existing import block):
import {
  // ... existing imports ...
  MessageSquare,
} from "lucide-react";

// Add to mainNav array after CRM Pipeline:
const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Meu Painel", url: "/meu-painel", icon: User },
  { title: "CRM Pipeline", url: "/crm", icon: Kanban },
  { title: "Chat WhatsApp", url: "/chat", icon: MessageSquare }, // ADD THIS
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Equipamentos", url: "/equipamentos", icon: Package },
];
```

- [ ] **Step 2: Add /chat route in App.tsx**

In `src/App.tsx`, add the lazy import and route:

```typescript
// Add lazy import (with other lazy imports):
const ChatPage = lazy(() => import("./pages/ChatPage"));

// Add route (inside <Routes>, after CRM route):
<Route path="/chat" element={<ChatPage />} />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppSidebar.tsx src/App.tsx
git commit -m "feat(whatsapp): add Chat nav entry and /chat route"
```

---

## Task 9: Add WhatsApp tab to client detail

**Files:**
- Modify: `src/pages/ClientsPage.tsx`

- [ ] **Step 1: Check how client detail is shown**

Open `src/pages/ClientsPage.tsx` and find how the client detail/drawer is opened (look for `CrudDialog` or sheet component showing client details).

The WhatsApp tab should be added wherever the full client detail view is rendered. Look for a component that shows multiple tabs for a client. If none exists, add a dialog that opens when clicking the client row with a WhatsApp tab.

- [ ] **Step 2: Add WhatsApp import and tab**

In the client detail component (or `ClientsPage.tsx`), add a WhatsApp tab:

```typescript
import { WhatsAppChat } from "@/components/whatsapp/WhatsAppChat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Inside the client detail section, wrap existing content in tabs:
<Tabs defaultValue="info">
  <TabsList>
    <TabsTrigger value="info">Informações</TabsTrigger>
    <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
  </TabsList>
  <TabsContent value="info">
    {/* existing client info content */}
  </TabsContent>
  <TabsContent value="whatsapp" className="h-96">
    <WhatsAppChat
      clientId={selectedClient.id}
      clientPhone={selectedClient.whatsapp || selectedClient.phone || ""}
      clientName={selectedClient.name}
    />
  </TabsContent>
</Tabs>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/ClientsPage.tsx
git commit -m "feat(whatsapp): add WhatsApp tab to client detail"
```

---

## Task 10: Push to GitHub and deploy to VPS

- [ ] **Step 1: Push all commits**

```bash
cd c:/VS_CODE/LivePosVenda
git push origin main
```

- [ ] **Step 2: Build and deploy on VPS**

```bash
cd /opt/posvenda && git pull origin main && docker build --no-cache \
  --build-arg VITE_SUPABASE_URL="https://ehqkggiuouczmafmlzls.supabase.co" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_TBXHRRXXZEok0JWK08lbeQ_tcJdv4gZ" \
  -t posvenda:latest . && docker service update --image posvenda:latest --force live-posvenda
```

- [ ] **Step 3: Test end-to-end**

1. Abra https://posvenda.liveuni.com.br
2. Acesse a aba "Chat WhatsApp" no menu lateral
3. Envie uma mensagem de teste via WhatsApp para o número conectado ao Uazapi
4. Verifique que a conversa aparece na lista e o ticket é criado no CRM
5. Responda a mensagem pelo sistema e verifique que chega no WhatsApp

---

## Notes

- A contagem de "não lidas" é simplificada: conta todas as mensagens inbound na conversa. Para uma solução mais precisa, adicionar coluna `read_at` futuramente.
- O Uazapi pode usar formatos de payload diferentes dependendo da versão. Se o webhook não funcionar, verificar os logs da Edge Function no Supabase Dashboard → Functions → Logs.
- Para verificar logs: `npx supabase functions logs whatsapp-webhook --project-ref ehqkggiuouczmafmlzls`
