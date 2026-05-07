# WhatsApp Browser Extension — Design Spec

**Data:** 2026-05-07  
**Projeto:** LivePosVenda CRM  
**Contexto:** Substituir Uazapi (API não-oficial, causando banimento Meta) por extensão Chrome/Firefox que opera sobre o WhatsApp Web real, sem violar os termos de serviço do Meta.

---

## Problema

O Uazapi emula o protocolo do WhatsApp Web em nível de rede. O Meta detecta esse padrão e restringe/bane os números. Com 3 dias de uso, os números já estão sendo impactados.

## Solução

Extensão de browser (Manifest V3, Chrome + Firefox) que:
- Roda na aba `web.whatsapp.com` de cada usuário
- Captura mensagens recebidas via DOM MutationObserver
- Injeta mensagens de envio no input do WhatsApp Web
- Sincroniza tudo com o Supabase (mesmo backend existente)

O Meta enxerga um humano usando o WhatsApp Web normalmente.

---

## Arquitetura

### Componentes

```
┌─────────────────────────────────────────────────────┐
│ Browser do Usuário (Chrome ou Firefox)              │
│                                                     │
│  ┌──────────────────┐    ┌──────────────────────┐  │
│  │  Tab: WA Web     │    │  Tab: CRM            │  │
│  │  content_script  │    │  (sem mudança UI)    │  │
│  │  - MutationObs.  │    │                      │  │
│  │  - inject send   │    │                      │  │
│  └────────┬─────────┘    └──────────────────────┘  │
│           │                                         │
│  ┌────────▼─────────────────────────────────────┐  │
│  │  background.js (service worker)              │  │
│  │  - Supabase Realtime (pending_sends)         │  │
│  │  - Relay: banco → content_script → WA Web   │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │     SUPABASE        │
              │  whatsapp_messages  │
              │  pending_sends      │
              │  Realtime           │
              └─────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   CRM (React/Vite)  │
              │  Chat + Pipeline    │
              │  (UI inalterada)    │
              └─────────────────────┘
```

### Fluxo: Mensagem Recebida

1. Contato envia WhatsApp → aparece na aba WA Web do usuário
2. `content_script.js` detecta via MutationObserver no DOM
3. Extrai: remetente (phone), texto, hora, `instance_id` do usuário
4. **Mídia (áudio/imagem):** WA Web decripta automaticamente e cria `<audio>` ou `<img>` com `blob:` URL. O content_script faz `fetch(blobUrl)` → bytes em memória → upload para Supabase Storage bucket `whatsapp-media` → salva URL pública
5. Envia para `background.js` via `chrome.runtime.sendMessage`
6. Background insere em `whatsapp_messages` com `media_url` preenchida (direction: inbound)
7. CRM recebe via Realtime → exibe texto ou player `<audio>`/`<img>` com a URL do Storage

### Fluxo: Envio pelo CRM (mesmo usuário)

1. Letácia digita no CRM → clica Enviar
2. Edge function `send-whatsapp`: grava em `whatsapp_pending_sends` com `instance_id = Letácia`
3. Supabase Realtime notifica `background.js` da Letácia
4. Background envia `INJECT_SEND` para `content_script`
5. Content script: abre conversa → foca input → injeta texto → simula Enter
6. Background confirma: atualiza `status = sent`, insere em `whatsapp_messages` (direction: outbound)

### Fluxo: Admin envia pelo número da Letácia

Idêntico ao fluxo anterior. A edge function grava `instance_id = Letácia`. A extensão da Letácia executa. Admin não precisa de extensão para enviar (só para receber pelo próprio número).

---

## Estrutura de Arquivos da Extensão

```
livecrm-extension/
├── manifest.json          # MV3, permissões mínimas
├── background.js          # service worker — Realtime + relay
├── content_script.js      # DOM observer + inject send
├── popup.html             # status da conexão
├── popup.js               # lógica do popup
└── lib/
    └── supabase.js        # Supabase client (bundled, sem npm)
```

---

## Schema: Nova Tabela

```sql
CREATE TABLE whatsapp_pending_sends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES pipeline_whatsapp_instances(id),
  phone       text NOT NULL,          -- destinatário
  message     text,
  media_url   text,                   -- opcional (imagem/arquivo)
  status      text NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  error       text,
  created_at  timestamptz DEFAULT now(),
  sent_at     timestamptz,
  created_by  uuid REFERENCES auth.users(id)   -- quem pediu o envio
);

-- RLS: extensão usa service_role key para gravar; edge function usa service_role
-- Realtime habilitado na tabela (filtro por instance_id)
```

---

## Supabase Storage

Bucket `whatsapp-media` (público):
- Armazena áudios (.ogg/.mp3), imagens (.jpg/.png/.webp) recebidos via WA Web
- Path: `{instance_id}/{client_id}/{timestamp}.{ext}`
- Tamanho máximo por arquivo: 16 MB (limite WA)
- Vídeos: upload apenas se < 10 MB, caso contrário salva placeholder "🎥 Vídeo"

---

## Mudanças no Backend Existente

### Edge Function `send-whatsapp` (modificada)

**Antes:** chama `POST https://liveuni.uazapi.com/message/sendText`  
**Depois:** insere em `whatsapp_pending_sends` e retorna 200 imediatamente

Sem mudança na interface chamada pelo `WhatsAppChat.tsx`.

### Edge Function `whatsapp-webhook` (mantida temporariamente)

Mantida durante a transição para não quebrar instâncias ainda no Uazapi. Removida após migração completa de todos os usuários.

### `whatsapp-webhook-extension` (nova edge function, opcional)

Se necessário, endpoint dedicado para a extensão gravar mensagens recebidas com autenticação por token de usuário (alternativa ao Supabase client direto na extensão).

---

## Autenticação da Extensão

No primeiro uso, a extensão exibe um formulário de login com email/senha do CRM. Usa `supabase.auth.signInWithPassword()`. O token JWT é salvo em `chrome.storage.local`. Expiração tratada com refresh automático.

A extensão identifica automaticamente o `instance_id` do usuário logado consultando `pipeline_whatsapp_instances WHERE user_id = auth.uid()`.

---

## Distribuição

Extensão **não publicada em store** — distribuída como `.zip` via link interno.

**Instalação Chrome/Edge:**  
`chrome://extensions` → ativar "Modo desenvolvedor" → "Carregar sem compactação" ou instalar `.crx`

**Instalação Firefox:**  
`about:debugging` → "Este Firefox" → "Carregar extensão temporária"  
*(ou assinar via AMO para instalação permanente)*

**Requisito operacional:** WhatsApp Web logado e aba aberta no browser durante o horário de trabalho.

---

## Plano de Migração (sem downtime)

1. Construir e testar extensão num número piloto (1 usuário)
2. Validar recebimento e envio por 24h
3. Instalar em todos os usuários um a um
4. Remover chamadas Uazapi da edge function `send-whatsapp`
5. Desconectar instâncias do Uazapi
6. Cancelar assinatura Uazapi

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Usuário fecha browser | `pending_sends` ficam na fila; saem ao reabrir |
| WhatsApp Web muda DOM | Selectors com múltiplos fallbacks + monitoramento |
| Firefox sem suporte a MV3 completo | MV3 suportado desde Firefox 109 (jan 2023) |
| Token JWT expira | Refresh automático no background.js |
| Mensagem duplicada (inbound) | Deduplica por `waMessageId` antes de inserir |

---

## Fora de Escopo

- Mensagens de grupo (apenas DMs por ora)
- Enviar voz/vídeo pelo CRM (requer upload de arquivo no DOM do WA Web — complexidade alta)
- Multi-dispositivo sem browser aberto
- Publicação nas stores Chrome Web Store / Firefox Add-ons
