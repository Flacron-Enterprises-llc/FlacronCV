chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'flacroncv.requestFill') return undefined;
  fillTab(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'fill_failed' }));
  return true;
});

async function fillTab({ apiOrigin, sessionId, token, tabId }) {
  const response = await fetch(`${apiOrigin}/api/v1/forms/${sessionId}/fill`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const payload = await response.json();
  if (!response.ok) return { ok: false, error: payload.code ?? 'fill_failed' };
  if (payload.submit !== false || payload.site !== 'example-jobs.test') {
    return { ok: false, error: 'submit_forbidden' };
  }
  const applied = await chrome.tabs.sendMessage(tabId, { type: 'flacroncv.fill', payload });
  return applied;
}
