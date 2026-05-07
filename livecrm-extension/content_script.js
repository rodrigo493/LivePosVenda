// Globals disponíveis: supabase (de supabase-umd.js), SUPABASE_URL, SUPABASE_ANON_KEY (de config.js)

const processedIds = new Set();

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

  // Formato: "false_5511999999999@c.us_ABCDEF"
  const parts = dataId.split('_');
  if (parts.length < 3) return;

  const isOutbound = parts[0] === 'true';
  if (isOutbound) return;

  const jid = parts[1];
  if (!jid.includes('@c.us')) return; // Ignorar grupos

  const phone = jid.replace('@c.us', '');
  const waMessageId = dataId;

  const { instanceId } = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, resolve)
  );
  if (!instanceId) return; // Background não conectado ainda

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
    } catch {
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
  const videoEl = el.querySelector('video') ||
                  el.closest('.message-in')?.querySelector('video');
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}
