# Extension Sidebar — 3 Novas Features
**Data:** 2026-05-08  
**Escopo:** Extensão Chrome LiveCRM WhatsApp (`livecrm-extension/`) + migration Supabase + ajuste CRM frontend

---

## 1. Mudar de Etapa na Sidebar

### Comportamento
- A sidebar exibe um `<select>` com **todas** as etapas do pipeline do card (incluindo etapas anteriores), ordenadas por `position`.
- A etapa atual aparece pré-selecionada.
- Ao trocar de etapa, content_script envia `MOVE_STAGE` ao background.js.
- Background atualiza `tickets.pipeline_stage` via Supabase.
- Se a nova etapa for diferente da anterior, dispara `trigger-automations` (mesmo comportamento do frontend CRM).
- Sidebar exibe feedback visual: spinner durante a operação → "✓ Movido para: [etapa]" por 2s.
- Em caso de erro: "✗ Falha ao mover" por 2s.

### Novo handler background.js
```
MOVE_STAGE { ticketId, pipelineId, newStage, previousStage }
→ UPDATE tickets SET pipeline_stage = newStage WHERE id = ticketId
→ se newStage !== previousStage: invoke trigger-automations
→ retorna { ok: true } ou { ok: false, error }
```

### Dados necessários
- `GET_CLIENT_DATA` já retorna `ticket.pipeline_stage` e `ticket.pipeline_id`
- `GET_PIPELINE_STAGES` (novo handler): `SELECT key, label FROM pipeline_stages WHERE pipeline_id = ? ORDER BY position`

---

## 2. Importar Histórico — Texto + Áudio

### Comportamento — Texto (melhoria do existente)
- Checkboxes por mensagem de texto na conversa aberta.
- Botão "✓ Salvar selecionadas" persiste em `client_service_history`:
  - `service_status = 'historico_wa'`
  - `problem_reported = "[Histórico WA — dd/mm/aa HH:mm]\n[Eu] ...\n[Cliente] ..."`
  - `service_date = now()`

### Comportamento — Áudio (novo)
- Mensagens de áudio aparecem na lista de seleção marcadas como `🎵 Áudio [0:32]`.
- Duração extraída do elemento `<audio>` via `audioEl.duration`.
- Ao salvar, para cada áudio selecionado:
  1. content_script faz `fetch(audioEl.src)` → `ArrayBuffer`
  2. Converte para base64 e envia `UPLOAD_AUDIO` ao background
  3. background.js faz upload para Supabase Storage: `whatsapp-audio/{client_id}/{timestamp}.{ext}` onde `ext` é derivado do MIME type real (`ogg`, `webm`, `mp4`)
  4. Salva URL pública no `client_service_history` como linha `[🎵 Áudio: <url>]`
  5. Se fetch falhar (blob expirado): registra `[🎵 Áudio — indisponível]` e continua

### Supabase Storage
- Bucket: `whatsapp-audio`
- RLS: usuários autenticados podem inserir; leitura pública ou autenticada
- Migration: criar bucket via SQL ou configurar no dashboard Supabase

### Handler background.js
```
UPLOAD_AUDIO { clientId, base64, mimeType, durationSec }
→ decode base64 → Uint8Array
→ storage.from('whatsapp-audio').upload(`${clientId}/${Date.now()}.ogg`, blob)
→ retorna { ok: true, url } ou { ok: false, error }
```

---

## 3. Produtos / Negociação

### Comportamento na sidebar
1. Seção "Produtos" exibe lista de produtos já adicionados ao card (nome, preço unitário × qtd, subtotal).
2. Rodapé da lista: **Total: R$ xxx,xx**.
3. Botão "+ Adicionar produto" abre mini-form inline:
   - `<select>` com produtos do `deal_catalog_products` (name + base_price)
   - Campo "Preço" pré-preenchido com `base_price`, editável
   - Campo "Qtd" (default 1, mínimo 1)
   - Botão "Salvar" → insere em `ticket_products`
4. Lista atualiza após salvar.
5. Produto pode ser removido com botão "×" (DELETE em `ticket_products`).

### Migration — ticket_products
```sql
CREATE TABLE public.ticket_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES public.deal_catalog_products(id),
  name        TEXT NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ticket_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tp_staff_all" ON public.ticket_products
  FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));
```

### Handlers background.js
```
GET_CATALOG_PRODUCTS {}
→ SELECT id, name, base_price FROM deal_catalog_products WHERE visible = true ORDER BY name
→ retorna { products: [...] }

GET_TICKET_PRODUCTS { ticketId }
→ SELECT * FROM ticket_products WHERE ticket_id = ticketId ORDER BY created_at
→ retorna { products: [...] }

SAVE_TICKET_PRODUCT { ticketId, productId, name, unitPrice, quantity }
→ INSERT INTO ticket_products (...)
→ retorna { ok: true, product }

DELETE_TICKET_PRODUCT { productId }
→ DELETE FROM ticket_products WHERE id = productId
→ retorna { ok: true }
```

### CRM Frontend (TicketDetailDialog.tsx)
- Nova seção "Produtos" na aba de informações do card.
- Lê `ticket_products` via `useQuery`.
- Exibe lista com total geral.
- Somente leitura no dialog (edição fica na sidebar da extensão por ora).

---

## Arquivos a modificar

| Arquivo | Mudança |
|---------|---------|
| `livecrm-extension/content_script.js` | Stage selector, seleção de áudio, seção produtos |
| `livecrm-extension/background.js` | 6 novos handlers |
| `supabase/migrations/YYYYMMDD_ticket_products.sql` | Nova tabela |
| `src/components/tickets/TicketDetailDialog.tsx` | Seção produtos (leitura) |

---

## Fora do escopo
- Edição de produtos existentes via CRM frontend (apenas leitura no dialog)
- Transcrição de áudio
- Múltiplos áudios em uma única mensagem de histórico separada
