// Roda no CRM (posvenda.liveuni.com.br) — ISOLATED world
// Bridge: page JS dispara 'livecrm:sendMessage' → content script relata ao background.js

// Sinaliza ao CRM que a extensão está ativa (lido pelo TicketDetailDialog)
document.documentElement.setAttribute('data-livecrm-ext', 'true');

window.addEventListener('livecrm:sendMessage', (e) => {
  const { __requestId, ...msg } = e.detail;
  chrome.runtime.sendMessage(msg, (resp) => {
    const err = chrome.runtime.lastError;
    window.dispatchEvent(new CustomEvent('livecrm:messageResponse', {
      detail: { requestId: __requestId, response: resp, error: err?.message }
    }));
  });
});
