const PENDING_TEMPLATE_KEY = 'flacroncv_pending_template';

/**
 * Validates a post-login callback URL. Only same-origin, absolute paths are
 * allowed; anything that could escape the origin is rejected:
 *  - protocol-relative URLs ("//evil.com")
 *  - backslashes ("/\evil.com" — browsers normalize \ to /)
 *  - control characters and whitespace (header/URL smuggling)
 */
export function safeCallbackUrl(callbackUrl: string | null | undefined): string | null {
  if (!callbackUrl) return null;
  if (!callbackUrl.startsWith('/')) return null;
  if (callbackUrl.startsWith('//')) return null;
  if (callbackUrl.includes('\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f]/.test(callbackUrl)) return null;
  return callbackUrl;
}

/**
 * Resolves where to send the user after login/registration:
 * 1. A template they picked while logged out (stored before the auth wall)
 * 2. A validated callbackUrl deep link
 * 3. The dashboard
 */
export function getPostLoginRedirect(callbackUrl?: string | null): string {
  try {
    const raw = localStorage.getItem(PENDING_TEMPLATE_KEY);
    if (raw) {
      const { templateId, category } = JSON.parse(raw) as { templateId: string; category: string };
      localStorage.removeItem(PENDING_TEMPLATE_KEY);
      if (category === 'cover_letter') {
        return `/cover-letters/new?template=${templateId}`;
      }
      return `/cv/new?template=${templateId}`;
    }
  } catch {
    // Malformed stored value — ignore and fall through.
  }
  return safeCallbackUrl(callbackUrl) ?? '/dashboard';
}
