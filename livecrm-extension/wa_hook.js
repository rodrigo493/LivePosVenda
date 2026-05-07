// Roda no MAIN world — hooka o store de mensagens do WA Web para capturar
// mensagens de QUALQUER conversa, não só a aberta.
(function () {
  if (window.__livecrm_hook_loaded) return;
  window.__livecrm_hook_loaded = true;

  const HOOK_START_TS = Math.floor(Date.now() / 1000);

  function jidToPhone(jid) {
    if (!jid) return null;
    if (typeof jid === 'string') {
      if (jid.includes('@g.us')) return null;
      return jid.replace(/@c\.us.*/, '').replace(/@s\.whatsapp\.net.*/, '');
    }
    if (typeof jid === 'object') {
      if (jid.server === 'g.us') return null;
      const s = jid._serialized || (jid.user && jid.server !== 'g.us' ? jid.user : null);
      return s ? jidToPhone(s) : null;
    }
    return null;
  }

  function notifyMsg(msg) {
    try {
      if (!msg || msg.isSentByMe || msg.type === 'revoked') return;

      const msgTs = msg.t || msg.timestamp;
      if (msgTs && msgTs < HOOK_START_TS - 30) return;

      const phone = jidToPhone(msg.from || msg.chatId);
      if (!phone) return;

      const msgId = msg.id?.id || msg.id?._serialized || (typeof msg.id === 'string' ? msg.id : null);
      if (!msgId || typeof msgId !== 'string') return;

      const text = msg.body || msg.caption || '';
      const mediaType = msg.type;

      let textOut = text;
      if (!textOut) {
        if (mediaType === 'ptt' || mediaType === 'audio') textOut = '🎵 Áudio';
        else if (mediaType === 'image') textOut = '📷 Imagem';
        else if (mediaType === 'video') textOut = '🎥 Vídeo';
        else if (mediaType === 'document') textOut = '📎 Arquivo';
        else textOut = `(${mediaType || 'mensagem'})`;
      }

      window.postMessage({ type: 'LIVECRM_INBOUND', phone, text: textOut, msgId }, '*');
    } catch (e) {
      console.warn('[LiveCRM Hook] notifyMsg erro:', e.message);
    }
  }

  function looksLikeMsgStore(store) {
    if (!store || typeof store !== 'object') return false;
    // Backbone/EventEmitter collection: tem .on() e .models ou ._byId
    return typeof store.on === 'function' &&
           (store.models !== undefined || store._byId !== undefined || typeof store.getModelsArray === 'function');
  }

  // ── 1. Tenta via cache webpack (módulos já executados — sem noise de require) ──
  function tryHookCache() {
    const cache = window.__webpack_module_cache__;
    if (!cache || typeof cache !== 'object') return false;

    for (const entry of Object.values(cache)) {
      try {
        const exports = entry?.exports;
        if (!exports) continue;
        for (const val of [exports, exports.default]) {
          if (looksLikeMsgStore(val)) {
            val.on('add', (msg) => { if (msg?.isNewMsg !== false) notifyMsg(msg); });
            console.log('[LiveCRM Hook] hookeado via __webpack_module_cache__');
            return true;
          }
        }
      } catch { /* skip */ }
    }
    return false;
  }

  // ── 2. Tenta via enumeração de chunks (window.require com IDs numéricos) ──
  function tryHookChunks() {
    const chunk = window.webpackChunkwhatsapp_web_client;
    if (!Array.isArray(chunk)) return false;

    const tried = new Set();
    for (const entry of chunk) {
      if (!Array.isArray(entry) || !entry[1] || typeof entry[1] !== 'object') continue;
      for (const modId of Object.keys(entry[1])) {
        if (tried.has(modId)) continue;
        tried.add(modId);
        try {
          if (typeof window.require !== 'function') continue;
          const mod = window.require(modId);
          if (!mod) continue;
          for (const val of [mod, mod.default]) {
            if (looksLikeMsgStore(val)) {
              val.on('add', (msg) => { if (msg?.isNewMsg !== false) notifyMsg(msg); });
              console.log('[LiveCRM Hook] hookeado via chunk, ID:', modId);
              return true;
            }
          }
        } catch { /* módulo não exporta nada útil */ }
      }
    }
    return false;
  }

  // ── 3. Tenta nomes legados (WA Web pré-2025) — apenas uma vez ──────────────
  let legacyTried = false;
  function tryHookLegacy() {
    if (legacyTried) return false;
    legacyTried = true;

    if (typeof window.require !== 'function') return false;

    const candidates = ['WAWebMsgStore', 'WAWebMsgsStore', 'MsgStore', 'WAWebStore', 'WAWebStores'];
    for (const id of candidates) {
      try {
        const mod = window.require(id);
        const store = mod?.default || mod;
        if (!store) continue;
        if (typeof store.on === 'function') {
          store.on('add', (msg) => { if (msg?.isNewMsg !== false) notifyMsg(msg); });
          console.log('[LiveCRM Hook] hookeado via nome legado:', id);
          return true;
        }
        if (store.models && Object.getPrototypeOf(store)?.add) {
          const proto = Object.getPrototypeOf(store);
          const origAdd = proto.add;
          proto.add = function (msgs, ...args) {
            const result = origAdd.call(this, msgs, ...args);
            const list = Array.isArray(msgs) ? msgs : [msgs];
            list.forEach(m => { if (m?.isNewMsg !== false) notifyMsg(m); });
            return result;
          };
          console.log('[LiveCRM Hook] hookeado via proto.add legado:', id);
          return true;
        }
      } catch { /* módulo não existe — ignora silenciosamente após o primeiro try */ }
    }
    return false;
  }

  // ── Intercept webpack chunk push para tentar de novo após novos chunks ───────
  function hookWebpackPush(onNewChunk) {
    const chunk = window.webpackChunkwhatsapp_web_client;
    if (!chunk?.push || chunk.__livecrm_hooked) return;
    chunk.__livecrm_hooked = true;
    const origPush = chunk.push.bind(chunk);
    chunk.push = function (...args) {
      const result = origPush(...args);
      if (onNewChunk()) chunk.push = origPush; // restaura quando hookeou
      return result;
    };
  }

  // ── Sequência de tentativas ──────────────────────────────────────────────────
  function tryAll() {
    return tryHookLegacy() || tryHookCache() || tryHookChunks();
  }

  let attempts = 0;
  function tryHook() {
    if (tryAll()) return;
    if (attempts === 0) hookWebpackPush(tryAll);
    if (++attempts < 20) {
      setTimeout(tryHook, attempts < 5 ? 1000 : 3000);
    } else {
      console.warn('[LiveCRM Hook] não conseguiu hookear store após', attempts, 'tentativas');
    }
  }

  tryHook();
  console.log('[LiveCRM Hook] iniciado no MAIN world');
})();
