const loginSection = document.getElementById('login-section');
const statusSection = document.getElementById('status-section');
const dot = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const instanceInfo = document.getElementById('instance-info');
const waInfo = document.getElementById('wa-info');
const loginError = document.getElementById('login-error');

function showLogin() {
  loginSection.style.display = 'block';
  statusSection.style.display = 'none';
}

function showStatus(connected, instanceId) {
  loginSection.style.display = 'none';
  statusSection.style.display = 'block';
  dot.className = `dot ${connected ? 'green' : 'red'}`;
  statusText.textContent = connected ? 'Conectado ao CRM' : 'Desconectado';
  instanceInfo.textContent = instanceId ? `Instância: ${instanceId.slice(0, 8)}...` : 'Instância não encontrada';

  chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
    waInfo.textContent = tabs.length > 0
      ? '🟢 WhatsApp Web aberto'
      : '🔴 WhatsApp Web não encontrado — abra web.whatsapp.com';
  });
}

chrome.storage.local.get(['session'], (stored) => {
  if (!stored.session) {
    showLogin();
    return;
  }
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (res) showStatus(res.connected, res.instanceId);
    else showLogin();
  });
});

document.getElementById('btn-login').addEventListener('click', () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  loginError.textContent = '';
  if (!email || !password) { loginError.textContent = 'Preencha email e senha'; return; }

  chrome.runtime.sendMessage({ type: 'LOGIN', email, password }, (res) => {
    if (res?.success) {
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
        showStatus(status?.connected, status?.instanceId);
      });
    } else {
      loginError.textContent = res?.error || 'Erro ao fazer login';
    }
  });
});

document.getElementById('btn-logout').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LOGOUT' });
  showLogin();
});
