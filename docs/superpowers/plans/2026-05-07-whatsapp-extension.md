# WhatsApp Browser Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir Uazapi por extensão Chrome/Firefox MV3 que opera diretamente no WhatsApp Web real, sem violar termos Meta, conectando via Supabase Realtime ao CRM LivePosVenda.

**Architecture:** O `content_script.js` roda na aba `web.whatsapp.com` do usuário, detecta mensagens recebidas via MutationObserver, faz upload de áudios para Supabase Storage, e injeta texto no input do WA Web quando o `background.js` (service worker) recebe um `pending_send` via Realtime. O CRM continua sem mudança de UX — já renderiza áudio inline via `AudioPlayer` quando `message_text` começa com 🎵 e `media_url` está preenchida.

**Tech Stack:** Chrome/Firefox Manifest V3, Supabase JS UMD bundle (sem npm), Supabase Realtime + Storage, Deno Edge Function

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260507000001_whatsapp_pending_sends.sql` | Criar | Tabela relay + Realtime |
| `supabase/functions/send-whatsapp/index.ts` | Modificar | Trocar chamada Uazapi por pending_send |
| `livecrm-extension/manifest.json` | Criar | Declaração MV3 |
| `livecrm-extension/config.js` | Criar | Supabase URL + anon key |
| `livecrm-extension/lib/supabase-umd.js` | Download | SDK Supabase bundled |
| `livecrm-extension/background.js` | Criar | Service worker: Realtime + relay + inbound insert |
| `livecrm-extension/content_script.js` | Criar | MutationObserver + inject + blob upload |
| `livecrm-extension/popup.html` | Criar | UI de status / login |
| `livecrm-extension/popup.js` | Criar | Lógica do popup |

**CRM (`WhatsAppChat.tsx`):** nenhuma alteração — já renderiza 🎵 + `media_url` como `AudioPlayer` inline, e 📷/🎥/📎 como download button.

---

## Task 1: Migration — whatsapp_pending_sends

**Files:**
- Create: `supabase/migrations/20260507000001_whatsapp_pending_sends.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- Relay table: CRM grava aqui; extensão lê via Realtime e injeta no WA Web
CREATE TABLE IF NOT EXISTS public.whatsapp_pending_sends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.pipeline_whatsapp_instances(id),
  phone       text NOT NULL,
  message     text,
  status      text NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  error       text,
  created_at  timestamptz DEFAULT now(),
  sent_at     timestamptz,
  created_by  uuid REFERENCES auth.users(id)
);

ALTER TABLE public.whatsapp_pending_sends ENABLE ROW LEVEL SECURITY;

-- Extensão usa service_role key → não precisa de RLS policy para write
-- Usuários autenticados podem ver seus próprios pending_sends
CREATE POLICY "Users see own pending sends"
  ON public.whatsapp_pending_sends FOR SELECT
  TO authenticated
  USING (
    instance_id IN (
      SELECT id FROM public.pipeline_whatsapp_instances WHERE user_id = auth.uid()
    )
  );

-- Habilitar Realtime (background.js assina INSERT nessa tabela)
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_pending_sends;
```

- [ ] **Step 2: Aplicar migration**

```powershell
cd C:\VS_CODE\LivePosVenda
npx supabase db push
```

Esperado: `Applied 1 migration` sem erros.

- [ ] **Step 3: Verificar no Supabase Dashboard**

Abrir Table Editor → `whatsapp_pending_sends` deve existir com colunas `id, instance_id, phone, message, status, error, created_at, sent_at, created_by`.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/20260507000001_whatsapp_pending_sends.sql
git commit -m "feat(db): add whatsapp_pending_sends table for extension relay"
```

---

## Task 2: Edge Function — send-whatsapp (substituir Uazapi)

**Files:**
- Modify: `supabase/functions/send-whatsapp/index.ts`

O arquivo atual tem ~310 linhas. Mantemos toda a lógica de resolução de instância (prioritiades 0–5) e o insert em `whatsapp_messages`. Apenas substituímos o bloco de envio Uazapi (linhas 189–234) por um insert em `pending_sends`.

- [ ] **Step 1: Substituir o conteúdo do arquivo**

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

    const { client_id, ticket_id, message, phone, media_base64, instance_id } = await req.json();

    if (!client_id || !phone) {
      return new Response(
        JSON.stringify({ error: "client_id and phone são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Envio de mídia fora de escopo na extensão
    if (media_base64) {
      return new Response(
        JSON.stringify({ error: "Envio de mídia pelo CRM temporariamente indisponível. Use somente texto." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!message) {
      return new Response(
        JSON.stringify({ error: "message é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length <= 11) cleanPhone = "55" + cleanPhone;

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let useInstanceId: string | null = null;

    // Prioridade 0: instance_id explícito
    if (instance_id) {
      const { data: explicitInst } = await adminClient
        .from("pipeline_whatsapp_instances")
        .select("id")
        .eq("id", instance_id)
        .eq("active", true)
        .maybeSingle();
      if ((explicitInst as any)?.id) useInstanceId = (explicitInst as any).id;
    }

    // Prioridade 1: último inbound no ticket
    if (!useInstanceId && ticket_id) {
      const { data: lastMsg } = await adminClient
        .from("whatsapp_messages")
        .select("instance_id")
        .eq("ticket_id", ticket_id)
        .eq("direction", "inbound")
        .not("instance_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (lastMsg?.[0]?.instance_id) useInstanceId = lastMsg[0].instance_id;
    }

    // Prioridade 2: instância vinculada ao usuário logado
    if (!useInstanceId) {
      const { data: userInst } = await adminClient
        .from("pipeline_whatsapp_instances")
        .select("id")
        .eq("user_id", user.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if ((userInst as any)?.id) useInstanceId = (userInst as any).id;
    }

    // Prioridade 3: último inbound do cliente
    if (!useInstanceId && client_id) {
      const { data: clientMsg } = await adminClient
        .from("whatsapp_messages")
        .select("instance_id")
        .eq("client_id", client_id)
        .eq("direction", "inbound")
        .not("instance_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if ((clientMsg as any)?.instance_id) useInstanceId = (clientMsg as any).instance_id;
    }

    if (!useInstanceId) {
      return new Response(
        JSON.stringify({ error: "Nenhuma instância WhatsApp encontrada para este usuário" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Inserir no relay — extensão do usuário da instância vai executar o envio
    const { error: pendingErr } = await adminClient
      .from("whatsapp_pending_sends")
      .insert({
        instance_id: useInstanceId,
        phone: cleanPhone,
        message,
        created_by: user.id,
      });

    if (pendingErr) throw new Error(`Erro ao enfileirar mensagem: ${pendingErr.message}`);

    // Inserir imediatamente em whatsapp_messages (outbound) para CRM mostrar sem esperar
    const { error: insertErr } = await adminClient.from("whatsapp_messages").insert({
      client_id,
      ticket_id: ticket_id || null,
      direction: "outbound",
      message_text: message,
      sender_phone: cleanPhone,
      status: "sent",
      instance_id: useInstanceId,
    });
    if (insertErr) console.error("Erro ao salvar outbound:", insertErr);

    return new Response(
      JSON.stringify({ success: true }),
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

- [ ] **Step 2: Deploy da edge function**

```powershell
npx supabase functions deploy send-whatsapp --no-verify-jwt
```

Esperado: `Deployed send-whatsapp` sem erros.

- [ ] **Step 3: Teste rápido via CRM**

Abrir o chat de um cliente → digitar "teste extensão" → clicar Enviar.
Esperado: mensagem aparece imediatamente no chat com status "sent".
Verificar no Supabase → `whatsapp_pending_sends` → deve ter 1 registro com `status = pending`.

- [ ] **Step 4: Commit**

```powershell
git add supabase/functions/send-whatsapp/index.ts
git commit -m "feat(edge): send-whatsapp routes via pending_sends instead of Uazapi"
```

---

## Task 3: Extension scaffold — diretório e manifest

**Files:**
- Create: `livecrm-extension/manifest.json`
- Create: `livecrm-extension/config.js`

- [ ] **Step 1: Criar diretório**

```powershell
New-Item -ItemType Directory -Path "C:\VS_CODE\LivePosVenda\livecrm-extension\lib" -Force
```

- [ ] **Step 2: Criar config.js com as credenciais do projeto**

Pegar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do arquivo `.env.local` do projeto.

Criar `livecrm-extension/config.js`:

```javascript
// Credenciais do projeto Supabase — copiar do .env.local
const SUPABASE_URL = "https://SEU_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

- [ ] **Step 3: Criar manifest.json**

Criar `livecrm-extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "LiveCRM WhatsApp",
  "version": "1.0.0",
  "description": "Integra WhatsApp Web com LiveCRM via Supabase",
  "permissions": ["storage"],
  "host_permissions": ["https://web.whatsapp.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://web.whatsapp.com/*"],
      "js": ["lib/supabase-umd.js", "config.js", "content_script.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "LiveCRM Status"
  }
}
```

- [ ] **Step 4: Commit**

```powershell
git add livecrm-extension/
git commit -m "feat(extension): scaffold manifest.json e config.js"
```

---

## Task 4: Extension — download Supabase UMD bundle

**Files:**
- Create: `livecrm-extension/lib/supabase-umd.js`

O UMD bundle expõe `window.Supabase` no content_script e `self.Supabase` no service worker via `importScripts`.

- [ ] **Step 1: Download do bundle**

```powershell
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js" -OutFile "C:\VS_CODE\LivePosVenda\livecrm-extension\lib\supabase-umd.js"
```

- [ ] **Step 2: Verificar que o arquivo tem conteúdo**

```powershell
(Get-Item "C:\VS_CODE\LivePosVenda\livecrm-extension\lib\supabase-umd.js").Length
```

Esperado: arquivo com > 200.000 bytes.

- [ ] **Step 3: Commit**

```powershell
git add livecrm-extension/lib/supabase-umd.js
git commit -m "feat(extension): add Supabase UMD bundle"
```

---

## Task 5: Extension — background.js (service worker)

**Files:**
- Create: `livecrm-extension/background.js`

Responsabilidades:
1. Login via email/senha → salva session em `chrome.storage.local`
2. Busca `instance_id` do usuário em `pipeline_whatsapp_instances`
3. Assina Supabase Realtime em `whatsapp_pending_sends` filtrado por `instance_id`
4. Quando chega `INSERT`: encontra a aba WA Web → manda `INJECT_SEND`
5. Quando content_script confirma envio: atualiza `status = sent`
6. Quando content_script reporta mensagem recebida: insere em `whatsapp_messages`
7. `chrome.alarms` para manter o service worker vivo e reconectar Realtime

- [ ] **Step 1: Criar background.js**

Criar `livecrm-extension/background.js`:

```javascript
importScripts('./lib/supabase-umd.js', './config.js');

let sb = null;          // Supabase client
let instanceId = null;  // UUID da instância deste usuário
let rtChannel = null;   // Canal Realtime ativo

// ── Utilitários ──────────────────────────────────────────────────────────────

async function getStored(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

async function setStored(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

async function findWaTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  return tabs[0] || null;
}

// ── Inicialização ─────────────────────────────────────────────────────────────

async function init() {
  const stored = await getStored(['session', 'instanceId']);
  if (!stored.session) return;

  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${stored.session.access_token}` } },
  });

  instanceId = stored.instanceId;
  if (!instanceId) {
    const { data } = await sb.from('pipeline_whatsapp_instances')
      .select('id').limit(1).single();
    if (data?.id) {
      instanceId = data.id;
      await setStored({ instanceId });
    }
  }

  if (instanceId) subscribeRealtime();
}

// ── Realtime ──────────────────────────────────────────────────────────────────

function subscribeRealtime() {
  if (!sb || !instanceId) return;
  if (rtChannel) sb.removeChannel(rtChannel);

  rtChannel = sb.channel('ext-pending')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'whatsapp_pending_sends',
      filter: `instance_id=eq.${instanceId}`,
    }, async (payload) => {
      const { id, phone, message } = payload.new;
      const tab = await findWaTab();
      if (!tab) {
        await sb.from('whatsapp_pending_sends')
          .update({ status: 'failed', error: 'WA Web não está aberto' })
          .eq('id', id);
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'INJECT_SEND', sendId: id, phone, message });
    })
    .subscribe();
}

// ── Tratamento de mensagens do content_script ─────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'INBOUND_MESSAGE') {
    handleInbound(msg.data).catch(console.error);
  } else if (msg.type === 'SEND_CONFIRMED') {
    sb?.from('whatsapp_pending_sends')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', msg.sendId)
      .then(() => {});
  } else if (msg.type === 'SEND_FAILED') {
    sb?.from('whatsapp_pending_sends')
      .update({ status: 'failed', error: msg.error })
      .eq('id', msg.sendId)
      .then(() => {});
  } else if (msg.type === 'GET_STATUS') {
    sendResponse({ connected: !!sb, instanceId });
    return true;
  } else if (msg.type === 'LOGIN') {
    handleLogin(msg.email, msg.password).then(sendResponse);
    return true;
  } else if (msg.type === 'LOGOUT') {
    chrome.storage.local.clear();
    sb = null; instanceId = null; rtChannel = null;
  }
});

async function handleInbound({ phone, text, mediaUrl, mimetype, waMessageId }) {
  if (!sb || !instanceId) return;

  // Deduplicação pelo waMessageId (campo manychat_message_id)
  const { data: existing } = await sb
    .from('whatsapp_messages')
    .select('id')
    .eq('manychat_message_id', waMessageId)
    .maybeSingle();
  if (existing) return;

  // Buscar client_id pelo telefone
  const { data: client } = await sb
    .from('clients')
    .select('id')
    .or(`phone.eq.${phone},phone.eq.+${phone}`)
    .maybeSingle();

  await sb.from('whatsapp_messages').insert({
    client_id: client?.id || null,
    instance_id: instanceId,
    direction: 'inbound',
    message_text: text,
    media_url: mediaUrl || null,
    media_mime_type: mimetype || null,
    sender_phone: phone,
    status: 'received',
    manychat_message_id: waMessageId,
  });
}

async function handleLogin(email, password) {
  const tempClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await tempClient.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: error.message };

  await setStored({ session: data.session, instanceId: null });
  await init();
  return { success: true };
}

// ── Alarme para manter service worker vivo ────────────────────────────────────

chrome.alarms.create('keepalive', { periodInMinutes: 4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    if (!rtChannel || rtChannel.state !== 'joined') subscribeRealtime();
  }
});

// Inicializar ao carregar o service worker
init().catch(console.error);
```

- [ ] **Step 2: Commit**

```powershell
git add livecrm-extension/background.js
git commit -m "feat(extension): add background.js service worker with Realtime relay"
```

---

## Task 6: Extension — content_script.js

**Files:**
- Create: `livecrm-extension/content_script.js`

Responsabilidades:
1. Observar DOM do WA Web por novas mensagens recebidas via `MutationObserver`
2. Extrair: número (de `data-id`), texto, e blob URL de áudio
3. Para áudio: `fetch(blobUrl)` → `ArrayBuffer` → upload para Supabase Storage → URL pública
4. Enviar dados ao background.js via `chrome.runtime.sendMessage`
5. Ouvir `INJECT_SEND` → abrir conversa → injetar texto → simular Enter

**Convenção de message_text para CRM renderizar corretamente:**
- Áudio: `"🎵 audio.ogg"` + `media_url` preenchida → `AudioPlayer` inline
- Imagem: `"📷 Imagem"` + `media_url = null` → placeholder
- Vídeo: `"🎥 Vídeo"` + `media_url = null` → placeholder
- Documento: `"📎 Arquivo"` + `media_url = null` → placeholder

- [ ] **Step 1: Criar content_script.js**

Criar `livecrm-extension/content_script.js`:

```javascript
// Injetado antes: lib/supabase-umd.js (window.supabase) e config.js (SUPABASE_URL, SUPABASE_ANON_KEY)

const processedIds = new Set();

// Snapshot de mensagens já visíveis ao carregar — não reprocessar históricas
function snapshotExisting() {
  document.querySelectorAll('[data-id]').forEach(el => {
    processedIds.add(el.getAttribute('data-id'));
  });
}

// ── Upload de áudio para Supabase Storage ─────────────────────────────────────

async function uploadAudio(blobUrl, instanceId, phone) {
  const response = await fetch(blobUrl);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const filename = `${Date.now()}.ogg`;
  const path = `${instanceId}/${phone}/${filename}`;

  // Upload via Supabase Storage REST API (sem npm, usando fetch direto)
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/whatsapp-media/${path}`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'audio/ogg',
        'x-upsert': 'true',
      },
      body: bytes,
    }
  );

  if (!uploadRes.ok) throw new Error(`Storage upload failed: ${uploadRes.status}`);
  return `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/${path}`;
}

// ── Processar um nó de mensagem ───────────────────────────────────────────────

async function processNode(node) {
  // Encontrar o elemento com data-id mais próximo
  const el = node.matches?.('[data-id]') ? node : node.querySelector?.('[data-id]');
  if (!el) return;

  const dataId = el.getAttribute('data-id');
  if (!dataId || processedIds.has(dataId)) return;
  processedIds.add(dataId);

  // Formato data-id: "false_5511999999999@c.us_ABCDEF"
  const parts = dataId.split('_');
  if (parts.length < 3) return;

  const isOutbound = parts[0] === 'true';
  if (isOutbound) return; // Ignorar mensagens enviadas por nós

  const jid = parts[1]; // "5511999999999@c.us"
  if (!jid.includes('@c.us')) return; // Ignorar grupos

  const phone = jid.replace('@c.us', '');
  const waMessageId = dataId;

  // Solicitar instanceId ao background
  const { instanceId } = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, resolve)
  );

  // ── Áudio ──
  const audioEl = el.querySelector('audio[src^="blob:"]') ||
                  el.closest('.message-in')?.querySelector('audio[src^="blob:"]');
  if (audioEl?.src) {
    try {
      const mediaUrl = await uploadAudio(audioEl.src, instanceId, phone);
      chrome.runtime.sendMessage({
        type: 'INBOUND_MESSAGE',
        data: { phone, text: '🎵 audio.ogg', mediaUrl, mimetype: 'audio/ogg', waMessageId },
      });
    } catch (e) {
      chrome.runtime.sendMessage({
        type: 'INBOUND_MESSAGE',
        data: { phone, text: '🎵 audio.ogg', mediaUrl: null, waMessageId },
      });
    }
    return;
  }

  // ── Imagem ──
  const imgEl = el.querySelector('img[src^="blob:"]') ||
                el.closest('.message-in')?.querySelector('img[src^="blob:"]');
  if (imgEl) {
    chrome.runtime.sendMessage({
      type: 'INBOUND_MESSAGE',
      data: { phone, text: '📷 Imagem', waMessageId },
    });
    return;
  }

  // ── Vídeo ──
  const videoEl = el.querySelector('video');
  if (videoEl) {
    chrome.runtime.sendMessage({
      type: 'INBOUND_MESSAGE',
      data: { phone, text: '🎥 Vídeo', waMessageId },
    });
    return;
  }

  // ── Documento ──
  const docEl = el.querySelector('[data-testid="document-thumb"]') ||
                el.querySelector('[data-icon="document"]') ||
                el.querySelector('[class*="document"]');
  if (docEl) {
    chrome.runtime.sendMessage({
      type: 'INBOUND_MESSAGE',
      data: { phone, text: '📎 Arquivo', waMessageId },
    });
    return;
  }

  // ── Texto ──
  const textEl = el.querySelector('span.selectable-text') ||
                 el.querySelector('.copyable-text') ||
                 el.querySelector('span[class*="text"]');
  const text = textEl?.innerText?.trim();
  if (text) {
    chrome.runtime.sendMessage({
      type: 'INBOUND_MESSAGE',
      data: { phone, text, waMessageId },
    });
  }
}

// ── MutationObserver ──────────────────────────────────────────────────────────

function startObserver() {
  snapshotExisting();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        // Processar o nó se tiver data-id, ou varrer filhos
        processNode(node).catch(console.error);
        node.querySelectorAll?.('[data-id]').forEach(child => {
          processNode(child).catch(console.error);
        });
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ── Inject Send ───────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function injectSend({ sendId, phone, message }) {
  try {
    // 1. Abrir caixa de busca do WA Web
    const searchBox =
      document.querySelector('[data-testid="chat-list-search"]') ||
      document.querySelector('div[title="Pesquisar ou começar uma nova conversa"]') ||
      document.querySelector('[data-tab="3"]');

    if (!searchBox) throw new Error('Search box not found');

    searchBox.focus();
    // Limpar busca anterior
    searchBox.textContent = '';
    searchBox.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await sleep(300);

    // Digitar o número
    document.execCommand('insertText', false, phone);
    searchBox.dispatchEvent(new InputEvent('input', { bubbles: true, data: phone }));
    await sleep(1500);

    // 2. Clicar no primeiro resultado
    const firstResult =
      document.querySelector('[data-testid="cell-frame-container"]') ||
      document.querySelector('[tabindex="-1"][role="listitem"]');

    if (!firstResult) throw new Error(`No chat found for phone ${phone}`);
    firstResult.click();
    await sleep(800);

    // 3. Encontrar o input de composição
    const input =
      document.querySelector('[data-testid="conversation-compose-box-input"]') ||
      document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
      document.querySelector('div[contenteditable="true"][title="Digite uma mensagem"]');

    if (!input) throw new Error('Compose input not found');

    // 4. Injetar texto
    input.focus();
    document.execCommand('insertText', false, message);
    await sleep(200);

    // 5. Enviar com Enter
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
    }));
    await sleep(300);

    chrome.runtime.sendMessage({ type: 'SEND_CONFIRMED', sendId });
  } catch (e) {
    console.error('[LiveCRM] INJECT_SEND failed:', e.message);
    chrome.runtime.sendMessage({ type: 'SEND_FAILED', sendId, error: e.message });
  }
}

// ── Listeners ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'INJECT_SEND') {
    injectSend(msg).catch(console.error);
  }
});

// Iniciar quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}
```

- [ ] **Step 2: Commit**

```powershell
git add livecrm-extension/content_script.js
git commit -m "feat(extension): add content_script with MutationObserver and INJECT_SEND"
```

---

## Task 7: Extension — popup.html + popup.js

**Files:**
- Create: `livecrm-extension/popup.html`
- Create: `livecrm-extension/popup.js`

- [ ] **Step 1: Criar popup.html**

Criar `livecrm-extension/popup.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: sans-serif; width: 280px; padding: 16px; background: #111827; color: #f9fafb; margin: 0; }
    h2 { margin: 0 0 12px; font-size: 14px; color: #60a5fa; }
    .status { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot.green { background: #4ade80; }
    .dot.red { background: #f87171; }
    label { display: block; font-size: 12px; color: #9ca3af; margin-bottom: 4px; }
    input { width: 100%; box-sizing: border-box; background: #1f2937; border: 1px solid #374151; color: #f9fafb; padding: 6px 8px; border-radius: 6px; font-size: 13px; margin-bottom: 8px; }
    button { width: 100%; padding: 7px; border-radius: 6px; border: none; font-size: 13px; cursor: pointer; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-danger { background: #dc2626; color: white; margin-top: 8px; }
    .error { color: #f87171; font-size: 12px; margin-top: 4px; }
    #status-section, #login-section { display: none; }
    .info { font-size: 12px; color: #9ca3af; margin-bottom: 4px; }
  </style>
</head>
<body>
  <h2>LiveCRM — WhatsApp</h2>

  <div id="login-section">
    <label>Email CRM</label>
    <input id="email" type="email" placeholder="usuario@liveequipamentos.com.br">
    <label>Senha</label>
    <input id="password" type="password" placeholder="Senha">
    <button class="btn-primary" id="btn-login">Entrar</button>
    <div class="error" id="login-error"></div>
  </div>

  <div id="status-section">
    <div class="status">
      <div class="dot" id="dot"></div>
      <span id="status-text">Verificando...</span>
    </div>
    <div class="info" id="instance-info"></div>
    <div class="info" id="wa-info"></div>
    <button class="btn-danger" id="btn-logout">Sair</button>
  </div>
</body>
<script src="popup.js"></script>
</html>
```

- [ ] **Step 2: Criar popup.js**

Criar `livecrm-extension/popup.js`:

```javascript
const loginSection = document.getElementById('login-section');
const statusSection = document.getElementById('status-section');
const dot = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const instanceInfo = document.getElementById('instance-info');
const waInfo = document.getElementById('wa-info');
const loginError = document.getElementById('login-error');

function showLogin() {
  loginSection.style.display = 'block';
  statusSection.style.display = 'none';
}

function showStatus(connected, instanceId) {
  loginSection.style.display = 'none';
  statusSection.style.display = 'block';
  dot.className = `dot ${connected ? 'green' : 'red'}`;
  statusText.textContent = connected ? 'Conectado ao CRM' : 'Desconectado';
  instanceInfo.textContent = instanceId ? `Instância: ${instanceId.slice(0, 8)}...` : 'Instância não encontrada';

  // Verificar se WA Web está aberta
  chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
    waInfo.textContent = tabs.length > 0
      ? '🟢 WhatsApp Web aberto'
      : '🔴 WhatsApp Web não encontrado — abra web.whatsapp.com';
  });
}

// Verificar estado inicial
chrome.storage.local.get(['session'], (stored) => {
  if (!stored.session) {
    showLogin();
    return;
  }
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (res) showStatus(res.connected, res.instanceId);
    else showLogin();
  });
});

// Login
document.getElementById('btn-login').addEventListener('click', () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  loginError.textContent = '';
  if (!email || !password) { loginError.textContent = 'Preencha email e senha'; return; }

  chrome.runtime.sendMessage({ type: 'LOGIN', email, password }, (res) => {
    if (res?.success) {
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
        showStatus(status?.connected, status?.instanceId);
      });
    } else {
      loginError.textContent = res?.error || 'Erro ao fazer login';
    }
  });
});

// Logout
document.getElementById('btn-logout').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LOGOUT' });
  showLogin();
});
```

- [ ] **Step 3: Commit**

```powershell
git add livecrm-extension/popup.html livecrm-extension/popup.js
git commit -m "feat(extension): add popup login/status UI"
```

---

## Task 8: Pilot install e teste

- [ ] **Step 1: Preencher config.js com credenciais reais**

Abrir `.env.local` do projeto e copiar:
- `VITE_SUPABASE_URL` → `SUPABASE_URL` em `livecrm-extension/config.js`
- `VITE_SUPABASE_PUBLISHABLE_KEY` → `SUPABASE_ANON_KEY` em `livecrm-extension/config.js`

Resultado esperado:
```javascript
const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...longa_string...";
```

- [ ] **Step 2: Instalar no Chrome**

1. Abrir `chrome://extensions`
2. Ativar "Modo desenvolvedor" (canto superior direito)
3. Clicar "Carregar sem compactação"
4. Selecionar a pasta `C:\VS_CODE\LivePosVenda\livecrm-extension`

Esperado: extensão "LiveCRM WhatsApp" aparece na lista sem erros.

- [ ] **Step 3: Login na extensão**

1. Clicar no ícone da extensão na barra do Chrome
2. Inserir email e senha de um usuário piloto (ex: a própria conta do Rodrigo)
3. Clicar "Entrar"

Esperado: tela muda para status com 🟢 "Conectado ao CRM" e informações da instância.

- [ ] **Step 4: Abrir WhatsApp Web**

Abrir `https://web.whatsapp.com` na mesma janela do Chrome.
O status do popup deve mostrar "🟢 WhatsApp Web aberto".

- [ ] **Step 5: Testar recebimento**

Enviar uma mensagem de texto para o número do usuário piloto de um celular externo.
Aguardar 5–10 segundos.

Verificar em Supabase → `whatsapp_messages`:
```sql
SELECT id, direction, message_text, sender_phone, instance_id, created_at
FROM whatsapp_messages
ORDER BY created_at DESC
LIMIT 5;
```

Esperado: linha com `direction = 'inbound'`, `message_text = <texto enviado>`, `instance_id` preenchido.

Verificar no CRM → chat do contato: mensagem deve aparecer em tempo real.

- [ ] **Step 6: Testar envio (CRM → WA Web)**

No CRM, abrir a conversa do número piloto → digitar "teste de envio via extensão" → Enviar.

Verificar em Supabase → `whatsapp_pending_sends`:
```sql
SELECT id, phone, message, status, sent_at FROM whatsapp_pending_sends
ORDER BY created_at DESC LIMIT 3;
```

Aguardar 3–5 segundos. O `status` deve mudar de `pending` para `sent`.

Verificar no celular externo: mensagem deve ter chegado.

- [ ] **Step 7: Testar recebimento de áudio**

Enviar um áudio para o número piloto via celular.
Aguardar que o WA Web decripte (aparece o player de áudio na aba).

Verificar no CRM: mensagem deve aparecer com player de áudio inline (🎵).

Verificar em Supabase Storage → bucket `whatsapp-media`: deve ter um arquivo `.ogg` no path `{instance_id}/{phone}/{timestamp}.ogg`.

- [ ] **Step 8: Commit final**

```powershell
git add livecrm-extension/
git commit -m "feat(extension): livecrm-extension v1.0 - WhatsApp Web bridge via Supabase"
```

---

## Self-review — checklist de spec

| Requisito da spec | Task que cobre |
|---|---|
| content_script roda em web.whatsapp.com | Task 3 (manifest host_permissions), Task 6 |
| MutationObserver detecta mensagens recebidas | Task 6 (startObserver) |
| Extrai remetente via data-id | Task 6 (parse data-id) |
| Áudio: blob URL → Supabase Storage | Task 6 (uploadAudio) |
| Imagem/Vídeo/Doc: placeholder | Task 6 (📷/🎥/📎 sem upload) |
| background.js assina Realtime pending_sends | Task 5 (subscribeRealtime) |
| Inject text no input do WA Web | Task 6 (injectSend) |
| Admin envia pelo número da Letácia | Task 2 (edge fn resolve instance_id) → Task 5 (Realtime filtra por instance_id) |
| Deduplicação por waMessageId | Task 5 (handleInbound: manychat_message_id) |
| Token JWT persiste + keepalive | Task 5 (chrome.alarms, chrome.storage) |
| CRM exibe áudio inline | Já implementado (WhatsAppChat.tsx AudioPlayer) — zero mudanças |
| Distribuição sem store | Task 8 (Carregar sem compactação) |
| whatsapp_pending_sends tabela | Task 1 |
| send-whatsapp sem Uazapi | Task 2 |

Todos os requisitos cobertos. Mídia outbound (fora de escopo) retorna 400 com mensagem clara.
