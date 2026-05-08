# Extension Sidebar — Mudar Etapa, Histórico Áudio, Produtos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 3 features à sidebar da extensão Chrome LiveCRM: seletor de etapa do card, importação de áudios para o histórico e seção de produtos/negociação.

**Architecture:** Cada feature adiciona handlers no background.js (acesso ao Supabase) e UI no content_script.js (sidebar do WA Web). A feature de produtos requer uma nova migration. O CRM frontend recebe uma seção read-only de produtos.

**Tech Stack:** Chrome Extension MV3, JavaScript (content_script + background), Supabase JS Client, Supabase Storage, TypeScript/React (CRM frontend)

---

## Mapa de Arquivos

| Arquivo | O que muda |
|---------|-----------|
| `supabase/migrations/20260508000001_ticket_products.sql` | CRIAR — tabela ticket_products + RLS |
| `livecrm-extension/background.js` | MODIFICAR — 7 novos handlers no switch de mensagens |
| `livecrm-extension/content_script.js` | MODIFICAR — stage selector, áudio na seleção, seção produtos |
| `src/components/tickets/TicketDetailDialog.tsx` | MODIFICAR — seção produtos read-only |

---

## Task 1: Migration — tabela ticket_products

**Files:**
- Create: `supabase/migrations/20260508000001_ticket_products.sql`

- [ ] **Criar o arquivo de migration**

```sql
-- supabase/migrations/20260508000001_ticket_products.sql
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
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX idx_ticket_products_ticket_id ON public.ticket_products(ticket_id);
```

- [ ] **Aplicar no Supabase** — rodar o SQL acima no Supabase SQL Editor (ou `supabase db push` se CLI configurada)

- [ ] **Verificar** — no Supabase Table Editor, confirmar que a tabela `ticket_products` existe com as colunas corretas

- [ ] **Commit**

```bash
git add supabase/migrations/20260508000001_ticket_products.sql
git commit -m "feat(db): adiciona tabela ticket_products para produtos negociados no card"
```

---

## Task 2: Criar bucket Supabase Storage para áudios

**Files:** nenhum arquivo de código — configuração via SQL Editor

- [ ] **Rodar no Supabase SQL Editor**

```sql
-- Cria o bucket whatsapp-audio (se não existir)
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-audio', 'whatsapp-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: usuários autenticados podem fazer upload
CREATE POLICY "authenticated upload whatsapp-audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'whatsapp-audio');

-- Policy: leitura pública (para renderizar URL no histórico)
CREATE POLICY "public read whatsapp-audio"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'whatsapp-audio');
```

- [ ] **Verificar** — no Supabase Storage, confirmar que o bucket `whatsapp-audio` aparece na lista

---

## Task 3: background.js — 7 novos handlers

**Files:**
- Modify: `livecrm-extension/background.js`

Os handlers são inseridos no bloco `if-else` do `chrome.runtime.onMessage.addListener`, antes do bloco `} else if (msg.type === 'GET_STATUS')`. As funções async são adicionadas no final do arquivo.

- [ ] **Adicionar os 7 handlers no bloco onMessage** — localizar a linha `} else if (msg.type === 'GET_STATUS') {` e inserir antes:

```javascript
  } else if (msg.type === 'GET_PIPELINE_STAGES') {
    handleGetPipelineStages(msg.pipelineId).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'MOVE_STAGE') {
    handleMoveStage(msg.ticketId, msg.pipelineId, msg.newStage, msg.previousStage).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'UPLOAD_AUDIO') {
    handleUploadAudio(msg.clientId, msg.base64, msg.mimeType).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'GET_CATALOG_PRODUCTS') {
    handleGetCatalogProducts().then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'GET_TICKET_PRODUCTS') {
    handleGetTicketProducts(msg.ticketId).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'SAVE_TICKET_PRODUCT') {
    handleSaveTicketProduct(msg.ticketId, msg.productId, msg.name, msg.unitPrice, msg.quantity).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'DELETE_TICKET_PRODUCT') {
    handleDeleteTicketProduct(msg.productId).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
```

- [ ] **Adicionar as funções async no final do arquivo** (antes do `chrome.runtime.onMessageExternal.addListener`):

```javascript
async function handleGetPipelineStages(pipelineId) {
  if (!sb) throw new Error('Extensão não autenticada');
  const { data, error } = await sb
    .from('pipeline_stages')
    .select('key, label')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return { stages: data || [] };
}

async function handleMoveStage(ticketId, pipelineId, newStage, previousStage) {
  if (!sb) throw new Error('Extensão não autenticada');
  const { error } = await sb
    .from('tickets')
    .update({ pipeline_stage: newStage })
    .eq('id', ticketId);
  if (error) throw new Error(error.message);
  if (newStage !== previousStage) {
    const { data: stageRow } = await sb
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .eq('key', newStage)
      .maybeSingle();
    if (stageRow?.id) {
      sb.functions.invoke('trigger-automations', {
        body: { ticket_id: ticketId, stage_id: stageRow.id },
      }).catch(e => console.warn('[LiveCRM BG] trigger-automations:', e));
    }
  }
  return { ok: true };
}

async function handleUploadAudio(clientId, base64, mimeType) {
  if (!sb) throw new Error('Extensão não autenticada');
  const extMap = { 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' };
  const ext = extMap[mimeType] || 'ogg';
  const path = `${clientId}/${Date.now()}.${ext}`;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType || 'audio/ogg' });
  const { error } = await sb.storage.from('whatsapp-audio').upload(path, blob, { contentType: mimeType || 'audio/ogg' });
  if (error) throw new Error(error.message);
  const { data: urlData } = sb.storage.from('whatsapp-audio').getPublicUrl(path);
  return { ok: true, url: urlData.publicUrl };
}

async function handleGetCatalogProducts() {
  if (!sb) throw new Error('Extensão não autenticada');
  const { data, error } = await sb
    .from('deal_catalog_products')
    .select('id, name, base_price')
    .eq('visible', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return { products: data || [] };
}

async function handleGetTicketProducts(ticketId) {
  if (!sb) throw new Error('Extensão não autenticada');
  const { data, error } = await sb
    .from('ticket_products')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return { products: data || [] };
}

async function handleSaveTicketProduct(ticketId, productId, name, unitPrice, quantity) {
  if (!sb) throw new Error('Extensão não autenticada');
  const { data, error } = await sb
    .from('ticket_products')
    .insert({ ticket_id: ticketId, product_id: productId || null, name, unit_price: unitPrice, quantity: quantity || 1 })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, product: data };
}

async function handleDeleteTicketProduct(productId) {
  if (!sb) throw new Error('Extensão não autenticada');
  const { error } = await sb.from('ticket_products').delete().eq('id', productId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
```

- [ ] **Commit**

```bash
git add livecrm-extension/background.js
git commit -m "feat(extension): 7 novos handlers — stages, move, áudio, produtos"
```

---

## Task 4: content_script.js — Seletor de Etapa

**Files:**
- Modify: `livecrm-extension/content_script.js`

Localizar o bloco `if (ticket) {` dentro de `renderSidebarData` (~linha 868). Substituir o bloco que cria `stageWrap` com o badge pela nova lógica com select.

- [ ] **Substituir o bloco de exibição de etapa** — localizar e substituir:

```javascript
  if (ticket) {
    const stageWrap = document.createElement('div');
    stageWrap.style.marginBottom = '10px';
    const lbl = document.createElement('div');
    lbl.textContent = 'FUNIL';
    Object.assign(lbl.style, { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.5px', color: '#6b7280', marginBottom: '4px' });
    stageWrap.appendChild(lbl);
    stageWrap.appendChild(badge(stageLabel || ticket.pipeline_stage || '-'));
    const pname = document.createElement('div');
    pname.textContent = ticket.pipeline_name || '';
    Object.assign(pname.style, { fontSize: '11px', color: '#6b7280', marginTop: '2px' });
    stageWrap.appendChild(pname);
    body.appendChild(stageWrap);
```

Por:

```javascript
  if (ticket) {
    const stageWrap = document.createElement('div');
    stageWrap.style.marginBottom = '10px';
    const lbl = document.createElement('div');
    lbl.textContent = 'FUNIL / ETAPA';
    Object.assign(lbl.style, { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.5px', color: '#6b7280', marginBottom: '4px' });
    stageWrap.appendChild(lbl);

    const pname = document.createElement('div');
    pname.textContent = ticket.pipeline_name || '';
    Object.assign(pname.style, { fontSize: '11px', color: '#6b7280', marginBottom: '4px' });
    stageWrap.appendChild(pname);

    const stageSelect = styledSelect([{ value: ticket.pipeline_stage, label: stageLabel || ticket.pipeline_stage }]);
    stageSelect.style.marginBottom = '4px';
    stageWrap.appendChild(stageSelect);

    const stageFeedback = document.createElement('div');
    Object.assign(stageFeedback.style, { fontSize: '11px', minHeight: '16px', color: '#065f46' });
    stageWrap.appendChild(stageFeedback);

    // Carrega as etapas disponíveis
    sendToBackground({ type: 'GET_PIPELINE_STAGES', pipelineId: ticket.pipeline_id }).then(resp => {
      stageSelect.textContent = '';
      (resp.stages || []).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.key;
        opt.textContent = s.label;
        if (s.key === ticket.pipeline_stage) opt.selected = true;
        stageSelect.appendChild(opt);
      });
    }).catch(() => {});

    stageSelect.addEventListener('change', async () => {
      const newStage = stageSelect.value;
      if (newStage === ticket.pipeline_stage) return;
      stageSelect.disabled = true;
      stageFeedback.textContent = 'Movendo...';
      stageFeedback.style.color = '#6b7280';
      try {
        await sendToBackground({ type: 'MOVE_STAGE', ticketId: ticket.id, pipelineId: ticket.pipeline_id, newStage, previousStage: ticket.pipeline_stage });
        ticket.pipeline_stage = newStage;
        stageFeedback.textContent = '✓ Movido';
        stageFeedback.style.color = '#065f46';
        setTimeout(() => { stageFeedback.textContent = ''; }, 2000);
      } catch (e) {
        stageSelect.value = ticket.pipeline_stage;
        stageFeedback.textContent = '✗ Falha ao mover';
        stageFeedback.style.color = '#dc2626';
        setTimeout(() => { stageFeedback.textContent = ''; }, 2000);
      } finally {
        stageSelect.disabled = false;
      }
    });

    body.appendChild(stageWrap);
```

- [ ] **Commit**

```bash
git add livecrm-extension/content_script.js
git commit -m "feat(extension): seletor de etapa na sidebar com feedback visual"
```

---

## Task 5: content_script.js — Áudio no Histórico

**Files:**
- Modify: `livecrm-extension/content_script.js`

- [ ] **Substituir `extractVisibleMessages`** (~linha 743) para incluir áudios:

```javascript
function extractVisibleMessages() {
  const msgs = [];
  document.querySelectorAll('[data-id]').forEach(node => {
    const isOut = !!node.querySelector('[class*="message-out"]');

    // Mensagem de texto
    const textEl = node.querySelector('[class*="selectable-text"]') || node.querySelector('span[dir]');
    const text = textEl?.textContent?.trim();
    if (text) {
      msgs.push({ type: 'text', direction: isOut ? 'outbound' : 'inbound', text });
      return;
    }

    // Mensagem de áudio
    const audioEl = node.querySelector('audio');
    if (audioEl) {
      const dur = audioEl.duration;
      const durLabel = dur && isFinite(dur)
        ? `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}`
        : '?:??';
      msgs.push({ type: 'audio', direction: isOut ? 'outbound' : 'inbound', text: `🎵 Áudio [${durLabel}]`, audioSrc: audioEl.src, duration: dur });
    }
  });
  return msgs.slice(-30);
}
```

- [ ] **Atualizar o handler do botão "Salvar mensagens"** (~linha 991) para tratar áudios — substituir o bloco `msgs.forEach((m, i) => {` e o `okBtn.addEventListener('click', ...)`:

```javascript
    msgs.forEach((m, i) => {
      const row = document.createElement('label');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'flex-start', gap: '6px', cursor: 'pointer',
        padding: '4px 6px', borderRadius: '4px', background: i % 2 === 0 ? '#f9fafb' : '#fff',
        fontSize: '11px', lineHeight: '1.4',
      });
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.style.marginTop = '2px'; cb.style.flexShrink = '0';
      const span = document.createElement('span');
      const prefix = m.direction === 'outbound' ? '→ ' : '← ';
      span.textContent = prefix + m.text.slice(0, 120);
      Object.assign(span.style, { color: m.direction === 'outbound' ? '#065f46' : '#1f2937' });
      row.appendChild(cb); row.appendChild(span);
      msgSelArea.appendChild(row);
      checkboxes.push({ cb, msg: m });
    });
```

E substituir o `okBtn.addEventListener('click', async () => {` por:

```javascript
    okBtn.addEventListener('click', async () => {
      const selected = checkboxes.filter(({ cb }) => cb.checked).map(({ msg }) => msg);
      if (!selected.length) { alert('Selecione ao menos uma mensagem.'); return; }
      okBtn.disabled = true; okBtn.textContent = 'Salvando...';
      try {
        // Separa textos e áudios
        const textMsgs = selected.filter(m => m.type !== 'audio');
        const audioMsgs = selected.filter(m => m.type === 'audio');

        // Faz upload de cada áudio e coleta as linhas
        const audioLines = [];
        for (const am of audioMsgs) {
          const line = am.direction === 'outbound' ? '[Eu] ' : '[Cliente] ';
          if (am.audioSrc && am.audioSrc.startsWith('blob:')) {
            try {
              const resp = await fetch(am.audioSrc);
              const buf = await resp.arrayBuffer();
              const mimeType = resp.headers.get('content-type') || 'audio/ogg';
              const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
              const upResp = await sendToBackground({ type: 'UPLOAD_AUDIO', clientId: client.id, base64, mimeType });
              audioLines.push(line + `[🎵 Áudio: ${upResp.url}]`);
            } catch (_) {
              audioLines.push(line + am.text + ' — indisponível');
            }
          } else {
            audioLines.push(line + am.text + ' — indisponível');
          }
        }

        // Salva textos normais
        if (textMsgs.length) {
          await sendToBackground({ type: 'SAVE_HISTORY_MESSAGES', clientId: client.id, ticketId: ticket?.id || null, messages: textMsgs });
        }

        // Salva áudios como entrada separada no histórico
        if (audioLines.length) {
          const now = new Date();
          const dateLabel = now.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
          const content = `[Histórico WA Áudio — ${dateLabel}]\n` + audioLines.join('\n');
          await sendToBackground({
            type: 'SAVE_HISTORY_MESSAGES',
            clientId: client.id,
            ticketId: ticket?.id || null,
            messages: [{ direction: 'outbound', text: content, _raw: true }],
          });
        }

        msgSelArea.style.display = 'none';
        msgHistBtn.textContent = '✓ Histórico salvo!';
        setTimeout(() => { msgHistBtn.textContent = 'Salvar mensagens no histórico'; }, 2500);
      } catch (e) {
        okBtn.disabled = false; okBtn.textContent = '✓ Salvar selecionadas';
        alert('Erro: ' + e.message);
      }
    });
```

- [ ] **Atualizar `handleSaveHistoryMessages` no background.js** para suportar mensagens `_raw` (conteúdo já formatado):

Localizar a função `handleSaveHistoryMessages` e substituir:

```javascript
async function handleSaveHistoryMessages(ticketId, clientId, messages) {
  if (!sb) throw new Error('Extensao nao autenticada');
  if (!messages?.length) return { ok: true, saved: 0 };
  const now = new Date();
  const dateLabel = now.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  // Mensagem _raw já vem formatada (ex: bloco de áudios)
  const rawMsg = messages.find(m => m._raw);
  let content;
  if (rawMsg) {
    content = rawMsg.text;
  } else {
    const formatted = messages.map(m => (m.direction === 'outbound' ? '[Eu] ' : '[Cliente] ') + m.text).join('\n');
    content = `[Histórico WA — ${dateLabel}]\n${formatted}`;
  }
  const { error } = await sb.from('client_service_history').insert({
    client_id: clientId,
    service_date: now.toISOString(),
    problem_reported: content,
    service_status: 'historico_wa',
  });
  if (error) throw new Error(error.message);
  return { ok: true, saved: messages.length };
}
```

- [ ] **Commit**

```bash
git add livecrm-extension/content_script.js livecrm-extension/background.js
git commit -m "feat(extension): histórico inclui áudios com upload para Supabase Storage"
```

---

## Task 6: content_script.js — Seção Produtos

**Files:**
- Modify: `livecrm-extension/content_script.js`

Adicionar chamada `renderProductsSection(body, ticket, client)` no final de `renderSidebarData`, antes de fechar a função (após a seção de histórico de mensagens, ~linha 1038).

- [ ] **Adicionar chamada à seção de produtos no `renderSidebarData`** — após o bloco de histórico de mensagens, antes do fechamento `}` da função:

```javascript
  // ── Seção: Produtos / Negociação ────────────────────────────────────────────
  if (ticket) {
    const sep2 = document.createElement('hr');
    Object.assign(sep2.style, { border: 'none', borderTop: '1px solid #e5e7eb', margin: '10px 0' });
    body.appendChild(sep2);
    renderProductsSection(body, ticket, client);
  }
```

- [ ] **Adicionar a função `renderProductsSection`** no final do arquivo (antes de `async function renderSidebarNotFound`):

```javascript
async function renderProductsSection(container, ticket, client) {
  const wrap = document.createElement('div');
  container.appendChild(wrap);

  const lbl = document.createElement('div');
  lbl.textContent = 'PRODUTOS';
  Object.assign(lbl.style, { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.5px', color: '#6b7280', marginBottom: '6px' });
  wrap.appendChild(lbl);

  const listEl = document.createElement('div');
  listEl.style.marginBottom = '6px';
  wrap.appendChild(listEl);

  const totalEl = document.createElement('div');
  Object.assign(totalEl.style, { fontSize: '12px', fontWeight: '700', color: '#111827', marginBottom: '8px', textAlign: 'right' });
  wrap.appendChild(totalEl);

  async function reloadProducts() {
    listEl.textContent = '';
    totalEl.textContent = '';
    const resp = await sendToBackground({ type: 'GET_TICKET_PRODUCTS', ticketId: ticket.id });
    const products = resp.products || [];
    if (!products.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nenhum produto adicionado.';
      Object.assign(empty.style, { color: '#9ca3af', fontSize: '11px', margin: '0 0 6px' });
      listEl.appendChild(empty);
      return;
    }
    let total = 0;
    products.forEach(p => {
      const subtotal = p.unit_price * p.quantity;
      total += subtotal;
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: '11px', borderBottom: '1px solid #f3f4f6' });
      const info = document.createElement('span');
      info.textContent = `${p.name} × ${p.quantity}`;
      Object.assign(info.style, { color: '#374151', flex: '1' });
      const price = document.createElement('span');
      price.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
      Object.assign(price.style, { color: '#111827', fontWeight: '600', marginRight: '6px' });
      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      Object.assign(delBtn.style, { background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '14px', padding: '0', lineHeight: '1' });
      delBtn.onclick = async () => {
        delBtn.disabled = true;
        try {
          await sendToBackground({ type: 'DELETE_TICKET_PRODUCT', productId: p.id });
          await reloadProducts();
        } catch (e) { delBtn.disabled = false; alert('Erro ao remover: ' + e.message); }
      };
      row.appendChild(info); row.appendChild(price); row.appendChild(delBtn);
      listEl.appendChild(row);
    });
    totalEl.textContent = `Total: R$ ${total.toFixed(2).replace('.', ',')}`;
  }

  await reloadProducts().catch(() => {});

  // Formulário de adição
  const addBtn = styledBtn('+ Adicionar produto', false);
  wrap.appendChild(addBtn);

  const formEl = document.createElement('div');
  formEl.style.display = 'none';
  Object.assign(formEl.style, { marginTop: '8px' });
  wrap.appendChild(formEl);

  addBtn.addEventListener('click', async () => {
    if (formEl.style.display !== 'none') { formEl.style.display = 'none'; addBtn.textContent = '+ Adicionar produto'; return; }
    formEl.textContent = '';
    formEl.style.display = 'block';
    addBtn.textContent = '✕ Fechar';

    const catalogResp = await sendToBackground({ type: 'GET_CATALOG_PRODUCTS' }).catch(() => ({ products: [] }));
    const catalog = catalogResp.products || [];

    const prodSelect = styledSelect([{ value: '', label: 'Selecione um produto...' }, ...catalog.map(p => ({ value: p.id, label: `${p.name} — R$ ${parseFloat(p.base_price).toFixed(2).replace('.', ',')}` }))]);
    formEl.appendChild(prodSelect);

    const priceInput = styledInput('Preço unitário', '');
    Object.assign(priceInput.style, { marginTop: '6px', marginBottom: '6px' });
    formEl.appendChild(priceInput);

    const qtyInput = styledInput('Quantidade', '1');
    Object.assign(qtyInput.style, { marginBottom: '6px' });
    formEl.appendChild(qtyInput);

    prodSelect.addEventListener('change', () => {
      const sel = catalog.find(p => p.id === prodSelect.value);
      if (sel) priceInput.value = parseFloat(sel.base_price).toFixed(2);
    });

    const saveBtn = styledBtn('Salvar produto', true);
    formEl.appendChild(saveBtn);

    saveBtn.addEventListener('click', async () => {
      const selected = catalog.find(p => p.id === prodSelect.value);
      const name = selected?.name || prodSelect.options[prodSelect.selectedIndex]?.text || '';
      const unitPrice = parseFloat(priceInput.value);
      const quantity = parseInt(qtyInput.value, 10) || 1;
      if (!name || !unitPrice) { alert('Selecione um produto e informe o preço.'); return; }
      saveBtn.disabled = true; saveBtn.textContent = 'Salvando...';
      try {
        await sendToBackground({ type: 'SAVE_TICKET_PRODUCT', ticketId: ticket.id, productId: selected?.id || null, name, unitPrice, quantity });
        formEl.style.display = 'none';
        addBtn.textContent = '+ Adicionar produto';
        await reloadProducts();
      } catch (e) {
        saveBtn.disabled = false; saveBtn.textContent = 'Salvar produto';
        alert('Erro: ' + e.message);
      }
    });
  });
}
```

- [ ] **Commit**

```bash
git add livecrm-extension/content_script.js
git commit -m "feat(extension): seção produtos na sidebar com catálogo, preço editável e total"
```

---

## Task 7: CRM Frontend — Seção Produtos no TicketDetailDialog

**Files:**
- Modify: `src/components/tickets/TicketDetailDialog.tsx`

- [ ] **Adicionar hook `useTicketProducts`** — localizar os outros hooks de cliente (~linha 133) e adicionar logo após `useClientProfile`:

```typescript
function useTicketProducts(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-products", ticketId], enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_products")
        .select("id, name, unit_price, quantity, created_at")
        .eq("ticket_id", ticketId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

- [ ] **Instanciar o hook no componente** — localizar `const { data: clientProfile } = useClientProfile(enabledClientId);` (~linha 464) e adicionar abaixo:

```typescript
const { data: ticketProducts } = useTicketProducts(open ? ticket?.id : undefined);
```

- [ ] **Adicionar seção Produtos na aba de informações** — localizar a seção `{clientProfile && (` (~linha 1592) e adicionar bloco de produtos logo após, dentro da mesma aba:

```typescript
{ticketProducts && ticketProducts.length > 0 && (
  <div className="mt-4 border-t pt-4">
    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Produtos</div>
    <div className="space-y-1">
      {ticketProducts.map(p => (
        <div key={p.id} className="flex justify-between text-sm">
          <span className="text-muted-foreground">{p.name} × {p.quantity}</span>
          <span className="font-medium">R$ {(p.unit_price * p.quantity).toFixed(2).replace('.', ',')}</span>
        </div>
      ))}
      <div className="flex justify-between text-sm font-bold border-t pt-1 mt-1">
        <span>Total</span>
        <span>R$ {ticketProducts.reduce((s, p) => s + p.unit_price * p.quantity, 0).toFixed(2).replace('.', ',')}</span>
      </div>
    </div>
  </div>
)}
```

- [ ] **Commit**

```bash
git add src/components/tickets/TicketDetailDialog.tsx
git commit -m "feat(crm): seção produtos read-only no dialog do card"
```

---

## Task 8: Deploy e Verificação

- [ ] **Push para o repositório**

```bash
git push origin main
```

- [ ] **Deploy na VPS**

```bash
# Na VPS:
cd /opt/posvenda && bash deploy.sh
```

- [ ] **Recarregar extensão** — `chrome://extensions` → Recarregar LiveCRM WhatsApp → F5 no WA Web

- [ ] **Testar Feature 1** — Abrir sidebar em qualquer conversa → select de etapa carrega → trocar etapa → "✓ Movido" aparece → verificar no CRM que a etapa mudou

- [ ] **Testar Feature 2** — Abrir sidebar → "Salvar mensagens no histórico" → selecionar textos e áudios → salvar → verificar no histórico técnico do card no CRM

- [ ] **Testar Feature 3** — Abrir sidebar → seção Produtos → "+ Adicionar produto" → selecionar do catálogo → salvar → total atualiza → verificar no dialog do CRM
