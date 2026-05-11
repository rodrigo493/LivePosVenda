# LiveCRM Extension — 6 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 6 novas features na extensão Chrome LiveCRM WhatsApp: etiquetas visuais, respostas rápidas + sugestões IA com botão "Usar", follow-up reminders, mensagens agendadas, orçamento/PD no sidebar, e tradução automática (DeepL).

**Architecture:** A extensão MV3 tem um service worker (`background.js`) com auth Supabase e chrome APIs, um content script (`content_script.js`) que injeta o sidebar no WhatsApp Web, e `sidebar.css` para estilos. As novas features adicionam message handlers no background, novas funções de painel no content script (padrão imperativo DOM com `mkEl()`), e um CSS redesign completo de 280px verde para 320px dark com laranja.

**Tech Stack:** Chrome Extension MV3, Supabase JS (cliente autenticado via JWT), chrome.storage.local, chrome.alarms, chrome.notifications, DeepL Free API

---

## File Structure

| Arquivo | Modificação |
|---------|-------------|
| `livecrm-extension/manifest.json` | Adicionar `"notifications"` em `permissions`; adicionar `api-free.deepl.com/*` em `host_permissions` |
| `livecrm-extension/background.js` | `processPendingSends` filter; `onAlarm` async + followup; 15 novos message handlers |
| `livecrm-extension/sidebar.css` | Rewrite completo: 320px, dark header, orange accents, novas classes |
| `livecrm-extension/content_script.js` | `injectSidebar` rebuild; `renderSidebarData` refactor; 8 novas funções de painel/seção; `injectLabelBadges`; `injectTranslateButtons` |
| `livecrm-extension/popup.html` | Seção config chave DeepL |
| `livecrm-extension/popup.js` | Save/load chave DeepL |

---

## Task 1: Schema + Manifest + processPendingSends filter

**Files:**
- Modify: `livecrm-extension/manifest.json`
- Modify: `livecrm-extension/background.js:86-92`
- Migration SQL: Supabase dashboard

- [ ] **Step 1: Aplicar migration no Supabase**

No Supabase Dashboard → SQL Editor, execute:
```sql
ALTER TABLE whatsapp_pending_sends
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;
```

Verificar: `SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_pending_sends' AND column_name = 'scheduled_at';` — deve retornar 1 linha.

- [ ] **Step 2: Adicionar `notifications` e DeepL host ao manifest**

Em `livecrm-extension/manifest.json`, substituir:
```json
"permissions": ["storage", "alarms", "scripting", "tabs", "windows"],
"host_permissions": ["https://web.whatsapp.com/*", "https://posvenda.liveuni.com.br/*"],
```
por:
```json
"permissions": ["storage", "alarms", "scripting", "tabs", "windows", "notifications"],
"host_permissions": ["https://web.whatsapp.com/*", "https://posvenda.liveuni.com.br/*", "https://api-free.deepl.com/*"],
```

- [ ] **Step 3: Corrigir `processPendingSends` para respeitar `scheduled_at`**

Em `livecrm-extension/background.js`, substituir as linhas 86-92:
```javascript
  const { data: pending } = await sb
    .from('whatsapp_pending_sends')
    .select('id, phone, message')
    .eq('instance_id', instanceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5);
```
por:
```javascript
  const now = new Date().toISOString();
  const { data: pending } = await sb
    .from('whatsapp_pending_sends')
    .select('id, phone, message')
    .eq('instance_id', instanceId)
    .eq('status', 'pending')
    .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(5);
```

- [ ] **Step 4: Testar**

1. Recarregar extensão em `chrome://extensions` → Load unpacked → `livecrm-extension/`
2. Extensions → LiveCRM → Details → Permissions deve listar "Display notifications"
3. Inserir row com `scheduled_at` 2 horas no futuro no Supabase e verificar que o heartbeat NÃO a despacha (console SW: nenhum log "despachando pending send" para ela)

- [ ] **Step 5: Commit**
```bash
git add livecrm-extension/manifest.json livecrm-extension/background.js
git commit -m "feat(ext): notifications permission + DeepL host + scheduled_at filter in processPendingSends"
```

---

## Task 2: Background handlers — etiquetas + quick replies

**Files:**
- Modify: `livecrm-extension/background.js` (antes do handler `LOGOUT`)

- [ ] **Step 1: Adicionar 8 handlers ao onMessage listener**

Em `livecrm-extension/background.js`, substituir:
```javascript
  } else if (msg.type === 'LOGOUT') {
```
por:
```javascript
  } else if (msg.type === 'GET_CONTACT_LABEL') {
    const s = await getStored([`label_${msg.phone}`]);
    sendResponse(s[`label_${msg.phone}`] || null);
    return true;
  } else if (msg.type === 'SET_CONTACT_LABEL') {
    if (msg.label) {
      await setStored({ [`label_${msg.phone}`]: msg.label });
    } else {
      await new Promise(r => chrome.storage.local.remove([`label_${msg.phone}`], r));
    }
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === 'GET_CUSTOM_LABELS') {
    const s = await getStored(['custom_labels']);
    sendResponse(s.custom_labels || []);
    return true;
  } else if (msg.type === 'SAVE_CUSTOM_LABEL') {
    const s = await getStored(['custom_labels']);
    const labels = s.custom_labels || [];
    const newLabel = { id: Date.now().toString(), name: msg.name, color: msg.color, bg: msg.bg };
    await setStored({ custom_labels: [...labels, newLabel] });
    sendResponse(newLabel);
    return true;
  } else if (msg.type === 'DELETE_CUSTOM_LABEL') {
    const s = await getStored(['custom_labels']);
    const labels = (s.custom_labels || []).filter(l => l.id !== msg.id);
    await setStored({ custom_labels: labels });
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === 'GET_QUICK_REPLIES') {
    const s = await getStored(['quick_replies']);
    sendResponse(s.quick_replies || []);
    return true;
  } else if (msg.type === 'SAVE_QUICK_REPLY') {
    const s = await getStored(['quick_replies']);
    const replies = s.quick_replies || [];
    const newReply = { id: Date.now().toString(), title: msg.title, body: msg.body };
    await setStored({ quick_replies: [...replies, newReply] });
    sendResponse(newReply);
    return true;
  } else if (msg.type === 'DELETE_QUICK_REPLY') {
    const s = await getStored(['quick_replies']);
    const replies = (s.quick_replies || []).filter(r => r.id !== msg.id);
    await setStored({ quick_replies: replies });
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === 'LOGOUT') {
```

- [ ] **Step 2: Testar no console do service worker**

```javascript
// SET + GET label
chrome.runtime.sendMessage({type:'SET_CONTACT_LABEL', phone:'5511999999999', label:{id:'preset_yellow', name:'Follow-up', color:'#92400e', bg:'#fef3c7'}}, r => console.log('SET:', r));
// Expected: {ok: true}
chrome.runtime.sendMessage({type:'GET_CONTACT_LABEL', phone:'5511999999999'}, r => console.log('GET:', JSON.stringify(r)));
// Expected: {"id":"preset_yellow","name":"Follow-up","color":"#92400e","bg":"#fef3c7"}

// SAVE + GET quick reply
chrome.runtime.sendMessage({type:'SAVE_QUICK_REPLY', title:'Ola', body:'Ola, tudo bem?'}, r => console.log('SAVE:', JSON.stringify(r)));
chrome.runtime.sendMessage({type:'GET_QUICK_REPLIES'}, r => console.log('REPLIES:', JSON.stringify(r)));
// Expected: array com 1 item
```

- [ ] **Step 3: Commit**
```bash
git add livecrm-extension/background.js
git commit -m "feat(ext): background handlers for etiquetas (labels) and quick replies"
```

---

## Task 3: Background handlers — follow-up alarms + notifications

**Files:**
- Modify: `livecrm-extension/background.js` (2 locais)

- [ ] **Step 1: Adicionar 3 handlers de follow-up ao onMessage**

Em `livecrm-extension/background.js`, substituir (após o `DELETE_QUICK_REPLY` do Task 2):
```javascript
  } else if (msg.type === 'LOGOUT') {
```
por:
```javascript
  } else if (msg.type === 'SET_FOLLOWUP_REMINDER') {
    const s = await getStored(['followups']);
    const followups = s.followups || [];
    const fu = {
      id: Date.now().toString(),
      phone: msg.phone,
      contactName: msg.contactName,
      dueAt: msg.dueAt,
      note: msg.note || '',
    };
    await setStored({ followups: [...followups, fu] });
    chrome.alarms.create('followup_' + fu.id, { when: Date.parse(msg.dueAt) });
    sendResponse(fu);
    return true;
  } else if (msg.type === 'GET_FOLLOWUP_REMINDERS') {
    const s = await getStored(['followups']);
    const all = s.followups || [];
    sendResponse(all.filter(f => f.phone === msg.phone));
    return true;
  } else if (msg.type === 'DELETE_FOLLOWUP_REMINDER') {
    const s = await getStored(['followups']);
    const followups = (s.followups || []).filter(f => f.id !== msg.id);
    await setStored({ followups });
    chrome.alarms.clear('followup_' + msg.id);
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === 'LOGOUT') {
```

- [ ] **Step 2: Tornar `onAlarm` async e adicionar handler de followup**

Em `livecrm-extension/background.js`, substituir:
```javascript
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
```
por:
```javascript
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'keepalive') {
    if (!sb) {
      init().catch(console.error);
    } else {
      if (!rtChannel || rtChannel.state !== 'joined') subscribeRealtime();
      pingHeartbeat().catch(console.error);
    }
  } else if (alarm.name === 'token-refresh') {
    refreshToken().catch(console.error);
  } else if (alarm.name.startsWith('followup_')) {
    const id = alarm.name.replace('followup_', '');
    const s = await getStored(['followups']);
    const fu = (s.followups || []).find(f => f.id === id);
    if (fu) {
      chrome.notifications.create('followup_notif_' + id, {
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Follow-up: ' + fu.contactName,
        message: fu.note || 'Hora de retornar a conversa!',
        buttons: [{ title: 'Abrir WhatsApp' }],
      });
    }
  }
});
```

- [ ] **Step 3: Testar alarm + notificacao**

No console do service worker:
```javascript
const dueAt = new Date(Date.now() + 20000).toISOString();
chrome.runtime.sendMessage({type:'SET_FOLLOWUP_REMINDER', phone:'5511999999999', contactName:'Joao Silva', dueAt, note:'Demo'}, r => console.log('SET:', JSON.stringify(r)));
// Aguardar 20s — notificacao Chrome deve aparecer com "Follow-up: Joao Silva"
chrome.runtime.sendMessage({type:'GET_FOLLOWUP_REMINDERS', phone:'5511999999999'}, r => {
  chrome.runtime.sendMessage({type:'DELETE_FOLLOWUP_REMINDER', id: r[0].id}, res => console.log('DEL:', res));
});
```

- [ ] **Step 4: Commit**
```bash
git add livecrm-extension/background.js
git commit -m "feat(ext): follow-up reminder handlers — chrome.alarms + chrome.notifications"
```

---

## Task 4: Background handlers — scheduled messages + orc/PD + translate

**Files:**
- Modify: `livecrm-extension/background.js`

- [ ] **Step 1: Adicionar 8 handlers finais ao onMessage**

Em `livecrm-extension/background.js`, substituir (apos `DELETE_FOLLOWUP_REMINDER`):
```javascript
  } else if (msg.type === 'LOGOUT') {
```
por:
```javascript
  } else if (msg.type === 'SCHEDULE_MESSAGE') {
    if (!sb) { sendResponse({ error: 'not_connected' }); return true; }
    const { data, error } = await sb.from('whatsapp_pending_sends').insert({
      instance_id: instanceId,
      phone: msg.phone,
      message: msg.message,
      scheduled_at: msg.scheduledAt,
      status: 'pending',
      created_at: new Date().toISOString(),
    }).select('id, scheduled_at').single();
    sendResponse(error ? { error: error.message } : { ok: true, id: data.id });
    return true;
  } else if (msg.type === 'GET_SCHEDULED_MESSAGES') {
    if (!sb) { sendResponse({ data: [] }); return true; }
    const nowStr = new Date().toISOString();
    const { data } = await sb.from('whatsapp_pending_sends')
      .select('id, message, scheduled_at')
      .eq('instance_id', instanceId)
      .eq('phone', msg.phone)
      .eq('status', 'pending')
      .not('scheduled_at', 'is', null)
      .gt('scheduled_at', nowStr)
      .order('scheduled_at', { ascending: true });
    sendResponse({ data: data || [] });
    return true;
  } else if (msg.type === 'CANCEL_SCHEDULED_MESSAGE') {
    if (!sb) { sendResponse({ error: 'not_connected' }); return true; }
    await sb.from('whatsapp_pending_sends').update({ status: 'cancelled' }).eq('id', msg.id);
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === 'GET_ORC_PD') {
    if (!sb) { sendResponse({ quotes: [], proposals: [] }); return true; }
    const jid = msg.phone + '@s.whatsapp.net';
    const { data: client } = await sb.from('clients')
      .select('id')
      .or(`wa_jid.eq.${jid},phone.eq.${msg.phone}`)
      .maybeSingle();
    if (!client) { sendResponse({ quotes: [], proposals: [] }); return true; }
    const [qRes, pRes] = await Promise.all([
      sb.from('quotes')
        .select('id, name, total_value, status')
        .eq('client_id', client.id)
        .is('document_type', null)
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(3),
      sb.from('quotes')
        .select('id, name, total_value, status')
        .eq('client_id', client.id)
        .eq('document_type', 'PD')
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(3),
    ]);
    sendResponse({ quotes: qRes.data || [], proposals: pRes.data || [] });
    return true;
  } else if (msg.type === 'REQUEST_SUGGESTION') {
    if (msg.clientId) {
      requestSuggestion(msg.clientId, '', msg.phone, null).catch(console.error);
    }
    return false;
  } else if (msg.type === 'TRANSLATE_TEXT') {
    const stored = await getStored(['deepl_key']);
    const apiKey = stored.deepl_key;
    if (!apiKey) { sendResponse({ error: 'no_api_key' }); return true; }
    try {
      const res = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: [msg.text], target_lang: msg.targetLang || 'PT' }),
      });
      const json = await res.json();
      sendResponse({ translated: json.translations?.[0]?.text || '' });
    } catch (e) {
      sendResponse({ error: e.message });
    }
    return true;
  } else if (msg.type === 'SAVE_DEEPL_KEY') {
    await setStored({ deepl_key: msg.key });
    sendResponse({ ok: true });
    return true;
  } else if (msg.type === 'GET_DEEPL_KEY') {
    const s = await getStored(['deepl_key']);
    sendResponse({ key: s.deepl_key || '' });
    return true;
  } else if (msg.type === 'LOGOUT') {
```

- [ ] **Step 2: Testar scheduled messages**

No console do service worker:
```javascript
const twoH = new Date(Date.now() + 7200000).toISOString();
chrome.runtime.sendMessage({type:'SCHEDULE_MESSAGE', phone:'5511999999999', message:'Teste agendado', scheduledAt: twoH}, r => console.log('SCHEDULE:', JSON.stringify(r)));
// Expected: {ok: true, id: "uuid"}
chrome.runtime.sendMessage({type:'GET_SCHEDULED_MESSAGES', phone:'5511999999999'}, r => console.log('LIST:', JSON.stringify(r)));
// Expected: {data: [{id, message, scheduled_at}]}
```

Verificar no Supabase: `SELECT id, phone, message, scheduled_at, status FROM whatsapp_pending_sends WHERE scheduled_at IS NOT NULL ORDER BY created_at DESC LIMIT 5;`

- [ ] **Step 3: Commit**
```bash
git add livecrm-extension/background.js
git commit -m "feat(ext): background handlers — scheduled messages, orc/PD, translate, REQUEST_SUGGESTION"
```

---

## Task 5: Sidebar CSS — rewrite completo

**Files:**
- Modify: `livecrm-extension/sidebar.css` (rewrite total)

- [ ] **Step 1: Substituir sidebar.css inteiro**

Escrever o arquivo completo (320px, dark #111827, orange #f97316):

```css
#livecrm-toggle {
  position: fixed;
  bottom: 80px;
  right: 0;
  z-index: 99999;
  background: #f97316;
  color: #fff;
  border: none;
  border-radius: 8px 0 0 8px;
  padding: 10px 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  writing-mode: vertical-rl;
  letter-spacing: 1px;
  box-shadow: -2px 0 8px rgba(0,0,0,.25);
  transition: background .15s;
}
#livecrm-toggle:hover { background: #ea6c00; }

#livecrm-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 320px;
  height: 100vh;
  z-index: 99998;
  background: #fff;
  border-left: 1px solid #e5e7eb;
  box-shadow: -4px 0 16px rgba(0,0,0,.12);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  transform: translateX(100%);
  transition: transform .2s ease;
}
#livecrm-panel.open { transform: translateX(0); }

#livecrm-panel-header {
  background: #111827;
  color: #fff;
  padding: 12px 14px;
  flex-shrink: 0;
}
#livecrm-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.lcrm-action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 8px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.lcrm-action-btn {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 7px 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  color: #374151;
  transition: background .1s, border-color .1s;
  text-align: center;
}
.lcrm-action-btn:hover { background: #f3f4f6; border-color: #d1d5db; }
.lcrm-action-btn.active { background: #fff7ed; border-color: #f97316; color: #c2410c; }

.lcrm-action-panel {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  animation: lcrm-fadein .15s ease;
}
@keyframes lcrm-fadein {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.lcrm-action-panel-header {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: #6b7280;
  padding: 6px 10px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}
.lcrm-action-panel-body { padding: 10px; }

.lcrm-orc-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  border: 1px solid transparent;
  transition: border-color .1s;
}
.lcrm-orc-card:hover { border-color: #f97316; }
.lcrm-orc-card-info { flex: 1; min-width: 0; }
.lcrm-orc-card-name {
  font-size: 11px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lcrm-orc-card-value { font-size: 10px; color: #6b7280; }
.lcrm-orc-status {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 20px;
}

.lcrm-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 20px;
  padding: 3px 8px;
  font-size: 10px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color .1s;
}
.lcrm-chip.selected { border-color: #f97316; }
.lcrm-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.lcrm-label-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 20px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 600;
}

.lcrm-ai-card {
  background: #faf5ff;
  border: 1px solid #e9d5ff;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 6px;
}
.lcrm-ai-card p { font-size: 11px; color: #111827; margin: 0 0 6px; line-height: 1.5; }
.lcrm-ai-use-btn {
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 10px;
  cursor: pointer;
  font-weight: 600;
}
.lcrm-ai-use-btn:hover { background: #6d28d9; }

.lcrm-reply-template {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 4px;
}
.lcrm-reply-title { font-size: 11px; font-weight: 600; color: #374151; }
.lcrm-reply-body {
  font-size: 10px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.lcrm-fp-pickers { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.lcrm-fp-picker {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  padding: 3px 9px;
  font-size: 10px;
  cursor: pointer;
  transition: background .1s, border-color .1s;
}
.lcrm-fp-picker:hover, .lcrm-fp-picker.active {
  background: #fff7ed;
  border-color: #f97316;
  color: #c2410c;
}

.lcrm-translate-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 9px;
  cursor: pointer;
  color: #166534;
  margin-left: 4px;
  transition: background .1s;
}
.lcrm-translate-btn:hover { background: #dcfce7; }
.lcrm-translate-result {
  font-size: 10px;
  color: #166534;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 4px;
  padding: 4px 6px;
  margin-top: 4px;
  font-style: italic;
}

.lcrm-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  box-sizing: border-box;
  margin-bottom: 6px;
}
.lcrm-input:focus { outline: none; border-color: #f97316; }
.lcrm-textarea {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px;
  font-size: 12px;
  resize: vertical;
  min-height: 72px;
  font-family: inherit;
  box-sizing: border-box;
  margin-bottom: 6px;
}
.lcrm-textarea:focus { outline: none; border-color: #f97316; }

.lcrm-btn {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  transition: background .15s;
  box-sizing: border-box;
}
.lcrm-btn-primary  { background: #f97316; color: #fff; border-color: #f97316; }
.lcrm-btn-primary:hover:not(:disabled)  { background: #ea6c00; }
.lcrm-btn-secondary { background: #fff; color: #374151; }
.lcrm-btn-secondary:hover:not(:disabled) { background: #f3f4f6; }
.lcrm-btn:disabled { opacity: .5; cursor: not-allowed; }

.lcrm-sub-label {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: .4px;
  color: #9ca3af;
  margin-bottom: 4px;
}
.lcrm-selected-bar {
  margin-top: 6px;
  padding: 4px 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: #c2410c;
}
.lcrm-selected-bar button {
  background: none;
  border: none;
  color: #dc2626;
  font-size: 10px;
  cursor: pointer;
}

.lcrm-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
.lcrm-label { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; margin-bottom: 2px; }
.lcrm-value { font-weight: 600; color: #111827; }
.lcrm-badge { display: inline-block; border-radius: 20px; padding: 2px 8px; font-size: 11px; font-weight: 600; margin-top: 4px; }
.lcrm-badge-green { background: #d1fae5; color: #065f46; }
.lcrm-msg { color: #6b7280; font-size: 12px; text-align: center; padding: 24px 0; }
.lcrm-msg.error { color: #dc2626; }
.lcrm-phone { font-size: 11px; color: #6b7280; margin-top: 2px; }
```

- [ ] **Step 2: Testar CSS**

Recarregar extensao → abrir WhatsApp Web → botao CRM deve ser laranja, painel 320px.

- [ ] **Step 3: Commit**
```bash
git add livecrm-extension/sidebar.css
git commit -m "style(ext): full sidebar redesign — 320px, dark #111827 header, orange #f97316 theme"
```

---

## Task 6: Sidebar structure rebuild (layout C)

**Files:**
- Modify: `livecrm-extension/content_script.js`

- [ ] **Step 1: Adicionar variaveis de estado**

Em `content_script.js`, apos a linha `let currentSuggestionState = 'idle';`, adicionar:
```javascript
let currentPanelActive = null; // null | 'etiqueta' | 'resposta' | 'followup' | 'agendar'
let sidebarCurrentLabel = null; // { id, name, color, bg } | null
```

- [ ] **Step 2: Reconstruir `injectSidebar()`**

Substituir a funcao inteira `function injectSidebar() {` ate seu `}` de fechamento (linhas 661-769):

```javascript
function injectSidebar() {
  if (document.getElementById('livecrm-toggle')) return;

  const toggle = document.createElement('button');
  toggle.id = 'livecrm-toggle';
  toggle.textContent = 'CRM';
  Object.assign(toggle.style, {
    position: 'fixed', bottom: '80px', right: '0', zIndex: '2147483647',
    background: '#f97316', color: '#fff', border: 'none',
    borderRadius: '8px 0 0 8px', padding: '10px 8px', fontSize: '11px',
    fontWeight: '700', cursor: 'pointer', writingMode: 'vertical-rl',
    letterSpacing: '1px', boxShadow: '-2px 0 8px rgba(0,0,0,.25)',
    fontFamily: 'sans-serif', lineHeight: '1.2',
  });
  document.documentElement.appendChild(toggle);

  const panel = document.createElement('div');
  panel.id = 'livecrm-panel';
  Object.assign(panel.style, {
    position: 'fixed', top: '0', right: '0', width: '320px', height: '100vh',
    zIndex: '2147483646', background: '#fff', borderLeft: '1px solid #e5e7eb',
    boxShadow: '-4px 0 16px rgba(0,0,0,.12)', display: 'flex', flexDirection: 'column',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    fontSize: '13px', transform: 'translateX(100%)', transition: 'transform .2s ease',
    boxSizing: 'border-box',
  });

  // Header dark
  const hdr = document.createElement('div');
  hdr.id = 'livecrm-panel-header';
  Object.assign(hdr.style, {
    background: '#111827', color: '#fff', padding: '12px 14px', flexShrink: '0',
  });

  const hdrTop = document.createElement('div');
  Object.assign(hdrTop.style, {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px',
  });

  const logo = document.createElement('img');
  logo.src = chrome.runtime.getURL('icon128.png');
  logo.alt = 'Live';
  Object.assign(logo.style, { height: '22px', objectFit: 'contain' });

  const closeBtn = document.createElement('button');
  closeBtn.id = 'livecrm-close'; closeBtn.title = 'Fechar'; closeBtn.textContent = 'x';
  Object.assign(closeBtn.style, {
    background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
    fontSize: '16px', padding: '0', lineHeight: '1', opacity: '.7',
  });
  hdrTop.appendChild(logo);
  hdrTop.appendChild(closeBtn);

  const contactRow = document.createElement('div');
  contactRow.id = 'livecrm-header-contact';
  Object.assign(contactRow.style, { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' });

  const nameEl = document.createElement('span');
  nameEl.id = 'livecrm-header-name';
  Object.assign(nameEl.style, { fontWeight: '700', fontSize: '14px', color: '#fff' });
  nameEl.textContent = '...';

  const labelBadgeEl = document.createElement('span');
  labelBadgeEl.id = 'livecrm-header-label-badge';
  labelBadgeEl.style.display = 'none';

  const phoneEl = document.createElement('div');
  phoneEl.id = 'livecrm-header-phone';
  Object.assign(phoneEl.style, { fontSize: '11px', color: '#9ca3af', width: '100%', marginTop: '1px' });

  contactRow.appendChild(nameEl);
  contactRow.appendChild(labelBadgeEl);
  contactRow.appendChild(phoneEl);
  hdr.appendChild(hdrTop);
  hdr.appendChild(contactRow);

  const body = document.createElement('div');
  body.id = 'livecrm-panel-body';
  Object.assign(body.style, {
    flex: '1', overflowY: 'auto', padding: '12px',
    display: 'flex', flexDirection: 'column', gap: '10px',
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
```

- [ ] **Step 3: Reconstruir `renderSidebarData()`**

Substituir a funcao inteira `function renderSidebarData(phone, { client, ticket, stageLabel, pendingQuotePdf, pendingContract }) {` ate seu `}` final:

```javascript
function renderSidebarData(phone, { client, ticket, stageLabel, pendingQuotePdf, pendingContract }) {
  const waName = getContactName();
  const validWaName = waName && !isStatusString(waName) && waName !== phone ? waName : null;
  const validDbName = client.name && !isStatusString(client.name) && client.name !== phone ? client.name : null;
  const displayName = validWaName || validDbName || phone;

  const headerNameEl = document.getElementById('livecrm-header-name');
  const headerPhoneEl = document.getElementById('livecrm-header-phone');
  if (headerNameEl) headerNameEl.textContent = displayName;
  if (headerPhoneEl) headerPhoneEl.textContent = phone;

  if (phone !== currentSuggestionPhone) {
    currentSuggestionState = 'idle';
    currentSuggestionText = '';
    currentPanelActive = null;
    sidebarCurrentLabel = null;
    sendToBackground({ type: 'GET_CONTACT_LABEL', phone }).then(label => {
      sidebarCurrentLabel = label;
      updateHeaderLabelBadge();
    });
  }

  const body = document.getElementById('livecrm-panel-body');
  if (!body) return;
  body.textContent = '';

  // 1. Contact name row (with inline edit)
  const nameWrap = mkEl('div'); nameWrap.style.marginBottom = '10px';
  nameWrap.appendChild(mkEl('div', 'lcrm-label', 'CONTATO'));
  const nameRow = mkEl('div');
  Object.assign(nameRow.style, { display: 'flex', alignItems: 'center', gap: '6px' });
  const nameVal = mkEl('div');
  nameVal.textContent = displayName;
  Object.assign(nameVal.style, { fontWeight: '600', color: '#111827', fontSize: '14px', flex: '1' });
  const editBtn = mkEl('button');
  editBtn.title = 'Editar nome'; editBtn.textContent = 'Editar';
  Object.assign(editBtn.style, { background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#6b7280', padding: '0', lineHeight: '1', flexShrink: '0' });
  nameRow.appendChild(nameVal); nameRow.appendChild(editBtn);
  nameWrap.appendChild(nameRow);

  const nameEditRow = mkEl('div');
  Object.assign(nameEditRow.style, { display: 'none', gap: '4px', marginTop: '4px' });
  const nameInput = document.createElement('input');
  nameInput.type = 'text'; nameInput.value = validWaName || validDbName || '';
  nameInput.className = 'lcrm-input'; nameInput.style.marginBottom = '0'; nameInput.style.flex = '1';
  const saveNameBtn = mkEl('button', 'lcrm-btn lcrm-btn-primary', 'Ok');
  Object.assign(saveNameBtn.style, { width: 'auto', padding: '5px 10px', fontSize: '13px' });
  const cancelNameBtn = mkEl('button', 'lcrm-btn lcrm-btn-secondary', 'X');
  Object.assign(cancelNameBtn.style, { width: 'auto', padding: '5px 8px', fontSize: '13px' });
  nameEditRow.appendChild(nameInput); nameEditRow.appendChild(saveNameBtn); nameEditRow.appendChild(cancelNameBtn);
  nameWrap.appendChild(nameEditRow);
  body.appendChild(nameWrap);

  editBtn.addEventListener('click', () => { nameRow.style.display = 'none'; nameEditRow.style.display = 'flex'; nameInput.focus(); nameInput.select(); });
  const cancelEdit = () => { nameEditRow.style.display = 'none'; nameRow.style.display = 'flex'; };
  cancelNameBtn.addEventListener('click', cancelEdit);
  const saveName = async () => {
    const newName = nameInput.value.trim();
    if (!newName || newName === nameVal.textContent) { cancelEdit(); return; }
    saveNameBtn.disabled = true;
    try {
      await sendToBackground({ type: 'UPDATE_CLIENT_NAME', clientId: client.id, name: newName });
      nameVal.textContent = newName; client.name = newName; cancelEdit();
    } catch (e) { alert('Erro ao salvar: ' + e.message); }
    finally { saveNameBtn.disabled = false; }
  };
  saveNameBtn.addEventListener('click', saveName);
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') cancelEdit();
  });

  // 2. Funil / Etapa section
  renderFunilSection(body, ticket, stageLabel, phone, displayName, client);

  // 3. Orc / PD section
  renderOrcPdSection(body, phone);

  // 4. 2x2 Action grid + expandable panel
  renderActionGrid(body, phone, client, ticket);

  // 5. Notes (collapsible)
  renderNotesSection(body, ticket, client);

  // Show suggestion state if any
  renderSuggestionPanel();
}
```

- [ ] **Step 4: Adicionar as funcoes de secao apos `renderSidebarData`**

Logo apos o `}` de fechamento de `renderSidebarData`, adicionar as seguintes funcoes:

```javascript
function renderFunilSection(body, ticket, stageLabel, phone, displayName, client) {
  if (ticket) {
    const stageWrap = mkEl('div'); stageWrap.style.marginBottom = '10px';
    stageWrap.appendChild(mkEl('div', 'lcrm-label', 'FUNIL / ETAPA'));
    const pname = mkEl('div');
    pname.textContent = ticket.pipeline_name || '';
    Object.assign(pname.style, { fontSize: '11px', color: '#6b7280', marginBottom: '4px' });
    stageWrap.appendChild(pname);
    const stageSelect = styledSelect([{ value: ticket.pipeline_stage, label: stageLabel || ticket.pipeline_stage }]);
    stageSelect.style.marginBottom = '4px';
    stageWrap.appendChild(stageSelect);
    const stageFeedback = mkEl('div');
    Object.assign(stageFeedback.style, { fontSize: '11px', minHeight: '16px', color: '#065f46' });
    stageWrap.appendChild(stageFeedback);
    sendToBackground({ type: 'GET_PIPELINE_STAGES', pipelineId: ticket.pipeline_id }).then(resp => {
      stageSelect.textContent = '';
      (resp.stages || []).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.key; opt.textContent = s.label;
        if (s.key === ticket.pipeline_stage) opt.selected = true;
        stageSelect.appendChild(opt);
      });
    }).catch(() => {});
    stageSelect.addEventListener('change', async () => {
      const newStage = stageSelect.value;
      if (newStage === ticket.pipeline_stage) return;
      stageSelect.disabled = true;
      stageFeedback.textContent = 'Movendo...'; stageFeedback.style.color = '#6b7280';
      try {
        await sendToBackground({ type: 'MOVE_STAGE', ticketId: ticket.id, pipelineId: ticket.pipeline_id, newStage, previousStage: ticket.pipeline_stage });
        ticket.pipeline_stage = newStage;
        stageFeedback.textContent = 'Movido'; stageFeedback.style.color = '#065f46';
        setTimeout(() => { stageFeedback.textContent = ''; }, 2000);
      } catch {
        stageSelect.value = ticket.pipeline_stage;
        stageFeedback.textContent = 'Falha ao mover'; stageFeedback.style.color = '#dc2626';
        setTimeout(() => { stageFeedback.textContent = ''; }, 2000);
      } finally { stageSelect.disabled = false; }
    });
    body.appendChild(stageWrap);
    const openBtn = styledBtn('Abrir no CRM', true);
    openBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_CRM_TICKET', ticketId: ticket.id }, () => void chrome.runtime.lastError);
    });
    body.appendChild(openBtn);
  } else {
    const noTicket = mkEl('div');
    noTicket.textContent = 'Sem card ativo. Crie um novo:';
    Object.assign(noTicket.style, { color: '#6b7280', fontSize: '12px', margin: '0 0 8px' });
    body.appendChild(noTicket);
    const pipelineLbl = mkEl('div');
    pipelineLbl.textContent = 'Funil';
    Object.assign(pipelineLbl.style, { fontSize: '11px', color: '#374151', fontWeight: '600', marginBottom: '2px' });
    body.appendChild(pipelineLbl);
    const pipelineSelect = styledSelect([{ value: '', label: 'Carregando funis...' }]);
    pipelineSelect.style.marginBottom = '10px';
    body.appendChild(pipelineSelect);
    sendToBackground({ type: 'GET_PIPELINES' }).then(resp => {
      pipelineSelect.textContent = '';
      (resp.pipelines || []).forEach(p => {
        const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name;
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
        sidebarCurrentPhone = null; await refreshSidebar(phone);
      } catch (e) {
        createCardBtn.disabled = false; createCardBtn.textContent = '+ Criar Card'; alert('Erro: ' + e.message);
      }
    });
    body.appendChild(createCardBtn);
  }
}

function renderOrcPdSection(body, phone) {
  const wrap = mkEl('div');
  wrap.id = 'lcrm-orc-pd-section';
  body.appendChild(wrap);
  loadAndRenderOrcPd(wrap, phone);
}

async function loadAndRenderOrcPd(wrap, phone) {
  wrap.textContent = '';
  const lbl = mkEl('div', 'lcrm-label', 'ORCAMENTO / PD');
  lbl.style.marginBottom = '4px';
  wrap.appendChild(lbl);
  const loadingEl = mkEl('div', null, '...');
  Object.assign(loadingEl.style, { fontSize: '11px', color: '#9ca3af', padding: '4px 0' });
  wrap.appendChild(loadingEl);
  try {
    const result = await sendToBackground({ type: 'GET_ORC_PD', phone });
    wrap.textContent = '';
    wrap.appendChild(lbl);
    if (!result.quotes.length && !result.proposals.length) {
      const emptyRow = mkEl('div');
      Object.assign(emptyRow.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280' });
      emptyRow.appendChild(mkEl('span', null, 'Sem orcamento ou PD'));
      const criarBtn = mkEl('button', 'lcrm-btn lcrm-btn-secondary', '+ Criar');
      Object.assign(criarBtn.style, { width: 'auto', padding: '2px 10px', fontSize: '10px' });
      criarBtn.addEventListener('click', () => chrome.tabs.create({ url: CRM_BASE_URL + '/orcamentos/novo' }));
      emptyRow.appendChild(criarBtn);
      wrap.appendChild(emptyRow);
      return;
    }
    const STATUS_COLORS = {
      'Em Analise':   { bg: '#fef3c7', color: '#92400e' },
      'Aprovado':     { bg: '#d1fae5', color: '#065f46' },
      'Em andamento': { bg: '#ede9fe', color: '#5b21b6' },
      'Recusado':     { bg: '#fee2e2', color: '#991b1b' },
    };
    const makeCard = (item, icon, urlSuffix) => {
      const card = mkEl('div', 'lcrm-orc-card');
      card.style.background = icon === 'ORC' ? '#fff7ed' : '#eff6ff';
      card.style.borderColor = icon === 'ORC' ? '#fed7aa' : '#bfdbfe';
      const iconEl = mkEl('span', null, icon === 'ORC' ? 'Orc' : 'PD');
      iconEl.style.cssText = 'font-size:11px;font-weight:700;flex-shrink:0;color:#6b7280';
      const info = mkEl('div', 'lcrm-orc-card-info');
      const nameEl = mkEl('div', 'lcrm-orc-card-name', item.name || 'Sem nome');
      const valueRow = mkEl('div', 'lcrm-orc-card-value');
      const formatted = item.total_value != null
        ? 'R$ ' + Number(item.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        : '--';
      const sc = STATUS_COLORS[item.status] || { bg: '#f3f4f6', color: '#374151' };
      const statusBadge = mkEl('span', 'lcrm-orc-status', item.status || '--');
      Object.assign(statusBadge.style, { background: sc.bg, color: sc.color });
      valueRow.appendChild(document.createTextNode(formatted + '  '));
      valueRow.appendChild(statusBadge);
      info.appendChild(nameEl); info.appendChild(valueRow);
      const arrow = mkEl('span', null, '>');
      arrow.style.cssText = 'font-size:14px;color:#9ca3af;flex-shrink:0';
      card.appendChild(iconEl); card.appendChild(info); card.appendChild(arrow);
      card.addEventListener('click', () => chrome.tabs.create({ url: CRM_BASE_URL + urlSuffix + item.id }));
      return card;
    };
    result.quotes.forEach(q => wrap.appendChild(makeCard(q, 'ORC', '/orcamentos/')));
    result.proposals.forEach(p => wrap.appendChild(makeCard(p, 'PD', '/orcamentos/')));
  } catch (e) {
    console.warn('[LiveCRM CS] GET_ORC_PD error:', e.message);
  }
}

function renderActionGrid(body, phone, client, ticket) {
  const PANELS = [
    { key: 'resposta', label: 'Resposta' },
    { key: 'followup', label: 'Follow-up' },
    { key: 'agendar',  label: 'Agendar' },
    { key: 'etiqueta', label: 'Etiqueta' },
  ];
  const grid = mkEl('div', 'lcrm-action-grid');
  const panelContainer = mkEl('div');
  panelContainer.id = 'lcrm-active-panel';

  PANELS.forEach(({ key, label }) => {
    const btn = mkEl('button', 'lcrm-action-btn', label);
    btn.dataset.panelKey = key;
    if (currentPanelActive === key) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (currentPanelActive === key) {
        currentPanelActive = null;
        panelContainer.textContent = '';
        grid.querySelectorAll('.lcrm-action-btn').forEach(b => b.classList.remove('active'));
      } else {
        currentPanelActive = key;
        grid.querySelectorAll('.lcrm-action-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        panelContainer.textContent = '';
        renderActivePanel(panelContainer, key, phone, client, ticket);
      }
    });
    grid.appendChild(btn);
  });
  body.appendChild(grid);
  body.appendChild(panelContainer);

  if (currentPanelActive) {
    renderActivePanel(panelContainer, currentPanelActive, phone, client, ticket);
  }
}

function renderActivePanel(container, key, phone, client, ticket) {
  switch (key) {
    case 'etiqueta': renderEtiquetaPanel(container, phone); break;
    case 'resposta': renderRespostaPanel(container, phone, client, ticket); break;
    case 'followup': renderFollowUpPanel(container, phone, client); break;
    case 'agendar':  renderAgendarPanel(container, phone); break;
  }
}

function renderNotesSection(body, ticket, client) {
  const wrap = mkEl('div', 'lcrm-card');
  const hdr = mkEl('div');
  Object.assign(hdr.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' });
  const lbl = mkEl('div', 'lcrm-label', 'NOTAS'); lbl.style.marginBottom = '0';
  const chevron = mkEl('span', null, 'v'); chevron.style.cssText = 'font-size:12px;color:#6b7280';
  hdr.appendChild(lbl); hdr.appendChild(chevron);
  const noteArea = mkEl('div');
  noteArea.style.display = 'none';
  Object.assign(noteArea.style, { flexDirection: 'column', gap: '8px', marginTop: '8px' });
  const textarea = document.createElement('textarea');
  textarea.className = 'lcrm-textarea'; textarea.placeholder = 'Adicionar nota...';
  const saveBtn = mkEl('button', 'lcrm-btn lcrm-btn-primary', 'Salvar nota');
  noteArea.appendChild(textarea); noteArea.appendChild(saveBtn);
  hdr.addEventListener('click', () => {
    const open = noteArea.style.display !== 'none';
    noteArea.style.display = open ? 'none' : 'flex';
    chevron.textContent = open ? 'v' : '^';
  });
  saveBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) return;
    saveBtn.disabled = true; saveBtn.textContent = 'Salvando...';
    try {
      await sendToBackground({ type: 'SAVE_NOTE', ticketId: ticket?.id || null, clientId: client.id, text });
      textarea.value = ''; saveBtn.textContent = 'Salvo!';
      setTimeout(() => { saveBtn.textContent = 'Salvar nota'; }, 2000);
    } catch (e) { alert('Erro: ' + e.message); }
    finally { saveBtn.disabled = false; }
  });
  wrap.appendChild(hdr); wrap.appendChild(noteArea);
  body.appendChild(wrap);
}
```

- [ ] **Step 5: Testar estrutura**

1. Recarregar extensao → abrir WhatsApp Web → abrir sidebar para um contato
2. Header: fundo `#111827`, logo, nome do contato em branco, telefone em cinza
3. Body: CONTATO com botao editar; FUNIL (select de etapas); ORCAMENTO/PD carregando; grade 2x2 com 4 botoes; NOTAS colapsavel
4. Clicar cada botao da grade → painel expande abaixo com animacao; clicar novamente → fecha; somente um painel aberto por vez; botao ativo fica laranja

- [ ] **Step 6: Commit**
```bash
git add livecrm-extension/content_script.js
git commit -m "refactor(ext): rebuild sidebar layout C — dark header, orc/PD section, 2x2 action grid"
```

---

## Task 7: Etiquetas visuais

**Files:**
- Modify: `livecrm-extension/content_script.js`

- [ ] **Step 1: Implementar `renderEtiquetaPanel` e `updateHeaderLabelBadge`**

Adicionar apos `renderNotesSection`:

```javascript
const PRESET_LABELS = [
  { id: 'preset_red',    name: 'Urgente',   color: '#991b1b', bg: '#fee2e2' },
  { id: 'preset_yellow', name: 'Follow-up', color: '#92400e', bg: '#fef3c7' },
  { id: 'preset_green',  name: 'Fechado',   color: '#065f46', bg: '#d1fae5' },
  { id: 'preset_blue',   name: 'VIP',       color: '#1e40af', bg: '#dbeafe' },
];

async function renderEtiquetaPanel(container, phone) {
  container.textContent = '';
  const wrap = mkEl('div', 'lcrm-action-panel');
  const panelHdr = mkEl('div', 'lcrm-action-panel-header', 'ETIQUETA');
  const panelBody = mkEl('div', 'lcrm-action-panel-body');
  wrap.appendChild(panelHdr); wrap.appendChild(panelBody);
  container.appendChild(wrap);

  const applyLabel = async (lbl) => {
    const isSame = sidebarCurrentLabel?.id === lbl?.id;
    if (isSame || !lbl) {
      await sendToBackground({ type: 'SET_CONTACT_LABEL', phone, label: null });
      sidebarCurrentLabel = null;
    } else {
      await sendToBackground({ type: 'SET_CONTACT_LABEL', phone, label: lbl });
      sidebarCurrentLabel = lbl;
    }
    updateHeaderLabelBadge();
    renderEtiquetaPanel(container, phone);
  };

  // Preset labels
  panelBody.appendChild(mkEl('div', 'lcrm-sub-label', 'PADROES'));
  const presetChips = mkEl('div', 'lcrm-chips');
  PRESET_LABELS.forEach(lbl => {
    const chip = mkEl('span', 'lcrm-chip', lbl.name);
    Object.assign(chip.style, { background: lbl.bg, color: lbl.color });
    if (sidebarCurrentLabel?.id === lbl.id) chip.classList.add('selected');
    chip.addEventListener('click', () => applyLabel(lbl));
    presetChips.appendChild(chip);
  });
  panelBody.appendChild(presetChips);

  // Custom labels
  const customSub = mkEl('div', 'lcrm-sub-label', 'PERSONALIZADAS');
  customSub.style.marginTop = '8px';
  panelBody.appendChild(customSub);
  const customChips = mkEl('div', 'lcrm-chips');
  const customs = await sendToBackground({ type: 'GET_CUSTOM_LABELS' });
  (customs || []).forEach(lbl => {
    const chip = mkEl('span', 'lcrm-chip', lbl.name);
    Object.assign(chip.style, { background: lbl.bg, color: lbl.color });
    if (sidebarCurrentLabel?.id === lbl.id) chip.classList.add('selected');
    chip.addEventListener('click', () => applyLabel(lbl));
    customChips.appendChild(chip);
  });
  const novaChip = mkEl('span', 'lcrm-chip', '+ Nova');
  Object.assign(novaChip.style, { border: '1px dashed #fed7aa', color: '#f97316', background: '#fff' });
  customChips.appendChild(novaChip);
  panelBody.appendChild(customChips);

  // New label form (hidden)
  const newForm = mkEl('div');
  newForm.style.display = 'none';
  Object.assign(newForm.style, { marginTop: '8px', padding: '8px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' });
  const nameInp = document.createElement('input');
  nameInp.type = 'text'; nameInp.placeholder = 'Nome da etiqueta...'; nameInp.className = 'lcrm-input';
  const COLOR_OPTS = ['#ef4444','#f97316','#10b981','#3b82f6','#8b5cf6','#ec4899'];
  let selectedColor = COLOR_OPTS[0];
  const colorRow = mkEl('div');
  Object.assign(colorRow.style, { display: 'flex', gap: '5px', marginBottom: '6px' });
  COLOR_OPTS.forEach(c => {
    const dot = mkEl('div');
    Object.assign(dot.style, { width: '16px', height: '16px', borderRadius: '50%', background: c, cursor: 'pointer', border: c === selectedColor ? '2px solid #111827' : '2px solid transparent' });
    dot.addEventListener('click', () => {
      selectedColor = c;
      colorRow.querySelectorAll('div').forEach((d, i) => {
        d.style.border = COLOR_OPTS[i] === selectedColor ? '2px solid #111827' : '2px solid transparent';
      });
    });
    colorRow.appendChild(dot);
  });
  const criarBtn = mkEl('button', 'lcrm-btn lcrm-btn-primary', '+ Criar');
  criarBtn.addEventListener('click', async () => {
    const name = nameInp.value.trim();
    if (!name) return;
    const hex = selectedColor.replace('#', '');
    const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
    const bg = 'rgba(' + r + ',' + g + ',' + b + ',0.15)';
    await sendToBackground({ type: 'SAVE_CUSTOM_LABEL', name, color: selectedColor, bg });
    renderEtiquetaPanel(container, phone);
  });
  newForm.appendChild(nameInp); newForm.appendChild(colorRow); newForm.appendChild(criarBtn);
  panelBody.appendChild(newForm);
  novaChip.addEventListener('click', () => {
    newForm.style.display = newForm.style.display === 'none' ? 'block' : 'none';
  });

  // Selected bar
  if (sidebarCurrentLabel) {
    const selBar = mkEl('div', 'lcrm-selected-bar');
    selBar.appendChild(mkEl('span', null, sidebarCurrentLabel.name + ' selecionado'));
    const remBtn = mkEl('button', null, 'remover');
    remBtn.addEventListener('click', () => applyLabel(null));
    selBar.appendChild(remBtn);
    panelBody.appendChild(selBar);
  }
}

function updateHeaderLabelBadge() {
  const badgeEl = document.getElementById('livecrm-header-label-badge');
  if (!badgeEl) return;
  if (sidebarCurrentLabel) {
    badgeEl.textContent = sidebarCurrentLabel.name;
    Object.assign(badgeEl.style, {
      display: 'inline-flex', alignItems: 'center', borderRadius: '20px',
      padding: '2px 7px', fontSize: '10px', fontWeight: '600',
      background: sidebarCurrentLabel.bg, color: sidebarCurrentLabel.color,
    });
  } else {
    badgeEl.style.display = 'none';
  }
}
```

- [ ] **Step 2: Adicionar `injectLabelBadges()`**

Adicionar apos `updateHeaderLabelBadge`:

```javascript
let labelBadgeObserver = null;
function injectLabelBadges() {
  if (labelBadgeObserver) return;
  const chatList = document.querySelector('#pane-side');
  if (!chatList) return;

  const applyBadge = async (row) => {
    if (row.dataset.lcrmlabeled) return;
    row.dataset.lcrmlabeled = '1';
    const jidAttr = row.getAttribute('data-id') || '';
    const phone = jidAttr.replace(/@c\.us|@s\.whatsapp\.net/, '').replace(/[^0-9]/g, '');
    if (!phone) return;
    const stored = await new Promise(r => chrome.storage.local.get(['label_' + phone], r));
    const lbl = stored['label_' + phone];
    if (!lbl) return;
    const titleEl = row.querySelector('[data-testid="cell-frame-title"]') || row.querySelector('span[dir="auto"][title]');
    if (!titleEl || titleEl.querySelector('.lcrm-dot')) return;
    const dot = document.createElement('span');
    dot.className = 'lcrm-dot';
    dot.style.cssText = 'display:inline-block;width:7px;height:7px;border-radius:50%;background:' + lbl.color + ';margin-left:5px;vertical-align:middle;flex-shrink:0';
    titleEl.parentElement?.appendChild(dot);
  };

  chatList.querySelectorAll('[data-id]').forEach(applyBadge);
  labelBadgeObserver = new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.dataset?.id) applyBadge(n);
      n.querySelectorAll?.('[data-id]').forEach(applyBadge);
    }));
  });
  labelBadgeObserver.observe(chatList, { childList: true, subtree: true });
}
```

Chamar `injectLabelBadges()` logo apos `injectSidebar()` na funcao de init do content script.

- [ ] **Step 3: Testar**

1. Abrir sidebar → clicar "Etiqueta" → painel expande
2. Clicar "Follow-up" → badge aparece no header
3. Clicar de novo → badge some
4. Clicar "+ Nova" → form aparece → digitar nome → selecionar cor → "+ Criar" → aparece em Personalizadas
5. Atribuir label → ponto colorido aparece na lista de conversas do WA Web

- [ ] **Step 4: Commit**
```bash
git add livecrm-extension/content_script.js
git commit -m "feat(ext): etiquetas visuais — presets, personalizadas, badge header, ponto lista WA"
```

---

## Task 8: Respostas Rapidas + sugestoes IA com "Usar"

**Files:**
- Modify: `livecrm-extension/content_script.js`

- [ ] **Step 1: Implementar `renderRespostaPanel`**

Adicionar apos `injectLabelBadges`:

```javascript
async function renderRespostaPanel(container, phone, client, ticket) {
  container.textContent = '';
  const wrap = mkEl('div', 'lcrm-action-panel');
  const panelHdr = mkEl('div', 'lcrm-action-panel-header', 'RESPOSTAS');
  const panelBody = mkEl('div', 'lcrm-action-panel-body');
  wrap.appendChild(panelHdr); wrap.appendChild(panelBody);
  container.appendChild(wrap);

  const getInput = () => document.querySelector(COMPOSE_SEL);

  // A. Sugestoes da IA
  panelBody.appendChild(mkEl('div', 'lcrm-sub-label', 'SUGESTOES DA IA'));
  const aiArea = mkEl('div'); panelBody.appendChild(aiArea);

  const renderAiState = () => {
    aiArea.textContent = '';
    if (currentSuggestionState === 'pending') {
      const spin = mkEl('div', null, 'Gerando sugestoes...');
      Object.assign(spin.style, { fontSize: '11px', color: '#6b7280', fontStyle: 'italic', padding: '4px 0' });
      aiArea.appendChild(spin);
    } else if (currentSuggestionState === 'done' && currentSuggestionText) {
      const suggestions = typeof currentSuggestionText === 'string' ? [currentSuggestionText] : currentSuggestionText;
      suggestions.forEach(text => {
        const card = mkEl('div', 'lcrm-ai-card');
        const p = mkEl('p', null, text);
        const useBtn = mkEl('button', 'lcrm-ai-use-btn', 'Usar');
        useBtn.addEventListener('click', async () => {
          const input = getInput();
          if (!input) { alert('Campo de texto nao encontrado no WhatsApp.'); return; }
          await insertTextReact(input, text);
          useBtn.textContent = 'Inserido!';
          setTimeout(() => { useBtn.textContent = 'Usar'; }, 2000);
        });
        card.appendChild(p); card.appendChild(useBtn);
        aiArea.appendChild(card);
      });
      const regenBtn = mkEl('button', 'lcrm-btn lcrm-btn-secondary', 'Gerar novas');
      regenBtn.style.marginTop = '4px';
      regenBtn.addEventListener('click', () => {
        currentSuggestionState = 'pending';
        renderAiState();
        sendToBackground({ type: 'REQUEST_SUGGESTION', clientId: client?.id, phone });
      });
      aiArea.appendChild(regenBtn);
    } else if (currentSuggestionState === 'timeout' || currentSuggestionState === 'error') {
      const err = mkEl('div', null, 'Nao foi possivel gerar sugestao.');
      Object.assign(err.style, { fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' });
      aiArea.appendChild(err);
    } else {
      const idle = mkEl('div', null, 'Aguardando mensagem recebida...');
      Object.assign(idle.style, { fontSize: '11px', color: '#9ca3af', fontStyle: 'italic', padding: '4px 0' });
      aiArea.appendChild(idle);
    }
  };
  renderAiState();

  // B. Templates salvos
  const sep = mkEl('div');
  Object.assign(sep.style, { borderTop: '1px solid #e5e7eb', margin: '10px -10px 10px' });
  panelBody.appendChild(sep);
  panelBody.appendChild(mkEl('div', 'lcrm-sub-label', 'RESPOSTAS SALVAS'));
  const tmplList = mkEl('div'); panelBody.appendChild(tmplList);

  const loadTemplates = async () => {
    tmplList.textContent = '';
    const replies = await sendToBackground({ type: 'GET_QUICK_REPLIES' });
    if (!replies?.length) {
      const empty = mkEl('div', null, 'Nenhuma resposta salva.');
      Object.assign(empty.style, { fontSize: '11px', color: '#9ca3af', fontStyle: 'italic', padding: '4px 0' });
      tmplList.appendChild(empty);
    } else {
      replies.forEach(r => {
        const row = mkEl('div', 'lcrm-reply-template');
        const info = mkEl('div');
        Object.assign(info.style, { flex: '1', minWidth: '0', marginRight: '6px' });
        info.appendChild(mkEl('div', 'lcrm-reply-title', r.title));
        info.appendChild(mkEl('div', 'lcrm-reply-body', r.body));
        const useBtn = mkEl('button', 'lcrm-btn lcrm-btn-primary', 'Usar');
        Object.assign(useBtn.style, { width: 'auto', padding: '3px 8px', fontSize: '10px', flexShrink: '0' });
        useBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const input = getInput();
          if (!input) { alert('Campo nao encontrado.'); return; }
          await insertTextReact(input, r.body);
        });
        const delBtn = mkEl('button', null, 'X');
        Object.assign(delBtn.style, { background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '12px', padding: '0 2px', flexShrink: '0' });
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await sendToBackground({ type: 'DELETE_QUICK_REPLY', id: r.id });
          loadTemplates();
        });
        row.appendChild(info); row.appendChild(useBtn); row.appendChild(delBtn);
        tmplList.appendChild(row);
      });
    }
  };
  await loadTemplates();

  const addBtn = mkEl('button', 'lcrm-btn lcrm-btn-secondary', '+ Adicionar resposta');
  addBtn.style.marginTop = '6px';
  const addForm = mkEl('div');
  addForm.style.display = 'none'; addForm.style.marginTop = '8px';
  const titleInp = document.createElement('input');
  titleInp.type = 'text'; titleInp.placeholder = 'Titulo (ex: Saudacao)'; titleInp.className = 'lcrm-input';
  const bodyInp = document.createElement('textarea');
  bodyInp.placeholder = 'Texto da resposta...'; bodyInp.className = 'lcrm-textarea'; bodyInp.rows = 3;
  const saveRplyBtn = mkEl('button', 'lcrm-btn lcrm-btn-primary', 'Salvar');
  saveRplyBtn.addEventListener('click', async () => {
    const t = titleInp.value.trim(), b = bodyInp.value.trim();
    if (!t || !b) return;
    await sendToBackground({ type: 'SAVE_QUICK_REPLY', title: t, body: b });
    titleInp.value = ''; bodyInp.value = '';
    addForm.style.display = 'none'; addBtn.style.display = '';
    loadTemplates();
  });
  addForm.appendChild(titleInp); addForm.appendChild(bodyInp); addForm.appendChild(saveRplyBtn);
  panelBody.appendChild(addBtn); panelBody.appendChild(addForm);
  addBtn.addEventListener('click', () => { addForm.style.display = 'block'; addBtn.style.display = 'none'; });
}
```

- [ ] **Step 2: Atualizar `renderSuggestionPanel()` para redirecionar ao painel**

Substituir toda a funcao `renderSuggestionPanel()`:

```javascript
function renderSuggestionPanel() {
  if (currentPanelActive === 'resposta') {
    const panelContainer = document.getElementById('lcrm-active-panel');
    if (panelContainer) {
      panelContainer.textContent = '';
      renderRespostaPanel(panelContainer, currentSuggestionPhone || sidebarCurrentPhone, null, null);
    }
    return;
  }
  if (currentSuggestionState === 'done') {
    const panelEl = document.getElementById('livecrm-panel');
    const isOpen = panelEl?.style.transform === 'translateX(0px)' || panelEl?.style.transform === 'translateX(0)';
    if (isOpen) {
      currentPanelActive = 'resposta';
      document.querySelectorAll('.lcrm-action-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.panelKey === 'resposta');
      });
      const panelContainer = document.getElementById('lcrm-active-panel');
      if (panelContainer) {
        panelContainer.textContent = '';
        renderRespostaPanel(panelContainer, currentSuggestionPhone || sidebarCurrentPhone, null, null);
      }
    }
  }
}
```

- [ ] **Step 3: Testar**

1. Abrir sidebar → clicar "Resposta" → estado "Aguardando mensagem..."
2. Receber mensagem → spinner → sugestao aparece em card roxo com botao "Usar"
3. Clicar "Usar" → texto inserido no campo de composicao do WA Web
4. Adicionar template → clicar "Usar" no template → texto inserido
5. Deletar template → some da lista

- [ ] **Step 4: Commit**
```bash
git add livecrm-extension/content_script.js
git commit -m "feat(ext): respostas rapidas com Usar — templates e sugestoes IA integrados no painel"
```

---

## Task 9: Follow-up reminder panel

**Files:**
- Modify: `livecrm-extension/content_script.js`

- [ ] **Step 1: Implementar `renderFollowUpPanel`**

Adicionar apos `renderRespostaPanel`:

```javascript
async function renderFollowUpPanel(container, phone, client) {
  container.textContent = '';
  const wrap = mkEl('div', 'lcrm-action-panel');
  const panelHdr = mkEl('div', 'lcrm-action-panel-header', 'FOLLOW-UP');
  const panelBody = mkEl('div', 'lcrm-action-panel-body');
  wrap.appendChild(panelHdr); wrap.appendChild(panelBody);
  container.appendChild(wrap);

  const contactName = client?.name || phone;

  // Active reminders
  const activeSection = mkEl('div'); panelBody.appendChild(activeSection);
  const loadActive = async () => {
    activeSection.textContent = '';
    const reminders = await sendToBackground({ type: 'GET_FOLLOWUP_REMINDERS', phone });
    if (reminders?.length) {
      activeSection.appendChild(mkEl('div', 'lcrm-sub-label', 'AGENDADOS'));
      reminders.forEach(r => {
        const row = mkEl('div');
        Object.assign(row.style, { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f3f4f6', gap: '6px' });
        const info = mkEl('div');
        const dt = new Date(r.dueAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const dtEl = mkEl('div', null, dt); dtEl.style.cssText = 'font-size:11px;font-weight:600;color:#374151';
        info.appendChild(dtEl);
        if (r.note) { const n = mkEl('div', null, r.note); n.style.cssText = 'font-size:10px;color:#6b7280'; info.appendChild(n); }
        const delBtn = mkEl('button', null, 'X');
        Object.assign(delBtn.style, { background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '12px', padding: '0', flexShrink: '0' });
        delBtn.addEventListener('click', async () => {
          await sendToBackground({ type: 'DELETE_FOLLOWUP_REMINDER', id: r.id });
          loadActive();
        });
        row.appendChild(info); row.appendChild(delBtn);
        activeSection.appendChild(row);
      });
    }
  };
  await loadActive();

  // New reminder form
  const sep = mkEl('div');
  Object.assign(sep.style, { borderTop: '1px solid #e5e7eb', margin: '8px -10px', padding: '0' });
  panelBody.appendChild(sep);
  panelBody.appendChild(mkEl('div', 'lcrm-sub-label', 'NOVO LEMBRETE'));

  const pickers = mkEl('div', 'lcrm-fp-pickers');
  const timeInput = document.createElement('input');
  timeInput.type = 'time'; timeInput.className = 'lcrm-input';
  const oneH = new Date(Date.now() + 3600000);
  timeInput.value = oneH.toTimeString().slice(0, 5);
  timeInput.dataset.baseDate = oneH.toISOString().slice(0, 10);

  [
    { label: 'Em 1h',       ms: 3600000 },
    { label: 'Hoje',        ms: 0 },
    { label: 'Amanha',      ms: 86400000 },
    { label: 'Prox. semana', ms: 7 * 86400000 },
  ].forEach(({ label, ms }) => {
    const btn = mkEl('button', 'lcrm-fp-picker', label);
    btn.addEventListener('click', () => {
      pickers.querySelectorAll('.lcrm-fp-picker').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const d = new Date(Date.now() + ms);
      timeInput.value = d.toTimeString().slice(0, 5);
      timeInput.dataset.baseDate = d.toISOString().slice(0, 10);
    });
    pickers.appendChild(btn);
  });
  pickers.firstElementChild?.classList.add('active');
  panelBody.appendChild(pickers);
  panelBody.appendChild(timeInput);

  const noteInp = document.createElement('input');
  noteInp.type = 'text'; noteInp.placeholder = 'Nota (opcional)'; noteInp.className = 'lcrm-input';
  panelBody.appendChild(noteInp);

  const setBtn = mkEl('button', 'lcrm-btn lcrm-btn-primary', 'Definir lembrete');
  setBtn.addEventListener('click', async () => {
    const baseDate = timeInput.dataset.baseDate || new Date().toISOString().slice(0, 10);
    const dueAt = new Date(baseDate + 'T' + timeInput.value + ':00').toISOString();
    if (new Date(dueAt) <= new Date()) { alert('A data do lembrete deve ser no futuro.'); return; }
    setBtn.disabled = true;
    try {
      await sendToBackground({ type: 'SET_FOLLOWUP_REMINDER', phone, contactName, dueAt, note: noteInp.value.trim() });
      noteInp.value = ''; await loadActive();
    } finally { setBtn.disabled = false; }
  });
  panelBody.appendChild(setBtn);
}
```

- [ ] **Step 2: Testar**

1. Abrir sidebar → clicar "Follow-up"
2. Clicar "Em 1h" → campo de hora atualiza
3. Clicar "Definir lembrete" → entrada aparece em AGENDADOS
4. Configurar lembrete para 30s no futuro via console SW → notificacao Chrome dispara
5. Clicar "X" no lembrete → desaparece, alarm cancelado

- [ ] **Step 3: Commit**
```bash
git add livecrm-extension/content_script.js
git commit -m "feat(ext): follow-up reminder panel — pickers, alarms, Chrome notifications"
```

---

## Task 10: Mensagens agendadas panel

**Files:**
- Modify: `livecrm-extension/content_script.js`

- [ ] **Step 1: Implementar `renderAgendarPanel`**

Adicionar apos `renderFollowUpPanel`:

```javascript
async function renderAgendarPanel(container, phone) {
  container.textContent = '';
  const wrap = mkEl('div', 'lcrm-action-panel');
  const panelHdr = mkEl('div', 'lcrm-action-panel-header', 'AGENDAR MENSAGEM');
  const panelBody = mkEl('div', 'lcrm-action-panel-body');
  wrap.appendChild(panelHdr); wrap.appendChild(panelBody);
  container.appendChild(wrap);

  // Scheduled list
  const listSection = mkEl('div'); panelBody.appendChild(listSection);
  const loadScheduled = async () => {
    listSection.textContent = '';
    const result = await sendToBackground({ type: 'GET_SCHEDULED_MESSAGES', phone });
    const items = result?.data || [];
    if (items.length) {
      listSection.appendChild(mkEl('div', 'lcrm-sub-label', 'AGENDADAS'));
      items.forEach(item => {
        const row = mkEl('div');
        Object.assign(row.style, { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f3f4f6', gap: '6px' });
        const info = mkEl('div'); info.style.flex = '1'; info.style.minWidth = '0';
        const dt = new Date(item.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const dtEl = mkEl('div', null, dt); dtEl.style.cssText = 'font-size:10px;font-weight:600;color:#374151';
        const msgEl = mkEl('div', null, item.message);
        msgEl.style.cssText = 'font-size:10px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        info.appendChild(dtEl); info.appendChild(msgEl);
        const delBtn = mkEl('button', null, 'X');
        Object.assign(delBtn.style, { background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '12px', padding: '0', flexShrink: '0' });
        delBtn.addEventListener('click', async () => {
          await sendToBackground({ type: 'CANCEL_SCHEDULED_MESSAGE', id: item.id });
          loadScheduled();
        });
        row.appendChild(info); row.appendChild(delBtn);
        listSection.appendChild(row);
      });
    }
  };
  await loadScheduled();

  // New message form
  const sep = mkEl('div');
  Object.assign(sep.style, { borderTop: '1px solid #e5e7eb', margin: '8px -10px', padding: '0' });
  panelBody.appendChild(sep);
  panelBody.appendChild(mkEl('div', 'lcrm-sub-label', 'NOVA MENSAGEM AGENDADA'));

  const msgArea = document.createElement('textarea');
  msgArea.placeholder = 'Mensagem a enviar...'; msgArea.className = 'lcrm-textarea'; msgArea.rows = 3;
  panelBody.appendChild(msgArea);

  const dtInp = document.createElement('input');
  dtInp.type = 'datetime-local'; dtInp.className = 'lcrm-input';
  dtInp.value = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
  panelBody.appendChild(dtInp);

  const schedBtn = mkEl('button', 'lcrm-btn lcrm-btn-primary', 'Agendar envio');
  schedBtn.addEventListener('click', async () => {
    const msg = msgArea.value.trim();
    if (!msg) { alert('Digite a mensagem.'); return; }
    if (!dtInp.value) { alert('Selecione data e hora.'); return; }
    const scheduledAt = new Date(dtInp.value).toISOString();
    if (new Date(scheduledAt) <= new Date()) { alert('A data deve ser no futuro.'); return; }
    schedBtn.disabled = true;
    try {
      const result = await sendToBackground({ type: 'SCHEDULE_MESSAGE', phone, message: msg, scheduledAt });
      if (result.error) { alert('Erro: ' + result.error); return; }
      msgArea.value = '';
      dtInp.value = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
      await loadScheduled();
    } finally { schedBtn.disabled = false; }
  });
  panelBody.appendChild(schedBtn);
}
```

- [ ] **Step 2: Testar**

1. Abrir sidebar → clicar "Agendar"
2. Digitar mensagem → data 2h a frente → "Agendar envio"
3. Mensagem aparece na lista com hora e texto
4. Verificar Supabase: row com `status = 'pending'` e `scheduled_at` correto
5. Clicar "X" → status muda para `cancelled`, some da lista

- [ ] **Step 3: Commit**
```bash
git add livecrm-extension/content_script.js
git commit -m "feat(ext): mensagens agendadas — panel UI, schedule e cancel via sidebar"
```

---

## Task 11: Traducao automatica (DeepL)

**Files:**
- Modify: `livecrm-extension/content_script.js`
- Modify: `livecrm-extension/popup.html`
- Modify: `livecrm-extension/popup.js`

- [ ] **Step 1: Adicionar config DeepL ao popup.html**

Em `popup.html`, substituir:
```html
    <button class="btn-danger" id="btn-logout">Sair</button>
  </div>
```
por:
```html
    <button class="btn-danger" id="btn-logout">Sair</button>
    <div style="margin-top:12px;border-top:1px solid #374151;padding-top:10px">
      <label>DeepL API Key (traducao)</label>
      <input id="deepl-key" type="password" placeholder="Cole sua chave DeepL Free...">
      <button class="btn-primary" id="btn-save-deepl" style="margin-top:4px">Salvar chave</button>
      <div id="deepl-msg" style="color:#4ade80;font-size:11px;margin-top:4px;display:none">Chave salva!</div>
    </div>
  </div>
```

- [ ] **Step 2: Adicionar logica DeepL ao popup.js**

Adicionar ao final do arquivo `popup.js`:
```javascript
// DeepL key
chrome.runtime.sendMessage({ type: 'GET_DEEPL_KEY' }, res => {
  const el = document.getElementById('deepl-key');
  if (el && res?.key) el.value = res.key;
});

document.getElementById('btn-save-deepl')?.addEventListener('click', () => {
  const key = document.getElementById('deepl-key')?.value?.trim();
  if (!key) return;
  chrome.runtime.sendMessage({ type: 'SAVE_DEEPL_KEY', key }, () => {
    const msg = document.getElementById('deepl-msg');
    if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 2000); }
  });
});
```

- [ ] **Step 3: Implementar `injectTranslateButtons()` no content_script.js**

Adicionar apos `injectLabelBadges`:

```javascript
let translateObserver = null;
function injectTranslateButtons() {
  if (translateObserver) return;
  const main = document.querySelector('#main');
  if (!main) return;

  const addBtn = (msgRow) => {
    if (msgRow.dataset.lcrmt) return;
    const textEl = msgRow.querySelector('span.selectable-text') || msgRow.querySelector('[data-testid="msg-plaintext-container"]');
    if (!textEl || !textEl.textContent?.trim()) return;
    // Skip own messages (sent, not received)
    if (msgRow.closest('[data-testid="msg-container"]')?.parentElement?.classList.contains('message-out')) return;
    msgRow.dataset.lcrmt = '1';

    const btn = mkEl('button', 'lcrm-translate-btn', 'Traduzir');
    let resultEl = null;

    btn.addEventListener('click', async () => {
      if (resultEl) { resultEl.remove(); resultEl = null; btn.textContent = 'Traduzir'; return; }
      btn.textContent = '...';
      const text = textEl.textContent.trim();
      const res = await sendToBackground({ type: 'TRANSLATE_TEXT', text, targetLang: 'PT' });
      if (res.error === 'no_api_key') { btn.textContent = '(sem chave)'; return; }
      if (res.error) { btn.textContent = '!'; return; }
      btn.textContent = 'Fechar';
      resultEl = mkEl('div', 'lcrm-translate-result', res.translated);
      msgRow.appendChild(resultEl);
    });

    textEl.parentElement?.appendChild(btn);
  };

  main.querySelectorAll('[data-id]').forEach(addBtn);
  translateObserver = new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.dataset?.id) addBtn(n);
      n.querySelectorAll?.('[data-id]').forEach(addBtn);
    }));
  });
  translateObserver.observe(main, { childList: true, subtree: true });
}
```

Chamar `injectTranslateButtons()` logo apos `injectLabelBadges()` na funcao de init.

- [ ] **Step 4: Testar**

1. Abrir popup → fazer login → secao "DeepL API Key" visivel abaixo do botao Sair
2. Inserir chave DeepL Free → "Salvar chave" → "Chave salva!" aparece
3. Abrir WhatsApp Web → abrir conversa em ingles → botao "Traduzir" apos cada mensagem recebida
4. Clicar "Traduzir" → spinner → traducao aparece em caixa verde abaixo
5. Clicar novamente → traducao some
6. Sem chave: clicar "Traduzir" → mostra "(sem chave)" graciosamente

- [ ] **Step 5: Commit**
```bash
git add livecrm-extension/content_script.js livecrm-extension/popup.html livecrm-extension/popup.js
git commit -m "feat(ext): traducao automatica via DeepL — botao Traduzir em mensagens recebidas"
```

---

## Self-Review

**Cobertura do spec:**
| Req | Task |
|-----|------|
| Layout C — dark header + badge inline + grade 2x2 | 6 |
| Orcamento/PD section entre funil e grid | 4 (handler) + 6 (renderOrcPdSection) |
| Etiquetas: 4 presets + customizadas + chrome.storage | 2 + 7 |
| Respostas Rapidas: templates + Usar injectTextReact | 2 + 8 |
| Sugestoes IA: painel upgrade, Usar, Gerar novas | 4 (REQUEST_SUGGESTION) + 8 |
| Follow-up: chrome.alarms + chrome.notifications + UI | 3 + 9 |
| Mensagens Agendadas: schema + query filter + UI | 1 + 4 + 10 |
| Traducao automatica: DeepL + popup config + UI | 1 (manifest) + 4 + 11 |
| Manifest notifications + DeepL host | 1 |
| CSS 320px dark orange | 5 |

**Consistencia tecnica:**
- `styledSelect()` e `styledBtn()` (helpers existentes) continuam sendo usados em `renderFunilSection` — nao remover
- `currentSuggestionPhone`, `currentSuggestionState`, `currentSuggestionText` sao variaveis existentes reutilizadas sem duplicacao
- `COMPOSE_SEL` (linha ~457 do content_script.js) e `insertTextReact()` sao reaproveitados em `renderRespostaPanel`
- `CRM_BASE_URL` de `config.js` e usado nas URLs de orc/PD — config.js ja esta no manifest antes de content_script.js
- `sendToBackground()` (existente, linha ~803) e o unico wrapper usado — nao usar `chrome.runtime.sendMessage` direto no content script
