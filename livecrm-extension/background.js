importScripts('./lib/supabase-umd.js', './config.js');

let sb = null;
let instanceId = null;
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

  instanceId = stored.instanceId;
  if (!instanceId) {
    // Decodifica JWT para obter user_id do usuário logado
    let userId = null;
    try {
      const payload = JSON.parse(atob(stored.session.access_token.split('.')[1]));
      userId = payload.sub;
    } catch { /* token inválido */ }

    const query = sb.from('pipeline_whatsapp_instances').select('id').eq('active', true).limit(1);
    const { data } = userId
      ? await query.eq('user_id', userId).maybeSingle()
      : await query.maybeSingle();

    if (data?.id) {
      instanceId = data.id;
      await setStored({ instanceId });
      console.log('[LiveCRM BG] instance encontrada:', instanceId, 'para userId:', userId);
    } else {
      console.warn('[LiveCRM BG] nenhuma instância encontrada para userId:', userId);
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
      chrome.tabs.sendMessage(tab.id, { type: 'INJECT_SEND', sendId: id, phone, message });
    })
    .subscribe();
}

function fiberExtractPhone() {
  // Roda no mundo principal via chrome.scripting — acessa React fiber do WA Web

  function jidFromString(s) {
    if (typeof s !== 'string') return null;
    if (s.includes('@c.us')) return s.replace(/@c\.us.*/, '');
    if (s.includes('@s.whatsapp.net')) return s.replace(/@s\.whatsapp\.net.*/, '');
    return null;
  }

  function extractJid(v) {
    if (!v) return null;
    const fromStr = jidFromString(v);
    if (fromStr) return fromStr;
    if (typeof v === 'object') {
      // Candidatos comuns em objetos JID do WA Web
      const candidates = [
        v._serialized, v.jid, v.id,
        v.user && v.server === 'c.us' ? v.user : null,
        v.remote?._serialized, v.from?._serialized, v.to?._serialized,
        v.id?._serialized, v.id?.user,
      ];
      for (const c of candidates) {
        const r = jidFromString(c);
        if (r) return r;
      }
    }
    return null;
  }

  // Varre TODAS as chaves de um objeto de props procurando JID (1 nível de profundidade)
  function scanProps(props) {
    if (!props || typeof props !== 'object') return null;
    for (const [, v] of Object.entries(props)) {
      const r = extractJid(v);
      if (r) return r;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [, v2] of Object.entries(v)) {
          const r2 = extractJid(v2);
          if (r2) return r2;
        }
      }
    }
    return null;
  }

  function searchFiber(startEl) {
    // Tenta __reactProps primeiro (React 18 — props diretamente no elemento DOM)
    const propsKey = Object.keys(startEl).find(k => k.startsWith('__reactProps'));
    if (propsKey) {
      const r = scanProps(startEl[propsKey]);
      if (r) return r;
    }

    const fiberKey = Object.keys(startEl).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return null;

    let f = startEl[fiberKey];
    for (let i = 0; i < 150 && f; i++) {
      // memoizedProps
      const r1 = scanProps(f.memoizedProps);
      if (r1) return r1;
      // pendingProps
      const r2 = scanProps(f.pendingProps);
      if (r2) return r2;
      // stateNode (componentes de classe guardam state/props aqui)
      if (f.stateNode && typeof f.stateNode === 'object' && !(f.stateNode instanceof Element)) {
        const r3 = scanProps(f.stateNode.props || f.stateNode);
        if (r3) return r3;
      }
      f = f.return;
    }
    return null;
  }

  // 1. Tenta múltiplos seletores de partida via fiber
  const selectors = [
    '[aria-selected="true"]',
    '[data-testid="cell-frame-container"][aria-selected="true"]',
    '[role="listitem"][aria-selected="true"]',
    '[tabindex="-1"][aria-selected="true"]',
  ];

  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const r = searchFiber(el);
      if (r) return r;
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

  // 3. Diagnóstico — aparece no console da aba do WA Web (MAIN world)
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
  } else if (msg.type === 'SEND_CONFIRMED') {
    clearTimeout(dispatchTimeouts.get(msg.sendId));
    dispatchTimeouts.delete(msg.sendId);
    dispatchedSends.delete(msg.sendId);
    sb?.from('whatsapp_pending_sends')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', msg.sendId)
      .then(() => {});
  } else if (msg.type === 'SEND_FAILED') {
    clearTimeout(dispatchTimeouts.get(msg.sendId));
    dispatchTimeouts.delete(msg.sendId);
    dispatchedSends.delete(msg.sendId);
    sb?.from('whatsapp_pending_sends')
      .update({ status: 'failed', error: msg.error })
      .eq('id', msg.sendId)
      .then(() => {});
  } else if (msg.type === 'HEARTBEAT') {
    if (sb && instanceId) processPendingSends().catch(console.error);
    else if (!sb) init().catch(console.error);
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

init().catch(console.error);
