const NAMES = ['full_name', 'email', 'phone', 'notes'];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'flacroncv.fill') return undefined;
  const payload = message.payload;
  if (!payload || payload.submit !== false || payload.site !== 'example-jobs.test') {
    sendResponse({ ok: false, error: 'submit_forbidden' });
    return true;
  }
  const filled = [];
  for (const name of NAMES) {
    const field = document.querySelector(`[name="${name}"]`);
    if (!field || field.type === 'submit' || field.type === 'button') continue;
    field.value = payload.fields?.[name] ?? '';
    filled.push(name);
  }
  sendResponse({ ok: true, filled, submit: false });
  return true;
});
