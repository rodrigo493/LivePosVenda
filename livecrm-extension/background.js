importScripts('./lib/supabase-umd.js', './config.js');

let sb = null;
let instanceId = null;
let rtChannel = null;

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

async function init() {
  const stored = await getStored(['session', 'instanceId']);
  if (!stored.session) return;

  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${stored.session.access_token}` } },
  });

  instanceId = stored.instanceId;
  if (!instanceId) {
    const { data } = await sb.from('pipeline_whatsapp_instances')
      .select('id').limit(1).single();
    if (data?.id) {
      instanceId = data.id;
      await setStored({ instanceId });
    }
  }

  if (instanceId) subscribeRealtime();
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
      const tab = await findWaTab();
      if (!tab) {
        await sb.from('whatsapp_pending_sends')
          .update({ status: 'failed', error: 'WA Web não está aberto' })
          .eq('id', id);
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'INJECT_SEND', sendId: id, phone, message });
    })
    .subscribe();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'INBOUND_MESSAGE') {
    handleInbound(msg.data).catch(console.error);
  } else if (msg.type === 'SEND_CONFIRMED') {
    sb?.from('whatsapp_pending_sends')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', msg.sendId)
      .then(() => {});
  } else if (msg.type === 'SEND_FAILED') {
    sb?.from('whatsapp_pending_sends')
      .update({ status: 'failed', error: msg.error })
      .eq('id', msg.sendId)
      .then(() => {});
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
  if (!sb || !instanceId) return;
  if (!waMessageId) return;

  const { data: existing } = await sb
    .from('whatsapp_messages')
    .select('id')
    .eq('manychat_message_id', waMessageId)
    .maybeSingle();
  if (existing) return;

  const phoneWithoutDdi = phone.startsWith('55') && phone.length >= 12
    ? phone.slice(2)
    : phone;
  const { data: client } = await sb
    .from('clients')
    .select('id')
    .or(`phone.eq.${phone},phone.eq.+${phone},phone.eq.${phoneWithoutDdi}`)
    .maybeSingle();

  const { error: insertErr } = await sb.from('whatsapp_messages').insert({
    client_id: client?.id || null,
    instance_id: instanceId,
    direction: 'inbound',
    message_text: text,
    media_url: mediaUrl || null,
    media_mime_type: mimetype || null,
    sender_phone: phone,
    status: 'received',
    manychat_message_id: waMessageId,
  });
  if (insertErr) console.error('[LiveCRM] insert inbound failed:', insertErr.message, '| phone:', phone);
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
    } else if (!rtChannel || rtChannel.state !== 'joined') {
      subscribeRealtime();
    }
  }
});

init().catch(console.error);
