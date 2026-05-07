// Globals disponíveis: supabase (de supabase-umd.js), SUPABASE_URL, SUPABASE_ANON_KEY (de config.js)

console.log('[LiveCRM CS] content_script carregado, readyState:', document.readyState);

const processedIds = new Set();

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

// ── Processar nó de mensagem ──────────────────────────────────────────────────

async function processNode(node) {
  const el = node.matches?.('[data-id]') ? node : node.querySelector?.('[data-id]');
  if (!el) return;

  const dataId = el.getAttribute('data-id');
  if (!dataId || processedIds.has(dataId)) return;
  processedIds.add(dataId);

  console.log('[LiveCRM CS] data-id encontrado:', dataId);

  // Formato: "false_5511999999999@c.us_ABCDEF" ou "false_5511999999999@c.us_ABCDEF_1"
  const underscoreIdx = dataId.indexOf('_');
  const secondUnderscore = dataId.indexOf('_', underscoreIdx + 1);
  if (underscoreIdx === -1 || secondUnderscore === -1) {
    console.log('[LiveCRM CS] data-id formato inesperado, ignorando:', dataId);
    return;
  }

  const direction = dataId.substring(0, underscoreIdx); // 'false' = inbound, 'true' = outbound
  const jid = dataId.substring(underscoreIdx + 1, secondUnderscore);

  const isOutbound = direction === 'true';
  if (isOutbound) return;

  if (!jid.includes('@c.us')) {
    console.log('[LiveCRM CS] grupo ou broadcast ignorado:', jid);
    return;
  }

  const phone = jid.replace('@c.us', '');
  const waMessageId = dataId;

  console.log('[LiveCRM CS] mensagem inbound de:', phone);

  const statusResp = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, resolve)
  );
  const instanceId = statusResp?.instanceId;
  if (!instanceId) {
    console.warn('[LiveCRM CS] background não conectado ainda, mensagem ignorada');
    return;
  }

  // ── Áudio ──
  const audioEl = el.querySelector('audio[src^="blob:"]') ||
                  el.closest('[class*="message-in"], [data-id]')?.querySelector('audio[src^="blob:"]');
  if (audioEl?.src) {
    console.log('[LiveCRM CS] áudio detectado, fazendo upload...');
    try {
      const mediaUrl = await uploadAudio(audioEl.src, instanceId, phone);
      chrome.runtime.sendMessage({
        type: 'INBOUND_MESSAGE',
        data: { phone, text: '🎵 audio.ogg', mediaUrl, mimetype: 'audio/ogg', waMessageId },
      });
    } catch (err) {
      console.warn('[LiveCRM CS] upload áudio falhou:', err.message);
      chrome.runtime.sendMessage({
        type: 'INBOUND_MESSAGE',
        data: { phone, text: '🎵 audio.ogg', mediaUrl: null, waMessageId },
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
  const videoEl = el.querySelector('video');
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
  const textEl =
    el.querySelector('span.selectable-text') ||
    el.querySelector('.copyable-text') ||
    el.querySelector('[class*="selectable"]') ||
    el.querySelector('span[dir="ltr"]');
  const text = textEl?.innerText?.trim();

  if (text) {
    console.log('[LiveCRM CS] texto:', text.substring(0, 50));
    chrome.runtime.sendMessage({
      type: 'INBOUND_MESSAGE',
      data: { phone, text, waMessageId },
    });
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
    const searchBox =
      document.querySelector('[data-testid="chat-list-search"]') ||
      document.querySelector('div[title="Pesquisar ou começar uma nova conversa"]') ||
      document.querySelector('[data-tab="3"]');

    if (!searchBox) throw new Error('Search box not found');

    searchBox.focus();
    searchBox.textContent = '';
    searchBox.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await sleep(300);

    document.execCommand('insertText', false, phone);
    searchBox.dispatchEvent(new InputEvent('input', { bubbles: true, data: phone }));
    await sleep(1500);

    const firstResult =
      document.querySelector('[data-testid="cell-frame-container"]') ||
      document.querySelector('[tabindex="-1"][role="listitem"]');

    if (!firstResult) throw new Error(`No chat found for phone ${phone}`);
    firstResult.click();
    await sleep(800);

    const input =
      document.querySelector('[data-testid="conversation-compose-box-input"]') ||
      document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
      document.querySelector('div[contenteditable="true"][title="Digite uma mensagem"]');

    if (!input) throw new Error('Compose input not found');

    input.focus();
    document.execCommand('insertText', false, message);
    await sleep(200);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
    }));
    await sleep(300);

    chrome.runtime.sendMessage({ type: 'SEND_CONFIRMED', sendId });
  } catch (e) {
    console.error('[LiveCRM CS] INJECT_SEND failed:', e.message);
    chrome.runtime.sendMessage({ type: 'SEND_FAILED', sendId, error: e.message });
  }
}

// ── Listeners ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'INJECT_SEND') {
    injectSend(msg).catch(console.error);
  }
});

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
