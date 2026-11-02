const status = document.getElementById('status');
const form = document.getElementById('fill-form');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = '';
  const apiOrigin = document.getElementById('api-origin').value.trim().replace(/\/+$/, '');
  const sessionId = document.getElementById('session-id').value.trim();
  const token = document.getElementById('token').value.trim();
  if (!apiOrigin || !sessionId || !token) {
    status.textContent = 'API origin, session id, and token are required.';
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? '';
  if (!/^https?:\/\/example-jobs\.test(?::\d+)?(\/|$)/i.test(url)) {
    status.textContent = 'Open example-jobs.test first. Other sites are not supported.';
    return;
  }
  chrome.runtime.sendMessage({ type: 'flacroncv.requestFill', apiOrigin, sessionId, token, tabId: tab.id }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = chrome.runtime.lastError.message;
      return;
    }
    if (!response?.ok) {
      status.textContent = response?.error ?? 'Fill failed.';
      return;
    }
    status.textContent = `Filled ${response.filled.join(', ') || 'no fields'}. The form was not sent.`;
  });
});
