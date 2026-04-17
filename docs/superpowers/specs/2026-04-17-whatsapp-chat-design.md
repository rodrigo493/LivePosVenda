# WhatsApp Chat Integration — LivePosVenda

**Date:** 2026-04-17  
**Provider:** Uazapi (`https://free.uazapi.com`)  
**Status:** Approved

---

## Objective

Integrate WhatsApp into LivePosVenda so operators can:
1. See all conversations in a dedicated `/chat` page
2. View the conversation with a specific client inside their client card (WhatsApp tab)
3. Send and receive messages in real-time
4. Have unknown numbers automatically create a new client + ticket in the first CRM funnel stage (`sem_atendimento`)

---

## Architecture

### Message Flow — Inbound
```
Uazapi → POST /whatsapp-intake (Supabase Edge Function)
  ├─ Extract: phone, message_text, sender_name, wa_message_id
  ├─ Lookup client by phone in public.clients
  │   ├─ Found → insert whatsapp_messages with client_id
  │   └─ Not found →
  │       ├─ INSERT client (name=phone, phone=phone)
  │       ├─ INSERT ticket (pipeline_stage='sem_atendimento', assigned_to=posvenda_user_id)
  │       └─ INSERT whatsapp_messages with new client_id
  └─ Supabase Realtime notifies UI
```

### Message Flow — Outbound
```
UI → send-whatsapp Edge Function
  → POST https://free.uazapi.com/message/sendText/{instanceToken}
    Headers: Authorization: Bearer {apiKey}
    Body: { number: "5511...", text: "message" }
  → Save to whatsapp_messages (direction=outbound)
```

---

## Database

### Table: `whatsapp_messages`
```sql
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text text NOT NULL,
  sender_phone text,
  sender_name text,
  wa_message_id text,
  status text DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_view_messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "staff_insert_messages" ON public.whatsapp_messages
  FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
```

---

## Supabase Secrets Required

| Secret | Value |
|--------|-------|
| `UAZAPI_API_KEY` | `ZaW1qwTEkuq7Ub1cBUuyMiK5bNSu3nnMQ9lh7klElc2clSRV8t` |
| `UAZAPI_INSTANCE_TOKEN` | `81a82558-de29-480b-8649-fe4155209fee` |
| `UAZAPI_BASE_URL` | `https://free.uazapi.com` |
| `POSVENDA_USER_ID` | `46ed7639-3a8c-4540-bad0-68d11a82f188` |

---

## Edge Functions

### `whatsapp-intake` (new/updated)
- Receives POST from Uazapi webhook
- No auth required (public webhook endpoint)
- Validates payload, finds or creates client
- Inserts `whatsapp_messages`
- Auto-creates ticket if new contact

### `send-whatsapp` (updated)
- Replaces Meta Cloud API call with Uazapi call
- Endpoint: `POST {UAZAPI_BASE_URL}/message/sendText/{UAZAPI_INSTANCE_TOKEN}`
- Header: `Authorization: Bearer {UAZAPI_API_KEY}`
- Body: `{ "number": "{cleanPhone}", "text": "{message}" }`

### Uazapi Webhook URL to configure:
`https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/whatsapp-intake`

---

## UI Components

### `/chat` Page (`src/pages/ChatPage.tsx`)
- Two-panel layout (responsive: stacks on mobile)
- Left panel: conversation list
  - Shows client name (or phone if unknown)
  - Last message preview + timestamp
  - Unread count badge
  - "Novo" badge for conversations without a client name
- Right panel: `WhatsAppChat` component (existing)
- Sidebar navigation entry "Chat" with unread count badge

### WhatsApp Tab in Client Detail
- New "WhatsApp" tab in `ClientDetailPage` or wherever client cards are shown
- Renders `WhatsAppChat` with `clientId` and `clientPhone` props

---

## Navigation
- Add "Chat" link to `AppSidebar.tsx` pointing to `/chat`
- Add `/chat` route to `App.tsx`

---

## Out of Scope
- Media messages (images, audio) — text only
- Read receipts
- WhatsApp templates / HSM messages
- Multiple WhatsApp instances
