// Globals disponíveis: supabase (de supabase-umd.js), SUPABASE_URL, SUPABASE_ANON_KEY (de config.js)

console.log('[LiveCRM CS] content_script carregado, readyState:', document.readyState);

const processedIds = new Set();
let activeObserver = null;

function isContextAlive() {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

function stopObserverIfOrphaned() {
  if (!isContextAlive()) {
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
      console.warn('[LiveCRM CS] contexto invalidado — observer desconectado. Recarregue a aba do WA Web.');
    }
    return true;
  }
  return false;
}

// ── Lê o telefone ativo via background (chrome.scripting no mundo principal) ──
async function getPhoneFromBackground() {
  let resolved = false;
  return Promise.race([
    new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_ACTIVE_PHONE' }, resp => {
          resolved = true;
          if (chrome.runtime.lastError) {
            console.warn('[LiveCRM CS] lastError GET_ACTIVE_PHONE:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          resolve(resp?.phone || null);
        });
      } catch (e) {
        console.warn('[LiveCRM CS] sendMessage falhou:', e.message);
        resolved = true;
        resolve(null);
      }
    }),
    new Promise(resolve => setTimeout(() => {
      if (!resolved) console.warn('[LiveCRM CS] GET_ACTIVE_PHONE timeout 5s — SW não respondeu');
      resolve(null);
    }, 5000)),
  ]);
}

// ── Aguarda elemento aparecer no DOM ─────────────────────────────────────────

function waitForEl(selector, timeout = 60000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) { obs.disconnect(); resolve(found); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
  });
}

function snapshotExisting() {
  const found = document.querySelectorAll('[data-id]');
  console.log('[LiveCRM CS] snapshot:', found.length, 'elementos [data-id] existentes');
  found.forEach(el => processedIds.add(el.getAttribute('data-id')));
}

// ── Upload de áudio para Supabase Storage ─────────────────────────────────────

async function uploadAudio(blobUrl, instanceId, phone) {
  const response = await fetch(blobUrl);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const filename = `${Date.now()}.ogg`;
  const path = `${instanceId}/${phone}/${filename}`;

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

// ── Telefone da conversa ativa ────────────────────────────────────────────────

function getActiveChatPhone() {
  // 0. wa_hook.js (MAIN world) rastreia via React fiber e anota em data-livecrm-phone
  const main = document.getElementById('main') || document.querySelector('#main');
  const hookedPhone = main?.getAttribute('data-livecrm-phone');
  if (hookedPhone) return hookedPhone;

  // 1. Sidebar: item selecionado — tenta múltiplos seletores
  const sidebarSelectors = [
    '[role="listitem"][aria-selected="true"]',
    '[data-testid="cell-frame-container"][aria-selected="true"]',
    '[tabindex="-1"][aria-selected="true"]',
    '[aria-selected="true"]',
    '[aria-current="true"]',
  ];
  for (const sel of sidebarSelectors) {
    for (const el of document.querySelectorAll(sel)) {
      const raw = el.getAttribute('data-id') || el.dataset?.id || '';
      if (raw.includes('@c.us')) return raw.replace(/@c\.us.*/, '');
      if (raw.includes('@s.whatsapp.net')) return raw.replace(/@s\.whatsapp\.net.*/, '');
      // JID pode estar num filho direto
      const child = el.querySelector('[data-id*="@c.us"]');
      if (child) return child.getAttribute('data-id').replace(/@c\.us.*/, '');
    }
  }

  // 2. Header principal: qualquer atributo (data-jid, title, aria-label) contendo JID
  const headerEl = document.querySelector('#main header, [data-testid="conversation-header"]');
  if (headerEl) {
    for (const el of headerEl.querySelectorAll('*')) {
      for (const attr of ['data-jid', 'title', 'aria-label']) {
        const val = el.getAttribute(attr) || '';
        if (val.includes('@c.us')) return val.replace(/@c\.us.*/, '');
        if (val.includes('@s.whatsapp.net')) return val.replace(/@s\.whatsapp\.net.*/, '');
      }
      // Texto puro que parece número de telefone
      const text = el.childElementCount === 0 ? (el.textContent || '').trim() : '';
      const digits = text.replace(/[\s\(\)\-\+]/g, '');
      if (digits.length >= 10 && digits.length <= 15 && /^\d+$/.test(digits)) return digits;
    }
  }

  // 3. Varredura global por data-jid contendo @c.us
  const withJid = document.querySelector('[data-jid*="@c.us"]');
  if (withJid) return (withJid.getAttribute('data-jid') || '').replace(/@c\.us.*/, '');

  // 3b. Varredura global por data-id contendo @c.us (mensagens formato antigo ainda visíveis)
  const withJidDataId = document.querySelector('[data-id*="@c.us"], [data-id*="@s.whatsapp.net"]');
  if (withJidDataId) {
    const v = withJidDataId.getAttribute('data-id') || '';
    if (v.includes('@c.us')) return v.replace(/@c\.us.*/, '');
    return v.replace(/@s\.whatsapp\.net.*/, '');
  }

  // 4. URL — algumas versões do WA Web codificam o JID no hash ou query
  const phoneMatch = window.location.href.match(/[?&/](\d{10,15})(?:@|$|&|#)/);
  if (phoneMatch) return phoneMatch[1];

  // 5. WA Web 2026: varre todos os elementos de #main procurando JID em qualquer atributo data-*
  const mainEl = document.getElementById('main') || document.querySelector('#main, [data-testid="conversation-panel-body"]');
  if (mainEl) {
    for (const el of mainEl.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        const v = attr.value;
        if (v.includes('@c.us')) return v.replace(/@c\.us.*/, '');
        if (v.includes('@s.whatsapp.net')) return v.replace(/@s\.whatsapp\.net.*/, '');
      }
    }
  }

  // Dump diagnóstico para identificar seletores corretos na próxima iteração
  const headerHtml = document.querySelector('[data-testid="conversation-header"], #main header')
    ?.outerHTML?.substring(0, 600) || 'não encontrado';
  const ariaSelected = [...document.querySelectorAll('[aria-selected]')]
    .map(e => `${e.tagName}|data-id=${(e.getAttribute('data-id') || '').substring(0, 30)}|sel=${e.getAttribute('aria-selected')}`)
    .join(' | ');
  const mainAttrs = mainEl
    ? [...mainEl.querySelectorAll('[data-id],[data-jid]')].slice(0, 5)
        .map(e => `${e.tagName}[data-id=${(e.getAttribute('data-id') || '').substring(0, 20)}]`)
        .join(' | ')
    : 'sem #main';
  console.warn('[LiveCRM CS] getActiveChatPhone falhou.',
    '\n  [aria-selected]:', ariaSelected || 'nenhum',
    '\n  #main [data-id/jid]:', mainAttrs,
    '\n  header HTML:', headerHtml,
  );

  return null;
}

// Sobe pelos ancestrais do elemento de mensagem procurando um JID no data-id / data-jid
function getPhoneFromAncestors(el) {
  let node = el.parentElement;
  while (node && node !== document.body) {
    for (const attr of ['data-id', 'data-jid']) {
      const val = node.getAttribute(attr) || '';
      if (val.includes('@c.us')) return val.replace(/@c\.us.*/, '');
      if (val.includes('@s.whatsapp.net')) return val.replace(/@s\.whatsapp\.net.*/, '');
    }
    node = node.parentElement;
  }
  return null;
}

// ── Direção da mensagem ───────────────────────────────────────────────────────

function isOutboundMessage(el) {
  return !!(
    el.querySelector('[data-testid="msg-dblcheck"], [data-testid="msg-check"]') ||
    el.querySelector('[data-icon="msg-dblcheck"], [data-icon="msg-check"]') ||
    el.closest('[class*="message-out"]') ||
    el.querySelector('[class*="message-out"]') ||
    el.querySelector('[class*="msg-out"]')
  );
}

// ── Processar nó de mensagem ──────────────────────────────────────────────────

async function processNode(node) {
  const el = node.matches?.('[data-id]') ? node : node.querySelector?.('[data-id]');
  if (!el) return;

  const dataId = el.getAttribute('data-id');
  if (!dataId || processedIds.has(dataId)) return;
  processedIds.add(dataId);

  console.log('[LiveCRM CS] data-id encontrado:', dataId);

  let phone, waMessageId;

  if (dataId.includes('_')) {
    // ── Formato antigo: "false_5511999999999@c.us_ABCDEF"
    const underscoreIdx = dataId.indexOf('_');
    const secondUnderscore = dataId.indexOf('_', underscoreIdx + 1);
    const direction = dataId.substring(0, underscoreIdx);
    const jid = dataId.substring(underscoreIdx + 1, secondUnderscore);

    if (direction === 'true') return; // outbound
    if (!jid.includes('@c.us')) {
      console.log('[LiveCRM CS] grupo ignorado:', jid);
      return;
    }
    phone = jid.replace('@c.us', '');
    waMessageId = dataId;
  } else {
    // ── Formato novo: apenas ID da mensagem ("3EB08094CFF84F59678488")
    if (isOutboundMessage(el)) {
      console.log('[LiveCRM CS] mensagem outbound, ignorando');
      return;
    }
    waMessageId = dataId;
    // Tenta subir pelo DOM antes de varrer o header
    phone = getPhoneFromAncestors(el) || getActiveChatPhone();
    if (!phone) {
      // Último recurso: pede ao background para ler o React fiber via chrome.scripting
      phone = await getPhoneFromBackground();
    }
    if (!phone) {
      console.warn('[LiveCRM CS] não encontrou telefone da conversa ativa');
      return;
    }
  }

  console.log('[LiveCRM CS] mensagem inbound de:', phone);

  const statusResp = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, resp => {
      if (chrome.runtime.lastError) {
        console.warn('[LiveCRM CS] GET_STATUS erro:', chrome.runtime.lastError.message);
        resolve(null);
      } else {
        resolve(resp);
      }
    })
  );
  console.log('[LiveCRM CS] GET_STATUS resp:', JSON.stringify(statusResp));
  const instanceId = statusResp?.instanceId;
  if (!instanceId) {
    console.warn('[LiveCRM CS] background não conectado ainda, mensagem ignorada');
    return;
  }

  // ── Áudio / voz ──
  // WA Web 2026: áudio pode não ter blob: ainda carregado — detecta pela estrutura
  // Usa audio[src] para evitar false-positives com <audio> vazios no DOM
  const audioEl = el.querySelector('audio[src]') ||
    el.querySelector('[data-testid*="audio"], [data-testid*="ptt"], [data-icon="ptt"], [data-icon="audio-play"]') ||
    el.querySelector('[aria-label*="audio"], [aria-label*="áudio"], [aria-label*="voz"]');
  if (audioEl) {
    const blobAudio = el.querySelector('audio[src^="blob:"]');
    if (blobAudio?.src) {
      console.log('[LiveCRM CS] áudio (blob) detectado, fazendo upload...');
      try {
        const mediaUrl = await uploadAudio(blobAudio.src, instanceId, phone);
        chrome.runtime.sendMessage({
          type: 'INBOUND_MESSAGE',
          data: { phone, text: '🎵 Áudio', mediaUrl, mimetype: 'audio/ogg', waMessageId },
        });
      } catch {
        chrome.runtime.sendMessage({
          type: 'INBOUND_MESSAGE',
          data: { phone, text: '🎵 Áudio', waMessageId },
        });
      }
    } else {
      console.log('[LiveCRM CS] áudio detectado (sem blob)');
      chrome.runtime.sendMessage({
        type: 'INBOUND_MESSAGE',
        data: { phone, text: '🎵 Áudio', waMessageId },
      });
    }
    return;
  }

  // ── Imagem ──
  const imgEl = el.querySelector('img[src^="blob:"]');
  if (imgEl) {
    console.log('[LiveCRM CS] imagem detectada');
    chrome.runtime.sendMessage({
      type: 'INBOUND_MESSAGE',
      data: { phone, text: '📷 Imagem', waMessageId },
    });
    return;
  }

  // ── Vídeo ──
  const videoEl = el.querySelector('video') ||
    el.querySelector('[data-testid*="video"], [data-icon="video"]');
  if (videoEl) {
    console.log('[LiveCRM CS] vídeo detectado');
    chrome.runtime.sendMessage({
      type: 'INBOUND_MESSAGE',
      data: { phone, text: '🎥 Vídeo', waMessageId },
    });
    return;
  }

  // ── Documento ──
  const docEl = el.querySelector('[data-testid="document-thumb"], [data-icon="document"], [class*="document"]');
  if (docEl) {
    console.log('[LiveCRM CS] documento detectado');
    chrome.runtime.sendMessage({
      type: 'INBOUND_MESSAGE',
      data: { phone, text: '📎 Arquivo', waMessageId },
    });
    return;
  }

  // ── Texto ──
  // WA Web 2026 usa atomic CSS — seleciona por atributos estruturais, não por classes
  const textEl =
    el.querySelector('span.selectable-text') ||
    el.querySelector('.copyable-text') ||
    el.querySelector('[class*="selectable"]') ||
    el.querySelector('span[dir="ltr"]') ||
    el.querySelector('span[dir="auto"]') ||
    el.querySelector('span[dir="rtl"]') ||
    el.querySelector('[data-pre-plain-text] span') ||
    el.querySelector('[data-pre-plain-text]');

  let text = textEl?.innerText?.trim() || textEl?.textContent?.trim();

  // Fallback: pega o primeiro span com dir attribute e conteúdo real
  if (!text) {
    for (const span of el.querySelectorAll('span[dir]')) {
      const t = span.innerText?.trim() || span.textContent?.trim();
      if (t && t.length > 0) { text = t; break; }
    }
  }

  // Fallback final: qualquer texto visível no nó excluindo timestamps
  if (!text) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-testid*="msg-meta"], [data-testid*="status"], [class*="tail"]').forEach(n => n.remove());
    const raw = clone.innerText?.trim() || clone.textContent?.trim();
    if (raw && raw.length > 0 && raw.length < 4000) text = raw;
  }

  // Descarta se o "texto" é só um horário (artefato de áudio/vídeo do WA Web)
  if (text && /^\d{1,2}:\d{2}(\s*[AP]M)?$/.test(text.trim())) text = null;

  if (text) {
    console.log('[LiveCRM CS] texto:', text.substring(0, 50));
    if (!isContextAlive()) { stopObserverIfOrphaned(); return; }
    console.log('[LiveCRM CS] enviando INBOUND_MESSAGE ao SW...');
    chrome.runtime.sendMessage({ type: 'INBOUND_MESSAGE', data: { phone, text, waMessageId } });
  } else {
    console.log('[LiveCRM CS] nó sem conteúdo legível, ignorando. HTML:', el.innerHTML.substring(0, 100));
  }
}

// ── MutationObserver ──────────────────────────────────────────────────────────

function startObserver() {
  snapshotExisting();
  console.log('[LiveCRM CS] MutationObserver iniciado em document.body');

  activeObserver = new MutationObserver((mutations) => {
    if (stopObserverIfOrphaned()) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;

        // Debug: loga qualquer nó com data-id ou que contenha data-id
        const hasDataId = node.hasAttribute?.('data-id') || node.querySelector?.('[data-id]');
        if (hasDataId) {
          const ids = [
            node.getAttribute?.('data-id'),
            ...[...node.querySelectorAll?.('[data-id]') || []].map(el => el.getAttribute('data-id'))
          ].filter(Boolean);
          console.log('[LiveCRM CS] nó com data-id detectado:', ids);
        }

        processNode(node).catch(console.error);
        node.querySelectorAll?.('[data-id]').forEach(child => {
          processNode(child).catch(console.error);
        });
      }
    }
  });

  activeObserver.observe(document.body, { childList: true, subtree: true });
}

// ── Inject Send ───────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Insere texto no contenteditable Lexical do WA Web 2026.
// execCommand sozinho não funciona — o Lexical reverte via EditorState reconciliation.
// Usar beforeinput insertFromPaste → Lexical processa e atualiza EditorState → sem revert.
async function insertTextReact(el, text) {
  el.focus();
  await sleep(50);

  // Seleciona todo o conteúdo existente via Selection API
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  // Primary: beforeinput insertFromPaste — o Lexical trata este evento nativamente
  // e atualiza o EditorState, prevenindo que a reconciliação reverta a mudança
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  el.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertFromPaste',
    dataTransfer: dt,
    bubbles: true,
    cancelable: true,
  }));
  await sleep(150);

  // Fallback: se o Lexical não processou o evento, usa execCommand
  if (el.textContent?.trim() !== text.trim()) {
    console.warn('[LiveCRM CS] insertFromPaste não atualizou DOM, fallback execCommand');
    document.execCommand('insertText', false, text);
  }
}

const COMPOSE_SEL = [
  '[data-testid="conversation-compose-box-input"]',
  'div[contenteditable="true"][data-tab="10"]',
  '#main div[contenteditable="true"]',
].join(', ');

async function injectSend({ sendId, phone, message }) {
  console.log('[LiveCRM CS] ▶ INJECT_SEND start', { sendId, phone, msg: message?.substring(0, 30) });
  try {
    const targetDigits = phone.replace(/\D/g, '').slice(-9);

    // ── Passo 1: navega para a conversa se necessário ─────────────────────────
    const currentPhone = getActiveChatPhone();
    const alreadyHere = currentPhone && currentPhone.replace(/\D/g, '').slice(-9) === targetDigits;
    console.log('[LiveCRM CS] INJECT_SEND: currentPhone=', currentPhone, '| alreadyHere=', alreadyHere);

    if (!alreadyHere) {
      // Fast path: contato visível na lista → click direto
      const inList = [...document.querySelectorAll('[data-testid="cell-frame-container"]')]
        .find(el => el.textContent?.replace(/\D/g, '').includes(targetDigits));

      if (inList) {
        console.log('[LiveCRM CS] INJECT_SEND: contato na lista → click direto');
        inList.click();
      } else {
        // Navegação SPA via history.pushState — wa_hook.js processa no MAIN world
        console.log('[LiveCRM CS] INJECT_SEND: LIVECRM_OPEN_PHONE →', phone);
        window.postMessage({ type: 'LIVECRM_OPEN_PHONE', phone }, '*');
      }

      // Aguarda WA Web processar a navegação antes de buscar o compose
      await sleep(2000);
    }

    // ── Passo 2: aguarda compose input ────────────────────────────────────────
    const composeInput = document.querySelector(COMPOSE_SEL) ||
      await waitForEl(COMPOSE_SEL, 15000);

    if (!composeInput) {
      const ceNow = [...document.querySelectorAll('[contenteditable="true"]')]
        .map(e => `[tab=${e.getAttribute('data-tab')}|testid=${e.getAttribute('data-testid')}]`).join(' ');
      throw new Error('Compose input não encontrado para ' + phone + '. contenteditable: ' + ceNow);
    }
    console.log('[LiveCRM CS] INJECT_SEND: compose [tab=', composeInput.getAttribute('data-tab'),
      '|testid=', composeInput.getAttribute('data-testid'), ']');

    // ── Passo 3: insere mensagem e envia ──────────────────────────────────────
    await insertTextReact(composeInput, message);
    await sleep(600);
    console.log('[LiveCRM CS] INJECT_SEND: compose texto:', JSON.stringify(composeInput.textContent?.substring(0, 40)));
    composeInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
    }));
    await sleep(400);

    console.log('[LiveCRM CS] ✅ INJECT_SEND: enviado para', phone);
    try { if (chrome.runtime?.id) chrome.runtime.sendMessage({ type: 'SEND_CONFIRMED', sendId }); } catch { /* context invalidado */ }
  } catch (e) {
    console.error('[LiveCRM CS] ❌ INJECT_SEND failed:', e.message);
    try { if (chrome.runtime?.id) chrome.runtime.sendMessage({ type: 'SEND_FAILED', sendId, error: e.message }); } catch { /* context invalidado */ }
  }
}

// ── Fila de envios: processa um de cada vez ───────────────────────────────────
const sendQueue = [];
let isSending = false;

async function drainSendQueue() {
  console.log('[LiveCRM CS] drainSendQueue: isSending=', isSending, '| fila=', sendQueue.length);
  if (isSending) {
    console.warn('[LiveCRM CS] drainSendQueue: envio em curso, job aguarda na fila');
    return;
  }
  isSending = true;
  try {
    while (sendQueue.length > 0) {
      const job = sendQueue.shift();
      await injectSend(job);
      await sleep(600);
    }
  } finally {
    isSending = false;
    console.log('[LiveCRM CS] drainSendQueue: concluído');
  }
}

// ── Listeners ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'INJECT_SEND') {
    sendQueue.push(msg);
    drainSendQueue().catch(console.error);
    sendResponse({ queued: true }); // Responde imediatamente para evitar "message port closed"
  }

  // Relay de navegação vindo do background → wa_hook.js (MAIN world)
  if (msg.type === 'LIVECRM_OPEN_PHONE') {
    window.postMessage({ type: 'LIVECRM_OPEN_PHONE', phone: msg.phone }, '*');
    sendResponse({ ok: true });
  }

  if (msg.type === 'SUGGESTION_PENDING') {
    if (msg.phone === sidebarCurrentPhone) {
      currentSuggestionPhone = msg.phone;
      currentSuggestionState = 'pending';
      currentSuggestionText = '';
      renderSuggestionPanel();
    }
  }

  if (msg.type === 'SUGGESTION_READY') {
    if (msg.phone === sidebarCurrentPhone) {
      currentSuggestionState = 'done';
      currentSuggestionText = msg.text ?? '';
      renderSuggestionPanel();
    }
  }

  if (msg.type === 'SUGGESTION_ERROR' || msg.type === 'SUGGESTION_TIMEOUT') {
    if (msg.phone === sidebarCurrentPhone) {
      currentSuggestionState = msg.type === 'SUGGESTION_ERROR' ? 'error' : 'timeout';
      currentSuggestionText = '';
      renderSuggestionPanel();
    }
  }
});

// ── Recebe mensagens do wa_hook.js (roda no MAIN world) ──────────────────────
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) return;

  if (event.data.type === 'LIVECRM_INBOUND') {
    const { phone, text, msgId } = event.data;
    if (!phone || !msgId) return;
    if (processedIds.has(msgId)) return;
    processedIds.add(msgId);

    console.log('[LiveCRM CS] wa_hook: mensagem de', phone, 'texto:', (text || '').substring(0, 40));
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage({
        type: 'INBOUND_MESSAGE',
        data: { phone, text, waMessageId: msgId },
      });
    } catch { /* context invalidado — aba do WA Web precisa de F5 */ }
  } else if (event.data.type === 'LIVECRM_OUTBOUND') {
    const { phone, text, msgId } = event.data;
    if (!phone || !msgId) return;
    const dedupKey = 'out_' + msgId;
    if (processedIds.has(dedupKey)) return;
    processedIds.add(dedupKey);

    console.log('[LiveCRM CS] wa_hook: outbound para', phone, 'texto:', (text || '').substring(0, 40));
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage({
        type: 'OUTBOUND_MESSAGE',
        data: { phone, text, waMessageId: msgId },
      });
    } catch { /* context invalidado */ }
  }
});

// ── Heartbeat: acorda o SW a cada 10s para processar envios pendentes ────────
setInterval(() => {
  try {
    if (!chrome.runtime?.id) return; // context invalidado após reload da extensão
    chrome.runtime.sendMessage({ type: 'HEARTBEAT' }, () => {
      void chrome.runtime.lastError; // suprime erro se SW não respondeu
    });
  } catch { /* context invalidado — aba do WA Web precisa de F5 */ }
}, 10000);

// ── Aguarda WA Web carregar antes de iniciar ──────────────────────────────────

async function main() {
  // WA Web carrega de forma assíncrona — aguarda o app principal aparecer
  console.log('[LiveCRM CS] aguardando WA Web carregar...');
  const app = await waitForEl('#app, [data-testid="conversation-panel-messages"], #main, [tabindex="-1"][role="application"]');
  if (!app) {
    console.warn('[LiveCRM CS] WA Web não carregou em 60s, iniciando observer mesmo assim');
  } else {
    console.log('[LiveCRM CS] WA Web pronto:', app.tagName, app.id || app.className?.substring(0, 40));
  }
  startObserver();
  injectSidebar();
  startSidebarWatcher();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

// ── Sidebar LiveCRM ───────────────────────────────────────────────────────────

function mkEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function injectSidebar() {
  if (document.getElementById('livecrm-toggle')) return;
  console.log('[LiveCRM CS] injectSidebar: criando botão CRM...');

  const toggle = document.createElement('button');
  toggle.id = 'livecrm-toggle';
  toggle.textContent = 'CRM';
  Object.assign(toggle.style, {
    position: 'fixed',
    bottom: '80px',
    right: '0',
    zIndex: '2147483647',
    background: '#075e54',
    color: '#fff',
    border: 'none',
    borderRadius: '8px 0 0 8px',
    padding: '10px 8px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    writingMode: 'vertical-rl',
    letterSpacing: '1px',
    boxShadow: '-2px 0 8px rgba(0,0,0,.25)',
    fontFamily: 'sans-serif',
    lineHeight: '1.2',
  });
  document.documentElement.appendChild(toggle);
  console.log('[LiveCRM CS] botão CRM criado, position:', toggle.style.position, 'zIndex:', toggle.style.zIndex);

  const panel = document.createElement('div');
  panel.id = 'livecrm-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    width: '280px',
    height: '100vh',
    zIndex: '2147483646',
    background: '#fff',
    borderLeft: '1px solid #e5e7eb',
    boxShadow: '-4px 0 16px rgba(0,0,0,.12)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    fontSize: '13px',
    transform: 'translateX(100%)',
    transition: 'transform .2s ease',
    boxSizing: 'border-box',
  });

  const hdr = document.createElement('div');
  hdr.id = 'livecrm-panel-header';
  Object.assign(hdr.style, {
    background: '#075e54',
    color: '#fff',
    padding: '14px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: '700',
    fontSize: '14px',
    flexShrink: '0',
  });
  const hdrTitle = document.createElement('span');
  hdrTitle.textContent = 'LiveCRM';
  const closeBtn = document.createElement('button');
  closeBtn.id = 'livecrm-close';
  closeBtn.title = 'Fechar';
  closeBtn.textContent = '✕';
  Object.assign(closeBtn.style, {
    background: 'none',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '0',
    lineHeight: '1',
    opacity: '.8',
  });
  hdr.appendChild(hdrTitle);
  hdr.appendChild(closeBtn);

  const body = document.createElement('div');
  body.id = 'livecrm-panel-body';
  Object.assign(body.style, {
    flex: '1',
    overflowY: 'auto',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  });

  panel.appendChild(hdr);
  panel.appendChild(body);
  document.documentElement.appendChild(panel);

  toggle.addEventListener('click', async () => {
    const isOpen = panel.style.transform === 'translateX(0px)' || panel.style.transform === 'translateX(0)';
    panel.style.transform = isOpen ? 'translateX(100%)' : 'translateX(0)';
    if (!isOpen) {
      sidebarCurrentPhone = null;
      const phone = await getPhoneFromBackground();
      sidebarCurrentPhone = phone;
      refreshSidebar(phone);
    }
  });
  closeBtn.addEventListener('click', () => { panel.style.transform = 'translateX(100%)'; });
}

function sidebarMsg(text, isError) {
  const body = document.getElementById('livecrm-panel-body');
  if (!body) return;
  body.textContent = '';
  const p = mkEl('p', 'lcrm-msg' + (isError ? ' error' : ''), text);
  body.appendChild(p);
}

function extractVisibleMessages() {
  const msgs = [];
  document.querySelectorAll('[data-id]').forEach(node => {
    const isOut = !!node.querySelector('[class*="message-out"]');

    const textEl = node.querySelector('[class*="selectable-text"]') || node.querySelector('span[dir]');
    const text = textEl?.textContent?.trim();
    if (text) {
      msgs.push({ type: 'text', direction: isOut ? 'outbound' : 'inbound', text });
      return;
    }

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

function sendToBackground(msg) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(msg, resp => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (resp?.error) return reject(new Error(resp.error));
        resolve(resp);
      });
    } catch (e) { reject(e); }
  });
}

// Strings de status do WA Web que não são nomes de contato
const WA_STATUS_PATTERNS = [
  /^\s*online\s*$/i, /^\s*offline\s*$/i,
  /^\s*(última vez|last seen)/i,
  /^\s*(digitando|typing)/i,
  /^\s*(gravando|recording)/i,
  /^\s*clique/i, /^\s*click/i,
  /^\+\d/,          // "+55 11..." (números de grupo)
  /^\s*conta comercial\s*$/i,
  /^\s*business account\s*$/i,
  /^\s*verified business\s*$/i,
  /^\s*conta de negócios\s*$/i,
];

function isStatusString(s) {
  if (!s) return true;
  const clean = s.replace(/\s+/g, ' ').trim();
  return WA_STATUS_PATTERNS.some(p => p.test(clean));
}

function getContactName() {
  const header = document.querySelector(
    'header[data-testid="conversation-header"], #main header, [data-testid="conversation-panel-body"] header'
  );
  if (!header) return null;

  // Tenta seletor específico do WA Web 2024-2026
  const titleEl = header.querySelector(
    '[data-testid="conversation-info-header-chat-title"], [data-testid="conversation-header-title"]'
  );
  const spans = titleEl ? Array.from(titleEl.querySelectorAll('span[dir="auto"]')) : [];

  // Candidatos em ordem de especificidade
  const candidates = [
    spans[0],
    titleEl,
    // WA Web coloca o nome como atributo title em spans — mais confiável que text
    header.querySelector('span[title]:not([title=""])'),
    header.querySelector('span[dir="auto"]'),
    header.querySelector('._amig'),
    header.querySelector('h1, h2'),
  ];

  for (const el of candidates) {
    if (!el) continue;
    // Prefere o atributo title (evita concatenar spans de emoji)
    const text = (el.getAttribute?.('title') || el.textContent || '').trim();
    if (text && !isStatusString(text)) return text;
  }
  return null;
}

function styledBtn(text, primary) {
  const btn = document.createElement('button');
  btn.textContent = text;
  Object.assign(btn.style, {
    width: '100%', padding: '9px 12px', borderRadius: '6px', cursor: 'pointer',
    fontSize: '12px', fontWeight: '600', textAlign: 'center', boxSizing: 'border-box',
    border: primary ? '1px solid #075e54' : '1px solid #e5e7eb',
    background: primary ? '#075e54' : '#fff',
    color: primary ? '#fff' : '#374151',
    marginTop: '6px', fontFamily: 'inherit',
  });
  btn.onmouseover = () => { btn.style.opacity = '.85'; };
  btn.onmouseout = () => { btn.style.opacity = '1'; };
  return btn;
}

function styledInput(placeholder, value) {
  const el = document.createElement('input');
  el.type = 'text';
  el.placeholder = placeholder;
  if (value) el.value = value;
  Object.assign(el.style, {
    width: '100%', padding: '8px', borderRadius: '6px', boxSizing: 'border-box',
    border: '1px solid #d1d5db', fontSize: '13px', fontFamily: 'inherit', marginTop: '4px',
  });
  return el;
}

function styledSelect(options) {
  const sel = document.createElement('select');
  Object.assign(sel.style, {
    width: '100%', padding: '8px', borderRadius: '6px', boxSizing: 'border-box',
    border: '1px solid #d1d5db', fontSize: '13px', fontFamily: 'inherit', marginTop: '4px',
    background: '#fff',
  });
  options.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    sel.appendChild(opt);
  });
  return sel;
}

function infoRow(label, value) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { marginBottom: '10px' });
  const lbl = document.createElement('div');
  lbl.textContent = label;
  Object.assign(lbl.style, { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.5px', color: '#6b7280', marginBottom: '2px' });
  const val = document.createElement('div');
  val.textContent = value;
  Object.assign(val.style, { fontWeight: '600', color: '#111827', fontSize: '14px' });
  wrap.appendChild(lbl); wrap.appendChild(val);
  return wrap;
}

function badge(text) {
  const el = document.createElement('span');
  el.textContent = text;
  Object.assign(el.style, {
    display: 'inline-block', background: '#d1fae5', color: '#065f46',
    borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: '600',
  });
  return el;
}

function renderSuggestionPanel() {
  const existing = document.getElementById('livecrm-suggestion-panel');
  if (existing) existing.remove();
  if (currentSuggestionState === 'idle') return;

  const body = document.getElementById('livecrm-panel-body');
  if (!body) return;

  const panel = document.createElement('div');
  panel.id = 'livecrm-suggestion-panel';
  Object.assign(panel.style, {
    marginTop: '10px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  });

  const header = document.createElement('div');
  header.textContent = '💬 Sugestão de resposta';
  Object.assign(header.style, {
    fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.5px',
    color: '#6b7280', padding: '6px 10px', background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  });
  panel.appendChild(header);

  const content = document.createElement('div');
  Object.assign(content.style, { padding: '8px 10px' });

  if (currentSuggestionState === 'pending') {
    const spinner = document.createElement('div');
    spinner.textContent = '⟳ Gerando sugestão...';
    Object.assign(spinner.style, { fontSize: '12px', color: '#6b7280', fontStyle: 'italic' });
    content.appendChild(spinner);
  } else if (currentSuggestionState === 'done' && currentSuggestionText) {
    const textEl = document.createElement('p');
    textEl.textContent = currentSuggestionText;
    Object.assign(textEl.style, {
      fontSize: '12px', color: '#111827', margin: '0 0 8px',
      lineHeight: '1.5', wordBreak: 'break-word',
    });
    content.appendChild(textEl);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copiar';
    Object.assign(copyBtn.style, {
      background: '#065f46', color: '#fff', border: 'none', borderRadius: '6px',
      padding: '5px 10px', fontSize: '12px', cursor: 'pointer', width: '100%',
    });
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentSuggestionText);
        copyBtn.textContent = '✓ Copiado!';
        setTimeout(() => { copyBtn.textContent = '📋 Copiar'; }, 2000);
      } catch {
        copyBtn.textContent = 'Erro ao copiar';
      }
    });
    content.appendChild(copyBtn);
  } else if (currentSuggestionState === 'timeout' || currentSuggestionState === 'error') {
    const msg = document.createElement('div');
    msg.textContent = 'Não foi possível gerar sugestão.';
    Object.assign(msg.style, { fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' });
    content.appendChild(msg);
  }

  panel.appendChild(content);
  body.appendChild(panel);
}

function renderSidebarData(phone, { client, ticket, stageLabel, pendingQuotePdf }) {
  const body = document.getElementById('livecrm-panel-body');
  if (!body) return;
  body.textContent = '';

  // Reset sugestão quando muda de conversa
  if (phone !== currentSuggestionPhone) {
    currentSuggestionState = 'idle';
    currentSuggestionText = '';
  }

  const waName = getContactName();
  const validWaName = waName && !isStatusString(waName) && waName !== phone ? waName : null;
  const validDbName = client.name && !isStatusString(client.name) && client.name !== phone ? client.name : null;
  const displayName = validWaName || validDbName;

  // Nome do contato com lápis para edição inline
  const nameWrap = document.createElement('div');
  Object.assign(nameWrap.style, { marginBottom: '10px' });
  const nameLblEl = document.createElement('div');
  nameLblEl.textContent = 'CONTATO';
  Object.assign(nameLblEl.style, { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.5px', color: '#6b7280', marginBottom: '2px' });
  nameWrap.appendChild(nameLblEl);

  const nameRow = document.createElement('div');
  Object.assign(nameRow.style, { display: 'flex', alignItems: 'center', gap: '6px' });

  const nameVal = document.createElement('div');
  nameVal.textContent = displayName || phone;
  Object.assign(nameVal.style, { fontWeight: '600', color: '#111827', fontSize: '14px', flex: '1' });

  const editBtn = document.createElement('button');
  editBtn.title = 'Editar nome';
  editBtn.textContent = '✏';
  Object.assign(editBtn.style, { background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#6b7280', padding: '0', lineHeight: '1', flexShrink: '0' });

  nameRow.appendChild(nameVal);
  nameRow.appendChild(editBtn);
  nameWrap.appendChild(nameRow);

  // Campo de edição (oculto inicialmente)
  const nameEditRow = document.createElement('div');
  nameEditRow.style.display = 'none';
  Object.assign(nameEditRow.style, { display: 'none', gap: '4px', marginTop: '4px' });

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = displayName || '';
  Object.assign(nameInput.style, {
    flex: '1', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db',
    fontSize: '13px', fontFamily: 'inherit',
  });

  const saveNameBtn = document.createElement('button');
  saveNameBtn.textContent = '✓';
  Object.assign(saveNameBtn.style, {
    background: '#065f46', color: '#fff', border: 'none', borderRadius: '4px',
    cursor: 'pointer', padding: '4px 8px', fontSize: '13px', flexShrink: '0',
  });

  const cancelNameBtn = document.createElement('button');
  cancelNameBtn.textContent = '✕';
  Object.assign(cancelNameBtn.style, {
    background: '#6b7280', color: '#fff', border: 'none', borderRadius: '4px',
    cursor: 'pointer', padding: '4px 6px', fontSize: '13px', flexShrink: '0',
  });

  nameEditRow.appendChild(nameInput);
  nameEditRow.appendChild(saveNameBtn);
  nameEditRow.appendChild(cancelNameBtn);
  nameWrap.appendChild(nameEditRow);
  body.appendChild(nameWrap);

  editBtn.addEventListener('click', () => {
    nameRow.style.display = 'none';
    nameEditRow.style.display = 'flex';
    nameInput.focus();
    nameInput.select();
  });

  const cancelEdit = () => {
    nameEditRow.style.display = 'none';
    nameRow.style.display = 'flex';
  };

  cancelNameBtn.addEventListener('click', cancelEdit);

  const saveName = async () => {
    const newName = nameInput.value.trim();
    if (!newName || newName === nameVal.textContent) { cancelEdit(); return; }
    saveNameBtn.disabled = true;
    try {
      await sendToBackground({ type: 'UPDATE_CLIENT_NAME', clientId: client.id, name: newName });
      nameVal.textContent = newName;
      client.name = newName;
      cancelEdit();
    } catch (e) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      saveNameBtn.disabled = false;
    }
  };

  saveNameBtn.addEventListener('click', saveName);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); else if (e.key === 'Escape') cancelEdit(); });

  body.appendChild(infoRow('Telefone', phone));

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

    const openBtn = styledBtn('↗ Abrir no CRM', true);
    openBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_CRM_TICKET', ticketId: ticket.id }, () => void chrome.runtime.lastError);
    });
    body.appendChild(openBtn);
  } else {
    // Cliente existe mas sem ticket — mostra formulário de criação de card
    const noTicket = document.createElement('p');
    noTicket.textContent = 'Sem card ativo. Crie um novo:';
    Object.assign(noTicket.style, { color: '#6b7280', fontSize: '12px', margin: '0 0 8px' });
    body.appendChild(noTicket);

    const pipelineLbl = document.createElement('div');
    pipelineLbl.textContent = 'Funil';
    Object.assign(pipelineLbl.style, { fontSize: '11px', color: '#374151', fontWeight: '600', marginBottom: '2px' });
    body.appendChild(pipelineLbl);

    const pipelineSelect = styledSelect([{ value: '', label: 'Carregando funis...' }]);
    pipelineSelect.style.marginBottom = '10px';
    body.appendChild(pipelineSelect);

    sendToBackground({ type: 'GET_PIPELINES' }).then(resp => {
      pipelineSelect.textContent = '';
      (resp.pipelines || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id; opt.textContent = p.name;
        pipelineSelect.appendChild(opt);
      });
    }).catch(() => {});

    const createCardBtn = styledBtn('+ Criar Card', true);
    createCardBtn.addEventListener('click', async () => {
      const pipelineId = pipelineSelect.value;
      if (!pipelineId) { alert('Selecione um funil'); return; }
      createCardBtn.disabled = true; createCardBtn.textContent = 'Criando...';
      try {
        await sendToBackground({ type: 'CREATE_TICKET', phone, name: displayName || phone, pipelineId });
        sidebarCurrentPhone = null;
        await refreshSidebar(phone);
      } catch (e) {
        createCardBtn.disabled = false; createCardBtn.textContent = '+ Criar Card';
        alert('Erro: ' + e.message);
      }
    });
    body.appendChild(createCardBtn);
  }

  const sep = document.createElement('hr');
  Object.assign(sep.style, { border: 'none', borderTop: '1px solid #e5e7eb', margin: '10px 0' });
  body.appendChild(sep);

  const noteToggle = styledBtn('+ Adicionar nota', false);
  body.appendChild(noteToggle);

  const noteArea = document.createElement('div');
  noteArea.style.display = 'none';
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Escreva uma observação...';
  Object.assign(textarea.style, {
    width: '100%', border: '1px solid #d1d5db', borderRadius: '6px',
    padding: '8px', fontSize: '12px', resize: 'vertical', minHeight: '72px',
    fontFamily: 'inherit', boxSizing: 'border-box', marginTop: '6px',
  });
  const noteSaveBtn = styledBtn('Salvar nota', true);
  noteArea.appendChild(textarea); noteArea.appendChild(noteSaveBtn);
  body.appendChild(noteArea);

  noteToggle.addEventListener('click', () => {
    noteArea.style.display = noteArea.style.display === 'none' ? 'block' : 'none';
  });

  noteSaveBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) return;
    noteSaveBtn.disabled = true; noteSaveBtn.textContent = 'Salvando...';
    try {
      await sendToBackground({ type: 'SAVE_NOTE', ticketId: ticket?.id || null, clientId: client.id, text });
      textarea.value = ''; noteArea.style.display = 'none';
      noteToggle.textContent = '✓ Nota salva';
      setTimeout(() => { noteToggle.textContent = '+ Adicionar nota'; }, 2000);
    } catch (e) { alert('Erro ao salvar nota: ' + e.message); }
    finally { noteSaveBtn.disabled = false; noteSaveBtn.textContent = 'Salvar nota'; }
  });

  // ── Produtos / Negociação ──────────────────────────────────────────────────
  if (ticket) {
    const sep2 = document.createElement('hr');
    Object.assign(sep2.style, { border: 'none', borderTop: '1px solid #e5e7eb', margin: '10px 0' });
    body.appendChild(sep2);
    renderProductsSection(body, ticket, client);
  }

  // ── PDF do Orçamento ──────────────────────────────────────────────────────
  if (pendingQuotePdf) {
    const sep3 = document.createElement('hr');
    Object.assign(sep3.style, { border: 'none', borderTop: '1px solid #e5e7eb', margin: '10px 0' });
    body.appendChild(sep3);

    const pdfLbl = document.createElement('div');
    pdfLbl.textContent = 'ORÇAMENTO AGUARDANDO APROVAÇÃO';
    Object.assign(pdfLbl.style, { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.5px', color: '#6b7280', marginBottom: '6px' });
    body.appendChild(pdfLbl);

    const pdfInfo = document.createElement('div');
    pdfInfo.textContent = '📄 ' + pendingQuotePdf.quoteNumber;
    Object.assign(pdfInfo.style, { fontSize: '12px', color: '#374151', marginBottom: '8px', fontWeight: '600' });
    body.appendChild(pdfInfo);

    const sendPdfBtn = styledBtn('📤 Enviar PDF para conversa', true);
    Object.assign(sendPdfBtn.style, { background: '#1d4ed8', borderColor: '#1d4ed8' });
    body.appendChild(sendPdfBtn);

    const pdfFeedback = document.createElement('div');
    Object.assign(pdfFeedback.style, { fontSize: '11px', minHeight: '16px', marginTop: '4px', textAlign: 'center' });
    body.appendChild(pdfFeedback);

    sendPdfBtn.addEventListener('click', async () => {
      sendPdfBtn.disabled = true;
      sendPdfBtn.textContent = '⟳ Enviando...';
      pdfFeedback.textContent = '';
      pdfFeedback.style.color = '#6b7280';
      try {
        const ok = await sendPdfToWaConversation(
          pendingQuotePdf.pdfUrl,
          pendingQuotePdf.quoteNumber + '.pdf'
        );
        if (ok) {
          sendPdfBtn.textContent = '✓ PDF enviado';
          pdfFeedback.textContent = 'Confirme o envio no WhatsApp.';
          pdfFeedback.style.color = '#065f46';
        } else {
          sendPdfBtn.disabled = false;
          sendPdfBtn.textContent = '📤 Enviar PDF para conversa';
          pdfFeedback.textContent = 'Não foi possível injetar o arquivo. Tente anexar manualmente.';
          pdfFeedback.style.color = '#dc2626';
        }
      } catch (e) {
        sendPdfBtn.disabled = false;
        sendPdfBtn.textContent = '📤 Enviar PDF para conversa';
        pdfFeedback.textContent = 'Erro: ' + e.message;
        pdfFeedback.style.color = '#dc2626';
      }
    });
  }
}

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

async function sendPdfToWaConversation(pdfUrl, fileName) {
  try {
    const resp = await fetch(pdfUrl);
    if (!resp.ok) throw new Error('Falha ao baixar PDF');
    const blob = await resp.blob();
    const file = new File([blob], fileName, { type: 'application/pdf' });

    // Estratégia 1: injetar via DataTransfer no input de arquivo do WA Web
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    // Prefere o input que aceita documentos (accept="*" ou sem restrição de imagem)
    const docInput = fileInputs.find(i => !i.accept.includes('image') && !i.accept.includes('video'))
      || fileInputs[0];

    if (docInput) {
      const dt = new DataTransfer();
      dt.items.add(file);
      Object.defineProperty(docInput, 'files', { value: dt.files, configurable: true });
      docInput.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // Estratégia 2: colar via ClipboardItem (funciona em alguns browsers)
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'application/pdf': blob })]);
      const input = document.querySelector('footer [contenteditable="true"], [data-testid="conversation-compose-box-input"]');
      if (input) { input.focus(); document.execCommand('paste'); return true; }
    }

    return false;
  } catch (e) {
    console.warn('[LiveCRM CS] sendPdfToWaConversation error:', e.message);
    return false;
  }
}

async function renderSidebarNotFound(phone) {
  const body = document.getElementById('livecrm-panel-body');
  if (!body) return;
  body.textContent = '';

  const waName = getContactName();
  body.appendChild(infoRow('Telefone', phone));
  if (waName) body.appendChild(infoRow('Nome no WhatsApp', waName));

  const noCard = document.createElement('p');
  noCard.textContent = 'Sem card no CRM para este contato.';
  Object.assign(noCard.style, { color: '#6b7280', fontSize: '12px', margin: '8px 0' });
  body.appendChild(noCard);

  // Formulário de criação
  const formWrap = document.createElement('div');
  Object.assign(formWrap.style, { borderTop: '1px solid #e5e7eb', paddingTop: '12px', marginTop: '4px' });

  const nameLbl = document.createElement('div');
  nameLbl.textContent = 'Nome do contato';
  Object.assign(nameLbl.style, { fontSize: '11px', color: '#374151', fontWeight: '600', marginBottom: '2px' });
  formWrap.appendChild(nameLbl);
  const nameInput = styledInput('Ex: João Silva', waName || '');
  nameInput.style.marginBottom = '8px';
  formWrap.appendChild(nameInput);

  const pipelineLbl = document.createElement('div');
  pipelineLbl.textContent = 'Funil';
  Object.assign(pipelineLbl.style, { fontSize: '11px', color: '#374151', fontWeight: '600', marginBottom: '2px' });
  formWrap.appendChild(pipelineLbl);

  const pipelineSelect = styledSelect([{ value: '', label: 'Carregando funis...' }]);
  pipelineSelect.style.marginBottom = '10px';
  formWrap.appendChild(pipelineSelect);

  // Carrega pipelines
  sendToBackground({ type: 'GET_PIPELINES' }).then(resp => {
    pipelineSelect.textContent = '';
    (resp.pipelines || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      pipelineSelect.appendChild(opt);
    });
  }).catch(() => {
    pipelineSelect.textContent = '';
    const opt = document.createElement('option'); opt.value = ''; opt.textContent = 'Erro ao carregar';
    pipelineSelect.appendChild(opt);
  });

  const createBtn = styledBtn('+ Criar Card', true);
  createBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim() || phone;
    const pipelineId = pipelineSelect.value;
    if (!pipelineId) { alert('Selecione um funil'); return; }
    createBtn.disabled = true; createBtn.textContent = 'Criando...';
    try {
      await sendToBackground({ type: 'CREATE_TICKET', phone, name, pipelineId });
      await refreshSidebar(phone);
    } catch (e) {
      createBtn.disabled = false; createBtn.textContent = '+ Criar Card';
      alert('Erro ao criar card: ' + e.message);
    }
  });
  formWrap.appendChild(createBtn);
  body.appendChild(formWrap);
}

let sidebarCurrentPhone = null;
let currentSuggestionPhone = null;
let currentSuggestionState = 'idle'; // idle | pending | done | timeout | error
let currentSuggestionText = '';

async function refreshSidebar(phone) {
  if (!phone) { sidebarMsg('Abra uma conversa para ver dados do contato.'); return; }
  sidebarMsg('Carregando...');
  try {
    const resp = await sendToBackground({ type: 'GET_CLIENT_DATA', phone });
    if (!resp?.client) await renderSidebarNotFound(phone);
    else renderSidebarData(phone, resp);
  } catch (e) { sidebarMsg('Erro: ' + e.message, true); }
}

function startSidebarWatcher() {
  setInterval(async () => {
    const panel = document.getElementById('livecrm-panel');
    if (!panel || (panel.style.transform !== 'translateX(0px)' && panel.style.transform !== 'translateX(0)')) return;
    const phone = await getPhoneFromBackground();
    if (phone === sidebarCurrentPhone) return;
    sidebarCurrentPhone = phone;
    refreshSidebar(phone);
  }, 2000);
}
