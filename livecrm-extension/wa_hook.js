// Roda no MAIN world — duas responsabilidades:
// 1. Hookear o store de mensagens do WA Web (captura de QUALQUER conversa)
// 2. Rastrear o telefone da conversa ativa via React fiber → anota em data-livecrm-phone
(function () {
  if (window.__livecrm_hook_loaded) return;
  window.__livecrm_hook_loaded = true;

  const HOOK_START_TS = Math.floor(Date.now() / 1000);

  // ── Utilitários JID ─────────────────────────────────────────────────────────

  // JID próprio do usuário — detectado na inicialização para ser excluído das buscas
  let _ownPhone = null;

  function parsePhone(s) {
    if (typeof s !== 'string') return null;
    if (s.includes('@g.us')) return null;
    if (s.includes('@c.us')) return s.replace(/@c\.us.*/, '');
    if (s.includes('@s.whatsapp.net')) return s.replace(/@s\.whatsapp\.net.*/, '');
    return null;
  }

  function jidFromString(s) {
    const p = parsePhone(s);
    if (!p || (_ownPhone && p === _ownPhone)) return null;
    return p;
  }

  function jidToPhone(jid) {
    if (!jid) return null;
    if (typeof jid === 'string') {
      const p = parsePhone(jid);
      if (!p || (_ownPhone && p === _ownPhone)) return null;
      return p;
    }
    if (typeof jid === 'object') {
      if (jid.server === 'g.us') return null;
      const s = jid._serialized || (jid.user && jid.server !== 'g.us' ? jid.user : null);
      return s ? jidToPhone(s) : null;
    }
    return null;
  }

  // Detecta o JID próprio do usuário via múltiplas estratégias
  function detectOwnPhone() {
    // Estratégia 1: window.require com módulos conhecidos
    if (typeof window.require === 'function') {
      for (const id of ['Store', 'WAWebStore', 'WAWebStores', 'WAWebConn', 'WAWebSession',
                        'WAWebUserPrefs', 'WAWebUserPrefsMeUser', 'WAWebMe']) {
        try {
          const m = window.require(id);
          if (!m) continue;
          for (const val of [m, m.default, m.Conn, m.Me, m.me, m.user, m.User, m.wid, m.session]) {
            if (!val || typeof val !== 'object') continue;
            if (val.server === 'c.us' && typeof val.user === 'string') {
              const p = val.user;
              _ownPhone = p; window.__livecrm_own_jid = p;
              console.log('[LiveCRM Hook] JID próprio via require(' + id + '):', p); return;
            }
            const p = parsePhone(val._serialized || val.wid?._serialized || val.me?._serialized || '');
            if (p) { _ownPhone = p; window.__livecrm_own_jid = p; console.log('[LiveCRM Hook] JID próprio via require(' + id + '):', p); return; }
          }
        } catch {}
      }
    }

    // Estratégia 2: webpack cache — padrão JID direto { server:'c.us', user:'PHONE' } ou aninhado
    try {
      const cache = window.__webpack_module_cache__;
      if (!cache) return;
      for (const mod of Object.values(cache)) {
        const e = mod?.exports;
        if (!e || typeof e !== 'object') continue;
        for (const val of [e, e.default, e.me, e.Me, e.Conn, e.conn, e.user, e.User, e.wid, e.session, e.Session]) {
          if (!val || typeof val !== 'object') continue;
          // JID direto: { server: 'c.us', user: 'PHONE' }
          if (val.server === 'c.us' && typeof val.user === 'string' && /^\d{10,15}$/.test(val.user)) {
            _ownPhone = val.user; window.__livecrm_own_jid = val.user;
            console.log('[LiveCRM Hook] JID próprio via cache (direto):', val.user); return;
          }
          // JID aninhado: { wid: { server: 'c.us', user: 'PHONE' } }
          for (const k of ['wid', 'me', 'Me', 'id', 'meUser', 'myJid', 'currentUser']) {
            const v2 = val[k];
            if (!v2 || typeof v2 !== 'object') continue;
            if (v2.server === 'c.us' && typeof v2.user === 'string' && /^\d{10,15}$/.test(v2.user)) {
              _ownPhone = v2.user; window.__livecrm_own_jid = v2.user;
              console.log('[LiveCRM Hook] JID próprio via cache.' + k + ':', v2.user); return;
            }
            const p = parsePhone(v2._serialized || '');
            if (p) { _ownPhone = p; window.__livecrm_own_jid = p; console.log('[LiveCRM Hook] JID próprio via cache._serialized:', p); return; }
          }
        }
      }
    } catch {}

    // Estratégia 3: fiber do elemento de perfil do usuário (#side header)
    try {
      const profileEl = document.querySelector(
        '#side header img, #side [data-testid="default-user"], ' +
        '[data-testid="menu-bar-user"], [aria-label*="foto"][aria-label*="perfil"]'
      );
      if (profileEl) {
        const fk = Object.keys(profileEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
        if (fk) {
          const propsToScan = [];
          if (fk.startsWith('__reactProps')) {
            propsToScan.push(profileEl[fk]);
          } else {
            let f = profileEl[fk];
            for (let i = 0; i < 25 && f; i++) {
              if (f.memoizedProps) propsToScan.push(f.memoizedProps);
              try { f = f.return; } catch { break; }
            }
          }
          for (const props of propsToScan) {
            if (!props || typeof props !== 'object') continue;
            for (const k of ['jid', 'wid', 'contact', 'selfJid', 'myJid', 'profileJid', 'user']) {
              const v = props[k];
              if (!v) continue;
              const s = typeof v === 'string' ? v : (v._serialized || (v.server === 'c.us' ? v.user : '') || '');
              const p = parsePhone(s);
              if (p) { _ownPhone = p; window.__livecrm_own_jid = p; console.log('[LiveCRM Hook] JID próprio via profile fiber:', p); return; }
            }
          }
        }
      }
    } catch {}
  }

  function extractJidDeep(v) {
    if (!v) return null;
    const r = jidFromString(v);
    if (r) return r;
    if (typeof v !== 'object') return null;
    try {
      const candidates = [
        v._serialized, v.jid,
        v.user && (v.server === 'c.us' || v.server === 's.whatsapp.net') ? v.user : null,
        v.remote?._serialized, v.to?._serialized,
        v.id?._serialized, v.id?.user,
        v.chatId?._serialized, v.chatId,
        v.remoteJid, v.conversationId,
      ];
      for (const c of candidates) {
        const r2 = jidFromString(c);
        if (r2) return r2;
      }
    } catch {}
    return null;
  }

  // Scan de props até 3 níveis, com fast-path para chaves conhecidas do WA Web
  function scanPropsDeep(props) {
    if (!props || typeof props !== 'object' || Array.isArray(props)) return null;
    try {
      // Fast-path: chaves conhecidas de modelos de chat do WA Web
      for (const key of ['chat', 'chatId', 'jid', 'remoteJid', 'conversationId', 'chatModel', 'chatData']) {
        if (!(key in props)) continue;
        const v = props[key];
        const r = extractJidDeep(v);
        if (r) return r;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          for (const key2 of ['_serialized', 'user', 'id', 'jid', 'chatId']) {
            try { const r2 = jidFromString(v[key2]); if (r2) return r2; } catch {}
          }
        }
      }
      // Varredura genérica com limite
      const entries = Object.entries(props);
      if (entries.length > 120) return null; // skip stores/coleções grandes
      for (const [, v] of entries) {
        if (typeof v === 'function' || v instanceof Element) continue;
        const r = extractJidDeep(v);
        if (r) return r;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          let sub;
          try { sub = Object.entries(v); } catch { continue; }
          if (sub.length > 60) continue;
          for (const [, v2] of sub) {
            if (typeof v2 === 'function' || v2 instanceof Element) continue;
            const r2 = extractJidDeep(v2);
            if (r2) return r2;
            if (v2 && typeof v2 === 'object' && !Array.isArray(v2)) {
              let sub2;
              try { sub2 = Object.entries(v2); } catch { continue; }
              if (sub2.length > 30) continue;
              for (const [, v3] of sub2) {
                const r3 = extractJidDeep(v3);
                if (r3) return r3;
              }
            }
          }
        }
      }
    } catch {}
    return null;
  }

  // Varre a subárvore de fiber (filhos) em busca de JID — o JID do contato
  // está nos componentes filhos do item do sidebar, não nos ancestrais
  function scanFiberDown(node, depth) {
    if (!node || depth <= 0) return null;
    try {
      const r = scanPropsDeep(node.memoizedProps) || scanPropsDeep(node.pendingProps);
      if (r) return r;
      let ms = node.memoizedState;
      for (let h = 0; h < 15 && ms; h++, ms = ms?.next) {
        const mv = ms.memoizedState;
        if (!mv) continue;
        const r2 = extractJidDeep(mv);
        if (r2) return r2;
        if (typeof mv === 'object' && !(mv instanceof Element)) {
          const r3 = scanPropsDeep(mv);
          if (r3) return r3;
        }
      }
    } catch {}
    let child = node.child;
    while (child) {
      const r = scanFiberDown(child, depth - 1);
      if (r) return r;
      try { child = child.sibling; } catch { break; }
    }
    return null;
  }

  // Sobe pelo fiber tree a partir de um elemento DOM, checando props + hooks state
  function fiberSearchForPhone(startEl) {
    let fk;
    try { fk = Object.keys(startEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps')); }
    catch { return null; }
    if (!fk) return null;

    if (fk.startsWith('__reactProps')) return scanPropsDeep(startEl[fk]);

    let f;
    try { f = startEl[fk]; } catch { return null; }

    // Primeiro desce nos filhos: o JID do contato está nos componentes filhos do item
    const downResult = scanFiberDown(f, 20);
    if (downResult) return downResult;

    for (let i = 0; i < 200 && f; i++) {
      try {
        // memoizedProps / pendingProps
        const r1 = scanPropsDeep(f.memoizedProps) || scanPropsDeep(f.pendingProps);
        if (r1) return r1;

        // memoizedState: lista encadeada de hooks (useState, useContext, useReducer…)
        let ms = f.memoizedState;
        for (let h = 0; h < 30 && ms; h++, ms = ms?.next) {
          const mv = ms.memoizedState;
          if (!mv) continue;
          const r2 = extractJidDeep(mv);
          if (r2) return r2;
          if (typeof mv === 'object' && !(mv instanceof Element)) {
            const r3 = scanPropsDeep(mv);
            if (r3) return r3;
            // store com getActive() — padrão MobX
            try {
              const chat = (typeof mv.getActive === 'function' ? mv.getActive() : null)
                || mv.active || mv.activeChat;
              if (chat) {
                const r4 = extractJidDeep(chat.id?._serialized || chat.id || chat.jid);
                if (r4) return r4;
              }
            } catch {}
            // useRef: { current: ... }
            if (mv.current) {
              const r5 = extractJidDeep(mv.current);
              if (r5) return r5;
            }
          }
        }

        // stateNode (componentes de classe)
        if (f.stateNode && !(f.stateNode instanceof Element) && typeof f.stateNode === 'object') {
          const r6 = scanPropsDeep(f.stateNode.props || f.stateNode);
          if (r6) return r6;
        }
      } catch {}
      try { f = f.return; } catch { break; }
    }
    return null;
  }

  // Extrai telefone da conversa ativa via múltiplas estratégias
  function getActivePhoneFromFiber() {
    // 0. DOM-first: data-id no item selecionado da sidebar — fonte direta do WA Web
    const sidebarSels = [
      '[data-testid="cell-frame-container"][aria-selected="true"]',
      '[role="listitem"][aria-selected="true"]',
      '[tabindex="-1"][aria-selected="true"]',
      '[aria-selected="true"]',
    ];
    for (const sel of sidebarSels) {
      for (const el of document.querySelectorAll(sel)) {
        const raw = el.getAttribute('data-id') || '';
        if (raw.includes('@c.us')) return raw.replace(/@c\.us.*/, '');
        if (raw.includes('@s.whatsapp.net')) return raw.replace(/@s\.whatsapp\.net.*/, '');
        const child = el.querySelector('[data-id*="@c.us"]');
        if (child) return child.getAttribute('data-id').replace(/@c\.us.*/, '');
      }
    }

    // 1. Fiber do item selecionado no sidebar — props diretas do contato
    // (antes do header que sobe até componentes pai com JID do próprio usuário)
    const selected = document.querySelector('[aria-selected="true"]');
    if (selected) {
      const r = fiberSearchForPhone(selected);
      if (r) return r;
    }

    // 2. Header da conversa — profundidade limitada a 25 nós para evitar JID do usuário
    const header = document.querySelector(
      '[data-testid="conversation-header"], #main header'
    );
    if (header) {
      let fk2;
      try { fk2 = Object.keys(header).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps')); } catch {}
      if (fk2) {
        if (fk2.startsWith('__reactProps')) {
          const r = scanPropsDeep(header[fk2]);
          if (r) return r;
        } else {
          let f2;
          try { f2 = header[fk2]; } catch {}
          for (let i = 0; i < 25 && f2; i++) {
            try {
              const r = scanPropsDeep(f2.memoizedProps) || scanPropsDeep(f2.pendingProps);
              if (r) return r;
              f2 = f2.return;
            } catch { break; }
          }
        }
      }
    }

    // 3. Painel principal (#main)
    const mainEl = document.getElementById('main');
    if (mainEl) {
      const fk = Object.keys(mainEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
      if (fk) {
        if (fk.startsWith('__reactProps')) {
          const r = scanPropsDeep(mainEl[fk]);
          if (r) return r;
        } else {
          let f;
          try { f = mainEl[fk]; } catch {}
          for (let i = 0; i < 50 && f; i++) {
            try {
              const r = scanPropsDeep(f.memoizedProps) || scanPropsDeep(f.pendingProps);
              if (r) return r;
              f = f.return;
            } catch { break; }
          }
        }
      }
    }

    // 4. Webpack module cache — procura store com active/getActive
    try {
      const cache = window.__webpack_module_cache__;
      if (cache) {
        for (const mod of Object.values(cache)) {
          const e = mod?.exports;
          if (!e || typeof e !== 'object') continue;
          for (const v of Object.values(e)) {
            if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
            try {
              const chat = (typeof v.getActive === 'function' ? v.getActive() : null)
                || v.active || v.activeChat;
              if (!chat || typeof chat !== 'object') continue;
              const r = extractJidDeep(
                chat.id?._serialized || chat.id || chat.jid || chat.chatId
              );
              if (r) return r;
            } catch {}
          }
        }
      }
    } catch {}

    // 5. window.require com nomes de módulo conhecidos
    try {
      if (typeof window.require === 'function') {
        for (const id of ['WAWebActiveConversation', 'WAWebConversations', 'WAWebChat',
                          'WAWebChatModel', 'WAWebConversationModel']) {
          try {
            const mod = window.require(id);
            if (!mod) continue;
            const chat = mod.getActive?.() || mod.active || mod.default?.getActive?.() || mod.default?.active;
            if (chat) {
              const r = extractJidDeep(chat.id?._serialized || chat.id?.user || chat.jid);
              if (r) return r;
            }
          } catch {}
        }
      }
    } catch {}

    return null;
  }

  // ── Phone Tracker: anota data-livecrm-phone em #main ───────────────────────

  let lastAnnotatedPhone = null;

  function updateActiveChatPhone() {
    const phone = getActivePhoneFromFiber();
    const main = document.getElementById('main');
    if (!main) return;

    if (phone) {
      if (phone !== lastAnnotatedPhone) {
        main.setAttribute('data-livecrm-phone', phone);
        lastAnnotatedPhone = phone;
        console.log('[LiveCRM Hook] telefone ativo:', phone);
      }
    }
    // Não limpa o atributo ao falhar — mantém último valor conhecido
  }

  function startPhoneTracker() {
    if (!_ownPhone) detectOwnPhone(); // garante JID próprio antes do primeiro scan
    updateActiveChatPhone(); // leitura inicial

    // Retry detectOwnPhone a cada 2s por até 30s até capturar JID próprio
    if (!_ownPhone) {
      let retries = 0;
      const retryInterval = setInterval(() => {
        if (_ownPhone || ++retries > 15) { clearInterval(retryInterval); return; }
        detectOwnPhone();
      }, 2000);
    }

    let debounceTimer = null;
    const scheduleUpdate = (delay = 250) => {
      if (!_ownPhone) detectOwnPhone();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateActiveChatPhone, delay);
    };

    // Observer do header: dispara quando muda de conversa (título muda)
    const header = document.querySelector('[data-testid="conversation-header"], #main header');
    const main = document.getElementById('main');
    const headerTarget = header || main || document.body;
    const headerObs = new MutationObserver(() => scheduleUpdate(150));
    headerObs.observe(headerTarget, { childList: true, subtree: true });

    // Observer do sidebar: dispara imediatamente quando aria-selected muda
    const sidebar = document.querySelector(
      '[data-testid="chat-list"], #pane-side, [role="list"]'
    );
    if (sidebar) {
      const sidebarObs = new MutationObserver(() => scheduleUpdate(0)); // sem debounce
      sidebarObs.observe(sidebar, {
        attributes: true, subtree: true, attributeFilter: ['aria-selected'],
      });
    }

    // Click-tracking: captura o JID do data-id ao clicar no item do sidebar —
    // mais confiável que aria-selected no WA Web 2026 (não usa attr aria-selected)
    const paneContainer = document.querySelector('#pane-side, [data-testid="chat-list-container"]') || document.body;
    paneContainer.addEventListener('click', (e) => {
      const item = e.target.closest('[data-id*="@c.us"], [data-id*="@s.whatsapp.net"]')
        || e.target.closest('[data-testid="cell-frame-container"]');
      if (!item) return;
      const rawId = item.getAttribute('data-id') || '';
      let phone = null;
      if (rawId.includes('@c.us')) phone = rawId.replace(/@c\.us.*/, '');
      else if (rawId.includes('@s.whatsapp.net')) phone = rawId.replace(/@s\.whatsapp\.net.*/, '');
      if (!phone) {
        const child = item.querySelector('[data-id*="@c.us"], [data-id*="@s.whatsapp.net"]');
        if (child) {
          const cid = child.getAttribute('data-id') || '';
          if (cid.includes('@c.us')) phone = cid.replace(/@c\.us.*/, '');
          else if (cid.includes('@s.whatsapp.net')) phone = cid.replace(/@s\.whatsapp\.net.*/, '');
        }
      }
      if (!phone) return;
      const own = window.__livecrm_own_jid;
      if (own && phone === own) return;
      window.__livecrm_active_phone = phone;
      window.__livecrm_active_jid = rawId || (phone + '@s.whatsapp.net');
      const m = document.getElementById('main');
      if (m && phone !== lastAnnotatedPhone) {
        m.setAttribute('data-livecrm-phone', phone);
        lastAnnotatedPhone = phone;
        console.log('[LiveCRM Hook] click-track phone:', phone);
      }
    }, true); // capture phase — funciona mesmo antes de child listeners

    console.log('[LiveCRM Hook] phone tracker iniciado');
  }

  function initPhoneTracker() {
    const main = document.getElementById('main');
    if (main) {
      setTimeout(startPhoneTracker, 800);
      return;
    }
    // Aguarda #main aparecer no DOM
    const bodyObs = new MutationObserver(() => {
      if (document.getElementById('main')) {
        bodyObs.disconnect();
        setTimeout(startPhoneTracker, 800);
      }
    });
    bodyObs.observe(document.body, { childList: true, subtree: true });
  }

  // ── Backbone/Message store hook (captura de background conversations) ───────

  function notifyMsg(msg) {
    try {
      // Captura JID próprio antes de qualquer filtro:
      // inbound → msg.to = nosso JID; outbound → msg.from = nosso JID
      if (!_ownPhone && msg) {
        const ownRaw = msg.isSentByMe ? (msg.from || msg.author) : msg.to;
        if (ownRaw) {
          const raw = typeof ownRaw === 'string' ? ownRaw : ownRaw?._serialized;
          const p = parsePhone(raw || '');
          if (p) {
            _ownPhone = p;
            window.__livecrm_own_jid = p;
            console.log('[LiveCRM Hook] JID próprio capturado via mensagem:', p);
          }
        }
      }

      if (!msg || msg.type === 'revoked') return;
      if (msg.isSentByMe) {
        const outTs = msg.t || msg.timestamp;
        if (outTs && outTs < HOOK_START_TS - 30) return;
        const contactPhone = jidToPhone(msg.to || msg.chatId);
        if (!contactPhone) return;
        const outId = msg.id?.id || msg.id?._serialized || (typeof msg.id === 'string' ? msg.id : null);
        if (!outId || typeof outId !== 'string') return;
        let outText = msg.body || msg.caption || '';
        if (!outText) {
          const t = msg.type;
          if (t === 'ptt' || t === 'audio') outText = '🎵 Áudio';
          else if (t === 'image') outText = '📷 Imagem';
          else if (t === 'video') outText = '🎥 Vídeo';
          else if (t === 'document') outText = '📎 Arquivo';
          else outText = `(${t || 'mensagem'})`;
        }
        window.postMessage({ type: 'LIVECRM_OUTBOUND', phone: contactPhone, text: outText, msgId: outId }, '*');
        return;
      }
      const msgTs = msg.t || msg.timestamp;
      if (msgTs && msgTs < HOOK_START_TS - 30) return;
      const phone = jidToPhone(msg.from || msg.chatId);
      if (!phone) return;

      // Mantém último telefone de contato para acesso imediato pelo sidebar
      window.__livecrm_active_phone = phone;

      const msgId = msg.id?.id || msg.id?._serialized || (typeof msg.id === 'string' ? msg.id : null);
      if (!msgId || typeof msgId !== 'string') return;
      const text = msg.body || msg.caption || '';
      let textOut = text;
      if (!textOut) {
        const t = msg.type;
        if (t === 'ptt' || t === 'audio') textOut = '🎵 Áudio';
        else if (t === 'image') textOut = '📷 Imagem';
        else if (t === 'video') textOut = '🎥 Vídeo';
        else if (t === 'document') textOut = '📎 Arquivo';
        else textOut = `(${t || 'mensagem'})`;
      }
      window.postMessage({ type: 'LIVECRM_INBOUND', phone, text: textOut, msgId }, '*');
    } catch (e) {
      console.warn('[LiveCRM Hook] notifyMsg erro:', e.message);
    }
  }

  function looksLikeMsgStore(store) {
    if (!store || typeof store !== 'object') return false;
    return typeof store.on === 'function' &&
           (store.models !== undefined || store._byId !== undefined || typeof store.getModelsArray === 'function');
  }

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
      } catch {}
    }
    return false;
  }

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
        } catch {}
      }
    }
    return false;
  }

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
      } catch {}
    }
    return false;
  }

  function hookWebpackPush(onNewChunk) {
    const chunk = window.webpackChunkwhatsapp_web_client;
    if (!chunk?.push || chunk.__livecrm_hooked) return;
    chunk.__livecrm_hooked = true;
    const origPush = chunk.push.bind(chunk);
    chunk.push = function (...args) {
      const result = origPush(...args);
      if (onNewChunk()) chunk.push = origPush;
      return result;
    };
  }

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

  // ── Navegação direta para uma conversa (INJECT_SEND) ───────────────────────
  // Usa o roteador interno do WA Web via history.pushState + popstate
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.type !== 'LIVECRM_OPEN_PHONE') return;
    const phone = String(e.data.phone || '').replace(/\D/g, '');
    if (!phone) return;
    try {
      window.history.pushState(null, '', '/send?phone=' + phone);
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      console.log('[LiveCRM Hook] navegando para:', phone);
    } catch (err) {
      console.warn('[LiveCRM Hook] navegação falhou:', err.message);
    }
  });

  // ── Inicialização ───────────────────────────────────────────────────────────

  tryHook();
  setTimeout(initPhoneTracker, 1500);
  console.log('[LiveCRM Hook] iniciado no MAIN world');
})();
