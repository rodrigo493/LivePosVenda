importScripts('./lib/supabase-umd.js', './config.js');

let sb = null;
let instanceId = null;
let currentUserId = null;  // user_id do JWT do usuário logado
let rtChannel = null;
const dispatchedSends = new Set();   // evita double-dispatch de pending sends
const dispatchTimeouts = new Map(); // timeout de confirmação por sendId

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

function isTokenExpired(accessToken) {
  try {
    const exp = JSON.parse(atob(accessToken.split('.')[1])).exp;
    return exp && Date.now() / 1000 >= exp - 30;
  } catch { return false; }
}

async function init() {
  let stored = await getStored(['session', 'instanceId']);
  if (!stored.session) return;

  // Refresh proativo se token expirou ou expira em < 30s
  if (isTokenExpired(stored.session.access_token)) {
    console.log('[LiveCRM BG] token expirado no init, refreshing...');
    await refreshToken();
    stored = await getStored(['session', 'instanceId']);
    if (!stored.session) return;
  }

  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${stored.session.access_token}` } },
  });

  // Agendar refresh do token a cada 50 minutos (expira em 60min)
  chrome.alarms.create('token-refresh', { periodInMinutes: 50 });

  // Decodifica JWT para obter user_id do usuário logado
  try {
    const payload = JSON.parse(atob(stored.session.access_token.split('.')[1]));
    currentUserId = payload.sub || null;
  } catch { currentUserId = null; }

  instanceId = stored.instanceId;
  if (!instanceId) {
    const query = sb.from('pipeline_whatsapp_instances').select('id').eq('active', true).limit(1);
    const { data } = currentUserId
      ? await query.eq('user_id', currentUserId).maybeSingle()
      : await query.maybeSingle();

    if (data?.id) {
      instanceId = data.id;
      await setStored({ instanceId });
      console.log('[LiveCRM BG] instance encontrada:', instanceId, 'para userId:', currentUserId);
    } else {
      console.warn('[LiveCRM BG] nenhuma instância encontrada para userId:', currentUserId);
    }
  } else {
    console.log('[LiveCRM BG] instance do storage:', instanceId);
  }

  if (instanceId) {
    subscribeRealtime();
    pingHeartbeat().catch(console.error);
    processPendingSends().catch(console.error);
  }
}

async function processPendingSends() {
  if (!sb || !instanceId) return;
  const tab = await findWaTab();
  if (!tab) return;

  const { data: pending } = await sb
    .from('whatsapp_pending_sends')
    .select('id, phone, message')
    .eq('instance_id', instanceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5);

  for (const row of (pending ?? [])) {
    if (dispatchedSends.has(row.id)) continue;
    dispatchedSends.add(row.id);

    // Timeout de segurança: CS pode morrer (F5 na aba) após responder {queued:true}
    // sem nunca enviar SEND_CONFIRMED/SEND_FAILED. 45s libera para retry.
    const tid = setTimeout(() => {
      if (dispatchedSends.has(row.id)) {
        console.warn('[LiveCRM BG] timeout 45s sem confirmação para send', row.id, '— liberando retry');
        dispatchedSends.delete(row.id);
        dispatchTimeouts.delete(row.id);
      }
    }, 45000);
    dispatchTimeouts.set(row.id, tid);

    console.log('[LiveCRM BG] despachando pending send:', row.id, 'phone:', row.phone);
    try {
      const resp = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'INJECT_SEND',
          sendId: row.id,
          phone: row.phone,
          message: row.message,
        }, (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        });
      });
      console.log('[LiveCRM BG] INJECT_SEND entregue ao content script, resp:', JSON.stringify(resp));
    } catch (e) {
      console.warn('[LiveCRM BG] INJECT_SEND falhou (content script órfão?):', e.message);
      clearTimeout(dispatchTimeouts.get(row.id));
      dispatchTimeouts.delete(row.id);
      dispatchedSends.delete(row.id);
    }
  }
}

async function pingHeartbeat() {
  if (!sb || !instanceId) return;
  await sb.from('pipeline_whatsapp_instances')
    .update({ extension_last_ping: new Date().toISOString() })
    .eq('id', instanceId);
}

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
      if (dispatchedSends.has(id)) return;
      dispatchedSends.add(id);

      const tid = setTimeout(() => {
        if (dispatchedSends.has(id)) {
          console.warn('[LiveCRM BG] Realtime: timeout 45s sem confirmação para send', id, '— liberando retry');
          dispatchedSends.delete(id);
          dispatchTimeouts.delete(id);
        }
      }, 45000);
      dispatchTimeouts.set(id, tid);

      const tab = await findWaTab();
      if (!tab) {
        clearTimeout(tid);
        dispatchTimeouts.delete(id);
        dispatchedSends.delete(id);
        await sb.from('whatsapp_pending_sends')
          .update({ status: 'failed', error: 'WA Web não está aberto' })
          .eq('id', id);
        return;
      }
      console.log('[LiveCRM BG] Realtime pending send:', id, 'phone:', phone);
      chrome.tabs.sendMessage(tab.id, { type: 'INJECT_SEND', sendId: id, phone, message }, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('[LiveCRM BG] Realtime: CS não respondeu:', chrome.runtime.lastError.message);
          clearTimeout(tid);
          dispatchTimeouts.delete(id);
          dispatchedSends.delete(id); // libera retry imediato
        } else {
          console.log('[LiveCRM BG] Realtime: INJECT_SEND entregue ao CS, resp:', JSON.stringify(resp));
        }
      });
    })
    .subscribe();
}

function fiberExtractPhone() {
  // Roda no mundo principal via chrome.scripting — acessa React fiber do WA Web

  function jidFromString(s) {
    if (typeof s !== 'string') return null;
    if (s.includes('@c.us')) {
      const p = s.replace(/@c\.us.*/, '');
      if (window.__livecrm_own_jid && p === window.__livecrm_own_jid) return null;
      return p;
    }
    if (s.includes('@s.whatsapp.net')) {
      const p = s.replace(/@s\.whatsapp\.net.*/, '');
      if (window.__livecrm_own_jid && p === window.__livecrm_own_jid) return null;
      return p;
    }
    return null;
  }

  function extractJid(v) {
    if (!v) return null;
    const fromStr = jidFromString(v);
    if (fromStr) return fromStr;
    if (typeof v === 'object') {
      // Candidatos comuns em objetos JID do WA Web
      const candidates = [
        v._serialized, v.jid,
        v.user && v.server === 'c.us' ? v.user : null,
        v.remote?._serialized, v.to?._serialized,
        v.id?._serialized, v.id?.user,
      ];
      for (const c of candidates) {
        const r = jidFromString(c);
        if (r) return r;
      }
    }
    return null;
  }

  // Varre props até 3 níveis, com fast-path para chaves conhecidas do WA Web
  function scanProps(props) {
    if (!props || typeof props !== 'object' || Array.isArray(props)) return null;
    try {
      // Fast-path: chaves conhecidas de modelos de chat
      for (const key of ['chat', 'chatId', 'jid', 'remoteJid', 'conversationId', 'chatModel']) {
        if (!(key in props)) continue;
        const v = props[key];
        const r = extractJid(v);
        if (r) return r;
      }
      // Varredura genérica (3 níveis)
      const entries = Object.entries(props);
      if (entries.length > 120) return null;
      for (const [, v] of entries) {
        if (typeof v === 'function' || v instanceof Element) continue;
        const r = extractJid(v);
        if (r) return r;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          let sub; try { sub = Object.entries(v); } catch { continue; }
          if (sub.length > 60) continue;
          for (const [, v2] of sub) {
            if (typeof v2 === 'function') continue;
            const r2 = extractJid(v2);
            if (r2) return r2;
            if (v2 && typeof v2 === 'object' && !Array.isArray(v2)) {
              let sub2; try { sub2 = Object.entries(v2); } catch { continue; }
              if (sub2.length > 30) continue;
              for (const [, v3] of sub2) {
                const r3 = extractJid(v3);
                if (r3) return r3;
              }
            }
          }
        }
      }
    } catch {}
    return null;
  }

  // Varre a subárvore fiber (filhos) — JID do contato está nos filhos, não nos ancestrais
  function scanFiberDown(node, depth) {
    if (!node || depth <= 0) return null;
    try {
      const r = scanProps(node.memoizedProps) || scanProps(node.pendingProps);
      if (r) return r;
      let ms = node.memoizedState;
      for (let h = 0; h < 15 && ms; h++, ms = ms?.next) {
        const mv = ms.memoizedState;
        if (!mv) continue;
        const r2 = extractJid(mv);
        if (r2) return r2;
        if (typeof mv === 'object' && !(mv instanceof Element)) {
          const r3 = scanProps(mv);
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

  function searchFiber(startEl) {
    let fk;
    try { fk = Object.keys(startEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps')); }
    catch { return null; }
    if (!fk) return null;

    if (fk.startsWith('__reactProps')) return scanProps(startEl[fk]);

    let f;
    try { f = startEl[fk]; } catch { return null; }

    // Primeiro desce nos filhos — JID do contato fica nos componentes filhos do item
    const downResult = scanFiberDown(f, 20);
    if (downResult) return downResult;

    for (let i = 0; i < 200 && f; i++) {
      try {
        const r1 = scanProps(f.memoizedProps) || scanProps(f.pendingProps);
        if (r1) return r1;

        // memoizedState: lista de hooks (useState, useContext, useReducer)
        let ms = f.memoizedState;
        for (let h = 0; h < 30 && ms; h++, ms = ms?.next) {
          const mv = ms.memoizedState;
          if (!mv) continue;
          const r2 = extractJid(mv);
          if (r2) return r2;
          if (typeof mv === 'object' && !(mv instanceof Element)) {
            const r3 = scanProps(mv);
            if (r3) return r3;
            try {
              const chat = (typeof mv.getActive === 'function' ? mv.getActive() : null)
                || mv.active || mv.activeChat;
              if (chat) {
                const r4 = extractJid(chat.id?._serialized || chat.id || chat.jid);
                if (r4) return r4;
              }
            } catch {}
          }
        }

        if (f.stateNode && typeof f.stateNode === 'object' && !(f.stateNode instanceof Element)) {
          const r5 = scanProps(f.stateNode.props || f.stateNode);
          if (r5) return r5;
        }
      } catch {}
      try { f = f.return; } catch { break; }
    }
    return null;
  }

  // -1. URL: /send?phone=XXXX (quando navegado via extension ou link direto)
  const urlPhone = window.location.search.match(/[?&]phone=(\d{10,15})/)?.[1];
  if (urlPhone && (!window.__livecrm_own_jid || urlPhone !== window.__livecrm_own_jid)) return urlPhone;

  // 0. data-id no item selecionado da sidebar — fonte direta do WA Web, sem fiber
  const sidebarSelectors = [
    '[data-testid="cell-frame-container"][aria-selected="true"]',
    '[role="listitem"][aria-selected="true"]',
    '[tabindex="-1"][aria-selected="true"]',
    '[aria-selected="true"]',
  ];
  for (const sel of sidebarSelectors) {
    for (const el of document.querySelectorAll(sel)) {
      const raw = el.getAttribute('data-id') || '';
      if (raw.includes('@c.us')) return raw.replace(/@c\.us.*/, '');
      if (raw.includes('@s.whatsapp.net')) return raw.replace(/@s\.whatsapp\.net.*/, '');
      const child = el.querySelector('[data-id*="@c.us"]');
      if (child) return child.getAttribute('data-id').replace(/@c\.us.*/, '');
    }
  }

  // 1. Fiber do item selecionado na sidebar — props do contato são diretas aqui
  // (antes do header que sobe até componentes App com JID do próprio usuário)
  const sidebarFiberSels = [
    '[aria-selected="true"]',
    '[data-testid="cell-frame-container"][aria-selected="true"]',
    '[role="listitem"][aria-selected="true"]',
    '[tabindex="-1"][aria-selected="true"]',
  ];
  for (const sel of sidebarFiberSels) {
    for (const el of document.querySelectorAll(sel)) {
      const r = searchFiber(el);
      if (r) return r;
    }
  }

  // 2. Header — profundidade limitada a 25 nós (evita JID do usuário em componentes pai)
  const headerEl = document.querySelector(
    '[data-testid="conversation-header"], #main header, [data-testid="conversation-panel-body"] header'
  );
  if (headerEl) {
    let fkH;
    try { fkH = Object.keys(headerEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps')); } catch {}
    if (fkH) {
      if (fkH.startsWith('__reactProps')) {
        const r = scanProps(headerEl[fkH]);
        if (r) return r;
      } else {
        let fH;
        try { fH = headerEl[fkH]; } catch {}
        for (let i = 0; i < 25 && fH; i++) {
          try {
            const r = scanProps(fH.memoizedProps) || scanProps(fH.pendingProps);
            if (r) return r;
            fH = fH.return;
          } catch { break; }
        }
      }
    }
  }

  // 3. #main diretamente (30 nós)
  const mainEl = document.getElementById('main');
  if (mainEl) {
    const fkMain = Object.keys(mainEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
    if (fkMain) {
      if (fkMain.startsWith('__reactProps')) {
        const r = scanProps(mainEl[fkMain]);
        if (r) return r;
      } else {
        let f = mainEl[fkMain];
        for (let i = 0; i < 30 && f; i++) {
          try {
            const r1 = scanProps(f.memoizedProps) || scanProps(f.pendingProps);
            if (r1) return r1;
            f = f.return;
          } catch { break; }
        }
      }
    }
  }

  // 2. Tenta window.require — sistema de módulos interno do WA Web
  try {
    const moduleIds = [
      'WAWebActiveConversation', 'WAWebConversations', 'WAWebChatListModel',
      'WAWebConversationModel', 'WAWebChat',
    ];
    for (const id of moduleIds) {
      try {
        const mod = window.require(id);
        if (!mod) continue;
        // Tenta getActive(), active, default.getActive(), etc.
        const chat = mod.getActive?.() || mod.active || mod.default?.getActive?.() || mod.default?.active;
        if (chat) {
          const jid = chat.id?._serialized || chat.id?.user || chat.jid;
          const r = extractJid(jid || chat);
          if (r) return r;
        }
        // Tenta find() ou get() com chave de conversa ativa
        const store = mod.default || mod;
        if (typeof store?.get === 'function') {
          const active = document.querySelector('[aria-selected="true"]')?.getAttribute?.('data-id') || '';
          if (active) {
            const entry = store.get(active);
            const r2 = extractJid(entry?.id) || extractJid(entry?.jid);
            if (r2) return r2;
          }
        }
      } catch { /* módulo não encontrado, continua */ }
    }
  } catch { /* window.require não disponível */ }

  // 3. Tenta webpack module cache — WA Web 2026 usa MobX stores acessíveis via __webpack_module_cache__
  try {
    const cache = window.__webpack_module_cache__;
    if (cache) {
      for (const mod of Object.values(cache)) {
        const e = mod?.exports;
        if (!e || typeof e !== 'object') continue;
        for (const v of Object.values(e)) {
          if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
          // Padrão: store com active/getActive retornando objeto com JID
          const chat = (typeof v.getActive === 'function' ? v.getActive() : null)
            || v.active
            || (typeof v.get === 'function' && v.size > 0 ? null : null); // evita iterar Maps grandes
          if (!chat || typeof chat !== 'object') continue;
          const r = extractJid(chat.id?._serialized || chat.id?.user || chat.jid
            || chat.chatId?._serialized || chat.chatId);
          if (r) return r;
        }
      }
    }
  } catch { /* webpack cache inacessível */ }

  // 4. Fallback: telefone anotado via click-tracking no sidebar (wa_hook.js)
  //    data-livecrm-phone é mais confiável que __livecrm_active_phone pois é atualizado no clique
  const annotatedPhone = mainEl?.getAttribute('data-livecrm-phone');
  if (annotatedPhone) {
    const own = window.__livecrm_own_jid;
    if (!own || annotatedPhone !== own) return annotatedPhone;
  }

  // 5. Fallback: último telefone capturado via evento de mensagem ou click-tracking
  if (window.__livecrm_active_phone) {
    const own = window.__livecrm_own_jid;
    if (!own || window.__livecrm_active_phone !== own) return window.__livecrm_active_phone;
  }

  // 5. Diagnóstico — aparece no console da aba do WA Web (MAIN world)
  const el = document.querySelector('[aria-selected="true"]');
  if (!el) {
    console.warn('[LiveCRM Fiber] DIAG: nenhum [aria-selected=true] encontrado');
    return '__debug:no_aria_selected';
  }

  const allKeys = Object.keys(el);
  const fk = allKeys.find(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
  if (!fk) {
    console.warn('[LiveCRM Fiber] DIAG: elemento sem chave React. Keys do elemento:', allKeys.slice(0, 10).join(', '));
    return `__debug:no_react_key|elKeys=${allKeys.slice(0,5).join(',')}`;
  }

  console.warn('[LiveCRM Fiber] DIAG: chave React encontrada:', fk.substring(0, 20), '— varrendo fiber...');

  // Amostra das primeiras chaves de props dos primeiros nós do fiber
  if (fk.startsWith('__reactFiber')) {
    let f = el[fk];
    for (let i = 0; i < 12 && f; i++) {
      const mp = f.memoizedProps;
      if (mp) {
        const keys = Object.keys(mp).slice(0, 10).join(', ');
        const strVals = Object.entries(mp)
          .filter(([, v]) => typeof v === 'string' && v.length > 3 && v.length < 80)
          .map(([k, v]) => `${k}="${v}"`)
          .slice(0, 4)
          .join(', ');
        console.warn(`[LiveCRM Fiber] DIAG: nó[${i}] keys=[${keys}]${strVals ? ' vals=[' + strVals + ']' : ''}`);
      }
      f = f.return;
    }
  }

  return '__debug:fiber_not_found';
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_ACTIVE_PHONE') {
    findWaTab().then(async (tab) => {
      if (!tab) { sendResponse({ phone: null }); return; }
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: fiberExtractPhone,
        });
        const raw = results?.[0]?.result || null;
        if (typeof raw === 'string' && raw.startsWith('__debug:')) {
          console.warn('[LiveCRM BG] fiberExtractPhone debug:', raw);
          sendResponse({ phone: null });
        } else {
          sendResponse({ phone: raw });
        }
      } catch (e) {
        console.warn('[LiveCRM BG] scripting failed:', e.message);
        sendResponse({ phone: null });
      }
    });
    return true;
  } else if (msg.type === 'INBOUND_MESSAGE') {
    console.log('[LiveCRM BG] INBOUND_MESSAGE recebido, phone:', msg.data?.phone, 'sb:', !!sb);
    handleInbound(msg.data).catch(console.error);
  } else if (msg.type === 'OUTBOUND_MESSAGE') {
    handleOutbound(msg.data).catch(console.error);
  } else if (msg.type === 'SEND_CONFIRMED') {
    clearTimeout(dispatchTimeouts.get(msg.sendId));
    dispatchTimeouts.delete(msg.sendId);
    // Mantém no dispatchedSends para prevenir re-despacho em heartbeat antes do DB atualizar
    sb?.from('whatsapp_pending_sends')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', msg.sendId)
      .then(({ error }) => {
        if (error) console.error('[LiveCRM BG] SEND_CONFIRMED DB update failed:', error.message, 'sendId:', msg.sendId);
        else console.log('[LiveCRM BG] send', msg.sendId, 'marcado como sent');
      });
  } else if (msg.type === 'SEND_FAILED') {
    clearTimeout(dispatchTimeouts.get(msg.sendId));
    dispatchTimeouts.delete(msg.sendId);
    dispatchedSends.delete(msg.sendId); // libera retry em caso de falha
    sb?.from('whatsapp_pending_sends')
      .update({ status: 'failed', error: msg.error })
      .eq('id', msg.sendId)
      .then(({ error }) => {
        if (error) console.error('[LiveCRM BG] SEND_FAILED DB update failed:', error.message);
      });
  } else if (msg.type === 'HEARTBEAT') {
    if (sb && instanceId) processPendingSends().catch(console.error);
    else if (!sb) init().catch(console.error);
  } else if (msg.type === 'GET_CLIENT_DATA') {
    handleGetClientData(msg.phone).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'CREATE_CRM_CONTACT') {
    handleCreateCrmContact(msg.phone).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'GET_PIPELINES') {
    handleGetPipelines().then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'CREATE_TICKET') {
    handleCreateTicket(msg.phone, msg.name, msg.pipelineId).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'SAVE_NOTE') {
    handleSaveNote(msg.ticketId, msg.clientId, msg.text).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'SAVE_CONVERSATION') {
    handleSaveConversation(msg.ticketId, msg.clientId, msg.messages).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'SAVE_HISTORY_MESSAGES') {
    handleSaveHistoryMessages(msg.ticketId, msg.clientId, msg.messages).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
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
  } else if (msg.type === 'OPEN_CRM_TICKET') {
    handleOpenCrmTicket(msg.ticketId, _sender.tab?.id).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'OPEN_WA_CHAT') {
    handleOpenWaTab(msg.phone).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'UPDATE_CLIENT_NAME') {
    handleUpdateClientName(msg.clientId, msg.name).then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  } else if (msg.type === 'GET_STATUS') {
    sendResponse({ connected: !!sb, instanceId });
    return true;
  } else if (msg.type === 'LOGIN') {
    handleLogin(msg.email, msg.password).then(sendResponse);
    return true;
  } else if (msg.type === 'LOGOUT') {
    if (rtChannel && sb) sb.removeChannel(rtChannel);
    chrome.storage.local.clear();
    sb = null; instanceId = null; rtChannel = null;
  }
});

let lastSuggestionMsgId = null;
let suggestionPollInterval = null;

async function requestSuggestion(clientId, inboundText, phone, waMessageId) {
  if (!sb) return;
  // Pega o JWT da sessão armazenada
  const stored = await new Promise((res) => chrome.storage.local.get(['session'], res));
  const accessToken = stored.session?.access_token;
  if (!accessToken) return;

  // Notifica o sidebar que a sugestão está sendo gerada
  const waTabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  for (const tab of waTabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'SUGGESTION_PENDING', phone }, () => {
      if (chrome.runtime.lastError) { /* silenciar erro de content script não conectado */ }
    });
  }

  let suggestionId = null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/suggest-wa-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ client_id: clientId, inbound_text: inboundText }),
    });
    if (!resp.ok) { console.warn('[LiveCRM BG] suggest-wa-response error:', resp.status); return; }
    const json = await resp.json();
    suggestionId = json.suggestion_id;
  } catch (e) {
    console.warn('[LiveCRM BG] requestSuggestion fetch error:', e.message);
    return;
  }

  if (!suggestionId) return;

  // Polling a cada 5s por até 60s
  const startTime = Date.now();
  if (suggestionPollInterval) clearInterval(suggestionPollInterval);

  suggestionPollInterval = setInterval(async () => {
    if (Date.now() - startTime > 60_000) {
      clearInterval(suggestionPollInterval);
      suggestionPollInterval = null;
      const tabs2 = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      for (const tab of tabs2) {
        chrome.tabs.sendMessage(tab.id, { type: 'SUGGESTION_TIMEOUT', phone }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
      return;
    }

    try {
      const { data: suggestion } = await sb
        .from('wa_suggestions')
        .select('id, suggested_response, status')
        .eq('id', suggestionId)
        .maybeSingle();

      if (!suggestion || suggestion.status === 'pending') return;

      clearInterval(suggestionPollInterval);
      suggestionPollInterval = null;

      const tabs3 = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      for (const tab of tabs3) {
        chrome.tabs.sendMessage(tab.id, {
          type: suggestion.status === 'done' ? 'SUGGESTION_READY' : 'SUGGESTION_ERROR',
          phone,
          text: suggestion.suggested_response ?? '',
        }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    } catch (e) {
      console.warn('[LiveCRM BG] suggestionPoll error:', e.message);
    }
  }, 5_000);
}

async function handleInbound({ phone, text, mediaUrl, mimetype, waMessageId }) {
  if (!sb || !instanceId) {
    console.warn('[LiveCRM BG] handleInbound abortou: sb=', !!sb, 'instanceId=', !!instanceId);
    if (!sb) {
      // Tenta reinicializar a sessão
      await init();
      if (!sb) { console.warn('[LiveCRM BG] reinit falhou, abandonando mensagem'); return; }
    } else return;
  }
  if (!waMessageId) return;

  const { data: existing } = await sb
    .from('whatsapp_messages')
    .select('id')
    .eq('manychat_message_id', waMessageId)
    .maybeSingle();
  if (existing) return;

  // Gera variações de formato: com/sem DDI 55, com/sem +, sem 9 extra
  const digits = phone.replace(/\D/g, '');
  const variants = new Set([
    digits,
    '+' + digits,
    digits.startsWith('55') ? digits.slice(2) : digits,     // sem DDI
    digits.startsWith('55') ? '+' + digits : '+55' + digits, // normalizado com +
  ]);
  if (digits.startsWith('55') && digits.length === 13) {
    // Remove o 9 extra de celular brasileiro: 55 + DDD(2) + 9 + 8 → 55 + DDD(2) + 8
    variants.add('55' + digits[2] + digits[3] + digits.slice(5));
    variants.add(digits[2] + digits[3] + digits.slice(5)); // sem DDI e sem 9
  }
  const orParts = [...variants].flatMap(v => [`phone.eq.${v}`, `whatsapp.eq.${v}`]).join(',');

  const { data: client } = await sb
    .from('clients')
    .select('id')
    .or(orParts)
    .maybeSingle();

  // Se não encontrou cliente, tenta criar; em race condition re-busca pelo whatsapp
  let clientId = client?.id || null;
  if (!clientId) {
    const phoneLocal = digits.startsWith('55') ? digits.slice(2) : digits;
    const { data: newClient } = await sb.from('clients').insert({
      name: phone,
      phone: phoneLocal,
      whatsapp: digits,
    }).select('id').maybeSingle();
    if (newClient?.id) {
      clientId = newClient.id;
      console.log('[LiveCRM BG] cliente criado para:', phone);
    } else {
      // Race condition: outro processNode já criou — re-busca
      const { data: found } = await sb.from('clients').select('id')
        .or(`whatsapp.eq.${digits},phone.eq.${phoneLocal}`).maybeSingle();
      clientId = found?.id || null;
    }
  }

  const { error: insertErr } = await sb.from('whatsapp_messages').insert({
    client_id: clientId,
    instance_id: instanceId,
    direction: 'inbound',
    message_text: text,
    media_url: mediaUrl || null,
    media_mime_type: mimetype || null,
    sender_phone: phone,
    status: 'received',
    manychat_message_id: waMessageId,
  });
  if (!insertErr) {
    console.log('[LiveCRM BG] mensagem inserida:', waMessageId, 'phone:', phone);
  }
  if (insertErr) {
    if (insertErr.message?.includes('JWT expired')) {
      console.warn('[LiveCRM BG] JWT expirado no insert, refreshing e retentando...');
      await refreshToken();
      if (!sb) return;
      const { error: retryErr } = await sb.from('whatsapp_messages').insert({
        client_id: clientId,
        instance_id: instanceId,
        direction: 'inbound',
        message_text: text,
        media_url: mediaUrl || null,
        media_mime_type: mimetype || null,
        sender_phone: phone,
        status: 'received',
        manychat_message_id: waMessageId,
      });
      if (retryErr) console.error('[LiveCRM] retry insert failed:', retryErr.message, '| phone:', phone);
      return;
    }
    console.error('[LiveCRM] insert inbound failed:', insertErr.message, '| phone:', phone);
  }

  // Solicitar sugestão de resposta para mensagens inbound com texto
  if (clientId && text && text.trim()) {
    const msgKey = waMessageId || (phone + '_' + Date.now());
    if (msgKey !== lastSuggestionMsgId) {
      lastSuggestionMsgId = msgKey;
      requestSuggestion(clientId, text, phone, waMessageId).catch(console.error);
    }
  }
}

async function handleOutbound({ phone, text, waMessageId }) {
  if (!sb || !instanceId || !waMessageId) return;

  // Dedup por waMessageId
  const { data: existing } = await sb
    .from('whatsapp_messages')
    .select('id')
    .eq('manychat_message_id', waMessageId)
    .maybeSingle();
  if (existing) return;

  const digits = phone.replace(/\D/g, '');
  const variants = new Set([
    digits, '+' + digits,
    digits.startsWith('55') ? digits.slice(2) : digits,
    digits.startsWith('55') ? '+' + digits : '+55' + digits,
  ]);
  if (digits.startsWith('55') && digits.length === 13) {
    variants.add('55' + digits[2] + digits[3] + digits.slice(5));
    variants.add(digits[2] + digits[3] + digits.slice(5));
  }
  const orParts = [...variants].flatMap(v => [`phone.eq.${v}`, `whatsapp.eq.${v}`]).join(',');
  const { data: client } = await sb.from('clients').select('id').or(orParts).maybeSingle();
  const clientId = client?.id || null;

  // Se o CRM já salvou essa mensagem (outbound sem waMessageId, texto igual, últimos 90s),
  // apenas atualiza o registro em vez de inserir um duplicado
  const since = new Date(Date.now() - 90000).toISOString();
  const { data: crmSaved } = await sb
    .from('whatsapp_messages')
    .select('id')
    .eq('direction', 'outbound')
    .eq('message_text', text)
    .is('manychat_message_id', null)
    .gte('created_at', since)
    .eq('instance_id', instanceId)
    .limit(1)
    .maybeSingle();

  if (crmSaved) {
    await sb.from('whatsapp_messages')
      .update({ manychat_message_id: waMessageId })
      .eq('id', crmSaved.id);
    console.log('[LiveCRM BG] outbound: vinculado waMessageId a registro CRM existente');
    return;
  }

  // Mensagem enviada diretamente no WA Web — insere nova
  const { error } = await sb.from('whatsapp_messages').insert({
    client_id: clientId,
    instance_id: instanceId,
    direction: 'outbound',
    message_text: text,
    sender_phone: phone,
    status: 'sent',
    manychat_message_id: waMessageId,
  });
  if (error) console.error('[LiveCRM BG] outbound insert error:', error.message);
  else console.log('[LiveCRM BG] outbound salvo:', waMessageId, 'phone:', phone);
}

async function refreshToken() {
  const stored = await getStored(['session']);
  if (!stored.session?.refresh_token) return;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: stored.session.refresh_token }),
  });

  if (!res.ok) {
    console.warn('[LiveCRM BG] refreshToken falhou:', res.status, '— sessão pode estar totalmente expirada');
    return;
  }
  const data = await res.json();
  if (!data.access_token) return;

  const newSession = { ...stored.session, access_token: data.access_token, refresh_token: data.refresh_token || stored.session.refresh_token };
  await setStored({ session: newSession });

  // Recriar cliente com novo token
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.access_token}` } },
  });

  if (rtChannel) {
    sb.removeChannel(rtChannel);
    rtChannel = null;
  }
  subscribeRealtime();
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

chrome.alarms.create('keepalive', { periodInMinutes: 4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    if (!sb) {
      init().catch(console.error);
    } else {
      if (!rtChannel || rtChannel.state !== 'joined') subscribeRealtime();
      pingHeartbeat().catch(console.error);
    }
  } else if (alarm.name === 'token-refresh') {
    refreshToken().catch(console.error);
  }
});

// Processa envios pendentes quando a aba do WA Web termina de carregar (F5 ou abertura)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('https://web.whatsapp.com/')) {
    if (sb && instanceId) {
      // CS antigo foi destruído junto com a aba. Limpa dispatchedSends para
      // que o novo CS receba os envios pendentes sem esperar o timeout de 45s.
      for (const tid of dispatchTimeouts.values()) clearTimeout(tid);
      dispatchTimeouts.clear();
      dispatchedSends.clear();
      console.log('[LiveCRM BG] WA Web recarregou — dispatchedSends limpo, processando pendentes em 6s');
      setTimeout(() => processPendingSends().catch(console.error), 6000);
    }
  }
});

init().catch(console.error);

// ── Handlers da Sidebar ───────────────────────────────────────────────────────

function phoneVariants(phone) {
  const digits = phone.replace(/\D/g, '');
  const variants = new Set([digits, '+' + digits]);
  if (digits.startsWith('55') && digits.length >= 12) {
    variants.add(digits.slice(2));
    if (digits.length === 13) {
      variants.add('55' + digits[2] + digits[3] + digits.slice(5));
      variants.add(digits[2] + digits[3] + digits.slice(5));
    }
  }
  return [...variants];
}

async function handleGetClientData(phone) {
  if (!sb) return { client: null, ticket: null };
  const digits = phone.replace(/\D/g, '');
  const jid = digits + '@s.whatsapp.net';
  const variants = phoneVariants(phone);
  const orParts = [
    `wa_jid.eq.${jid}`,
    ...variants.flatMap(v => [`phone.eq.${v}`, `whatsapp.eq.${v}`]),
  ].join(',');
  const { data: client } = await sb
    .from('clients').select('id, name, whatsapp, phone, wa_jid')
    .or(orParts).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!client) return { client: null, ticket: null };
  // Salva wa_jid se ainda não está registrado — garante lookup direto futuro
  if (!client.wa_jid) {
    sb.from('clients').update({ wa_jid: jid }).eq('id', client.id).then(() => {});
  }

  // Orçamento aguardando aprovação — mostra apenas o número, sem upload de PDF
  let pendingQuotePdf = null;
  if (client.id) {
    const { data: q } = await sb
      .from('quotes')
      .select('id, quote_number')
      .eq('client_id', client.id)
      .eq('status', 'aguardando_aprovacao')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (q) pendingQuotePdf = { quoteId: q.id, quoteNumber: q.quote_number };
  }

  // Contrato gerado mais recente — PD com contract_generated_at preenchido
  let pendingContract = null;
  if (client.id) {
    const { data: sr } = await sb
      .from('service_requests')
      .select('request_number, contract_generated_at')
      .eq('client_id', client.id)
      .eq('document_type', 'pd')
      .not('contract_generated_at', 'is', null)
      .order('contract_generated_at', { ascending: false })
      .limit(1).maybeSingle();
    if (sr) pendingContract = { contractNumber: sr.request_number };
  }

  // Sem embed de pipelines — join embedded causava retorno null silencioso no PostgREST
  const { data: ticket, error: ticketErr } = await sb
    .from('tickets')
    .select('id, pipeline_stage, pipeline_id')
    .eq('client_id', client.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1).maybeSingle();
  if (ticketErr) console.error('[LiveCRM] GET_CLIENT_DATA ticket err:', ticketErr.message);

  let pipelineName = null;
  if (ticket?.pipeline_id) {
    const { data: pl } = await sb.from('pipelines').select('name').eq('id', ticket.pipeline_id).maybeSingle();
    pipelineName = pl?.name || null;
  }

  let stageLabel = ticket?.pipeline_stage || null;
  if (ticket?.pipeline_id && ticket?.pipeline_stage) {
    const { data: stageRow } = await sb
      .from('pipeline_stages').select('label')
      .eq('pipeline_id', ticket.pipeline_id)
      .eq('key', ticket.pipeline_stage).maybeSingle();
    if (stageRow?.label) stageLabel = stageRow.label;
  }

  const ticketOut = ticket ? {
    id: ticket.id,
    pipeline_stage: ticket.pipeline_stage,
    pipeline_id: ticket.pipeline_id,
    pipeline_name: pipelineName,
  } : null;
  return { client, ticket: ticketOut, stageLabel, pendingQuotePdf, pendingContract };
}

async function handleCreateCrmContact(phone) {
  if (!sb) throw new Error('Extensao nao autenticada');
  const digits = phone.replace(/\D/g, '');
  const phoneLocal = digits.startsWith('55') ? digits.slice(2) : digits;
  const { data: existing } = await sb
    .from('clients').select('id')
    .or(`whatsapp.eq.${digits},phone.eq.${phoneLocal}`).maybeSingle();
  if (existing) return { clientId: existing.id };
  const { data: newClient, error } = await sb
    .from('clients').insert({ name: phone, phone: phoneLocal, whatsapp: digits, wa_jid: digits + '@s.whatsapp.net' })
    .select('id').single();
  if (error) throw new Error(error.message);
  return { clientId: newClient.id };
}

async function handleSaveNote(ticketId, clientId, text) {
  if (!sb) throw new Error('Extensao nao autenticada');
  const now = new Date();
  const dateLabel = now.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const { error } = await sb.from('client_service_history').insert({
    client_id: clientId,
    service_date: now.toISOString(),
    problem_reported: text,
    service_status: 'nota',
    created_by: currentUserId || null,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Salva mensagens selecionadas no histórico técnico (client_service_history)
async function handleSaveHistoryMessages(ticketId, clientId, messages) {
  if (!sb) throw new Error('Extensao nao autenticada');
  if (!messages?.length) return { ok: true, saved: 0 };
  const now = new Date();
  const dateLabel = now.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
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

async function handleSaveConversation(ticketId, clientId, messages) {
  if (!sb) throw new Error('Extensao nao autenticada');
  if (!messages?.length) return { ok: true, saved: 0 };
  const summary = messages.map(m => (m.direction === 'outbound' ? '[Eu] ' : '[Cliente] ') + m.text).join('\n');
  const content = '[Conversa WA]\n' + summary;
  if (ticketId) {
    const { error } = await sb.from('ticket_comments').insert({ ticket_id: ticketId, content });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from('client_service_history')
      .insert({ client_id: clientId, service_date: new Date().toISOString(), problem_reported: content, service_status: 'conversa_wa' });
    if (error) throw new Error(error.message);
  }
  return { ok: true, saved: messages.length };
}

async function handleGetPipelines() {
  if (!sb) return { pipelines: [] };
  const { data } = await sb.from('pipelines').select('id, name, slug').order('name');
  return { pipelines: data || [] };
}

async function handleCreateTicket(phone, name, pipelineId) {
  if (!sb) throw new Error('Extensao nao autenticada');
  const digits = phone.replace(/\D/g, '');
  const phoneLocal = digits.startsWith('55') ? digits.slice(2) : digits;

  const assignedTo = currentUserId || null;
  console.log('[LiveCRM] CREATE_TICKET phone:', digits, 'pipeline:', pipelineId);

  // Encontra ou cria cliente
  const { data: existing } = await sb
    .from('clients').select('id')
    .or(`whatsapp.eq.${digits},phone.eq.${phoneLocal}`).maybeSingle();
  let clientId;
  if (existing) {
    clientId = existing.id;
    console.log('[LiveCRM] cliente existente:', clientId);
    if (name && name !== phone) await sb.from('clients').update({ name }).eq('id', clientId);
  } else {
    console.log('[LiveCRM] inserindo novo cliente...');
    const { data: newClient, error } = await sb
      .from('clients').insert({ name: name || phone, phone: phoneLocal, whatsapp: digits, wa_jid: digits + '@s.whatsapp.net' })
      .select('id').single();
    if (error) { console.error('[LiveCRM] ERRO insert cliente:', error.message, error.code); throw new Error(error.message); }
    clientId = newClient.id;
    console.log('[LiveCRM] novo cliente criado:', clientId);
  }

  // Proteção contra duplicata: retorna ticket existente se já houver um aberto
  const { data: existingTicket } = await sb
    .from('tickets').select('id')
    .eq('client_id', clientId).eq('pipeline_id', pipelineId)
    .is('deleted_at', null).neq('status', 'fechado')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existingTicket) {
    console.log('[LiveCRM] ticket já existe:', existingTicket.id, '— retornando sem duplicar');
    return { clientId, ticketId: existingTicket.id };
  }

  // Busca primeira etapa do funil
  const { data: firstStage } = await sb
    .from('pipeline_stages').select('key, label')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true })
    .limit(1).maybeSingle();
  console.log('[LiveCRM] firstStage:', firstStage?.key || 'nenhuma (usando novo)');

  // Cria ticket
  const insertPayload = {
    client_id: clientId,
    pipeline_id: pipelineId,
    pipeline_stage: firstStage?.key || 'novo',
    title: 'Contato via WhatsApp',
    ticket_type: 'pos_venda',
    status: 'aberto',
  };
  if (assignedTo) insertPayload.assigned_to = assignedTo;

  console.log('[LiveCRM] inserindo ticket payload:', JSON.stringify(insertPayload));
  const { error: ticketErr } = await sb.from('tickets').insert(insertPayload);
  if (ticketErr) { console.error('[LiveCRM] ERRO insert ticket:', ticketErr.message, ticketErr.code); throw new Error(ticketErr.message); }
  console.log('[LiveCRM] ticket inserido com sucesso');

  const { data: created } = await sb
    .from('tickets').select('id')
    .eq('client_id', clientId).eq('pipeline_id', pipelineId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  console.log('[LiveCRM] CREATE_TICKET concluído — ticketId:', created?.id || 'null');
  return { clientId, ticketId: created?.id || null };
}

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
    .from('ticket_negotiation_items')
    .select('id, ticket_id, product_id, product_name, unit_price, quantity, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  // normaliza product_name → name para compatibilidade com sidebar
  return { products: (data || []).map(p => ({ ...p, name: p.product_name })) };
}

async function handleSaveTicketProduct(ticketId, productId, name, unitPrice, quantity) {
  if (!sb) throw new Error('Extensão não autenticada');
  if (!ticketId || !name || unitPrice == null) throw new Error('Parâmetros inválidos');
  const { data, error } = await sb
    .from('ticket_negotiation_items')
    .insert({ ticket_id: ticketId, product_id: productId || null, product_name: name, unit_price: unitPrice, quantity: quantity || 1 })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, product: data };
}

async function handleDeleteTicketProduct(productId) {
  if (!sb) throw new Error('Extensão não autenticada');
  const { error } = await sb.from('ticket_negotiation_items').delete().eq('id', productId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ── Abertura de conversa WA Web a partir do CRM ──────────────────────────────
// O CRM chama chrome.runtime.sendMessage(extId, { type:'OPEN_WA_CHAT', phone })
// Este handler foca a aba do WA Web existente e navega até o chat do número.
async function handleUpdateClientName(clientId, name) {
  if (!sb) throw new Error('Extensão não autenticada');
  if (!clientId || !name?.trim()) throw new Error('Parâmetros inválidos');
  const { error } = await sb.from('clients').update({ name: name.trim() }).eq('id', clientId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function handleOpenWaTab(phone) {
  const cleaned = String(phone || '').replace(/\D/g, '');
  if (!cleaned) throw new Error('no phone');
  const waUrl = `https://web.whatsapp.com/send?phone=${cleaned}`;
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await chrome.windows.update(tab.windowId, { focused: true });
    // Navega diretamente para o contato — history.pushState não funciona no WA Web 2026
    await chrome.tabs.update(tab.id, { active: true, url: waUrl });
    return { ok: true };
  } else {
    await chrome.tabs.create({ url: waUrl });
    return { ok: true, opened: true };
  }
}

async function handleOpenCrmTicket(ticketId, senderTabId) {
  const url = 'https://posvenda.liveuni.com.br/crm?open_ticket=' + ticketId;
  const tabs = await chrome.tabs.query({ url: 'https://posvenda.liveuni.com.br/*' });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true, url });
    return { ok: true };
  } else if (senderTabId) {
    await chrome.tabs.update(senderTabId, { url });
    return { ok: true, navigated: true };
  } else {
    await chrome.tabs.create({ url });
    return { ok: true, opened: true };
  }
}

// Mantido para compatibilidade (externally_connectable — chamada direta da página CRM)
chrome.runtime.onMessageExternal.addListener((req, _sender, sendResponse) => {
  if (req.type !== 'OPEN_WA_CHAT') return false;
  const phone = String(req.phone || '').replace(/\D/g, '');
  if (!phone) { sendResponse({ ok: false, reason: 'no phone' }); return true; }
  handleOpenWaTab(phone).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
  return true;
});
