// Globals disponíveis: supabase (de supabase-umd.js), SUPABASE_URL, SUPABASE_ANON_KEY (de config.js)

console.log('[LiveCRM CS] content_script carregado, readyState:', document.readyState);

const processedIds = new Set();

// ── Lê o telefone ativo via background (chrome.scripting no mundo principal) ──
async function getPhoneFromBackground() {
  return Promise.race([
    new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_ACTIVE_PHONE' }, resp => {
          if (chrome.runtime.lastError) {
            console.warn('[LiveCRM CS] lastError GET_ACTIVE_PHONE:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          resolve(resp?.phone || null);
        });
      } catch (e) {
        console.warn('[LiveCRM CS] sendMessage falhou:', e.message);
        resolve(null);
      }
    }),
    new Promise(resolve => setTimeout(() => {
      console.warn('[LiveCRM CS] GET_ACTIVE_PHONE timeout 5s — SW não respondeu');
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

  // 4. URL — algumas versões do WA Web codificam o JID no hash
  const phoneMatch = window.location.href.match(/[?&/](\d{10,15})(?:@|$|&)/);
  if (phoneMatch) return phoneMatch[1];

  // Dump diagnóstico para identificar seletores corretos na próxima iteração
  const headerHtml = document.querySelector('#main header')?.outerHTML?.substring(0, 500) || 'não encontrado';
  const ariaSelected = [...document.querySelectorAll('[aria-selected]')]
    .map(e => `${e.tagName}|data-id=${(e.getAttribute('data-id') || '').substring(0, 30)}|sel=${e.getAttribute('aria-selected')}`)
    .join(' | ');
  console.warn('[LiveCRM CS] getActiveChatPhone falhou.',
    '\n  [aria-selected]:', ariaSelected || 'nenhum',
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
  // Mensagens enviadas têm ícone de status (check/dblcheck/time)
  return !!(
    el.querySelector('[data-testid="msg-dblcheck"], [data-testid="msg-check"], [data-testid="msg-time"]') ||
    el.querySelector('[data-icon="msg-dblcheck"], [data-icon="msg-check"], [data-icon="msg-time"]') ||
    el.closest('[class*="message-out"]')
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

  const observer = new MutationObserver((mutations) => {
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

  observer.observe(document.body, { childList: true, subtree: true });
}

// ── Inject Send ───────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Insere texto em contenteditable compatível com React sem precisar de gesto do usuário
function setContentEditable(el, text) {
  el.focus();
  el.textContent = text;
  // Move cursor para o fim
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  // Dispara evento que o React consegue capturar
  el.dispatchEvent(new InputEvent('input', {
    data: text, inputType: 'insertText', bubbles: true, composed: true,
  }));
}

async function injectSend({ sendId, phone, message }) {
  try {
    // ── 1. Abre a caixa de busca ──────────────────────────────────────────────
    const searchContainer =
      document.querySelector('[data-testid="chat-list-search"]') ||
      document.querySelector('[data-testid="search-container"]');

    const searchBox = searchContainer
      ? (searchContainer.querySelector('[contenteditable="true"]') || searchContainer)
      : (document.querySelector('[role="searchbox"]') ||
         document.querySelector('div[contenteditable="true"][data-tab="3"]'));

    if (!searchBox) throw new Error('Search box not found');

    searchBox.click();
    await sleep(200);

    setContentEditable(searchBox, phone);
    console.log('[LiveCRM CS] INJECT_SEND: buscando', phone, '→ conteúdo:', JSON.stringify(searchBox.textContent));
    await sleep(2000);

    // ── 2. Clica no primeiro resultado ────────────────────────────────────────
    const firstResult =
      document.querySelector('[data-testid="cell-frame-container"]') ||
      document.querySelector('[tabindex="-1"][role="listitem"]');

    console.log('[LiveCRM CS] INJECT_SEND: resultado?', !!firstResult, 'texto:', firstResult?.textContent?.substring(0, 40));
    if (!firstResult) throw new Error(`No chat found for phone ${phone}`);
    firstResult.click();
    await sleep(1000);

    // ── 3. Fecha a busca (ESC) para não interferir no compose ─────────────────
    searchBox.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true,
    }));
    await sleep(300);

    // ── 4. Abre o input de compose e escreve ──────────────────────────────────
    const composeInput =
      document.querySelector('[data-testid="conversation-compose-box-input"]') ||
      document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
      document.querySelector('div[contenteditable="true"][title="Digite uma mensagem"]') ||
      document.querySelector('#main div[contenteditable="true"]');

    if (!composeInput) throw new Error('Compose input not found');

    setContentEditable(composeInput, message);
    await sleep(300);

    // ── 5. Envia com Enter ────────────────────────────────────────────────────
    composeInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
    }));
    await sleep(500);

    console.log('[LiveCRM CS] INJECT_SEND: enviado para', phone);
    try { if (chrome.runtime?.id) chrome.runtime.sendMessage({ type: 'SEND_CONFIRMED', sendId }); } catch { /* context invalidado */ }
  } catch (e) {
    console.error('[LiveCRM CS] INJECT_SEND failed:', e.message);
    try { if (chrome.runtime?.id) chrome.runtime.sendMessage({ type: 'SEND_FAILED', sendId, error: e.message }); } catch { /* context invalidado */ }
  }
}

// ── Fila de envios: processa um de cada vez ───────────────────────────────────
const sendQueue = [];
let isSending = false;

async function drainSendQueue() {
  if (isSending) return;
  isSending = true;
  while (sendQueue.length > 0) {
    const job = sendQueue.shift();
    await injectSend(job);
    await sleep(600);
  }
  isSending = false;
}

// ── Listeners ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'INJECT_SEND') {
    sendQueue.push(msg);
    drainSendQueue().catch(console.error);
  }
});

// ── Recebe mensagens do wa_hook.js (roda no MAIN world) ──────────────────────
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'LIVECRM_INBOUND') return;

  const { phone, text, msgId } = event.data;
  if (!phone || !msgId) return;
  if (processedIds.has(msgId)) return;
  processedIds.add(msgId);

  console.log('[LiveCRM CS] wa_hook: mensagem de', phone, 'texto:', (text || '').substring(0, 40));
  try {
    if (!chrome.runtime?.id) return; // context invalidado após reload da extensão
    chrome.runtime.sendMessage({
      type: 'INBOUND_MESSAGE',
      data: { phone, text, waMessageId: msgId },
    });
  } catch { /* context invalidado — aba do WA Web precisa de F5 */ }
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
