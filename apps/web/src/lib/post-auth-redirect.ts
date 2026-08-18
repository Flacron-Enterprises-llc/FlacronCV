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
 * The landing page for a role when the user has not asked for anywhere in
 * particular. Staff land in the admin panel — CRM is reachable from there, and
 * both surfaces admit `admin` and `super_admin` alike, so there is no separate
 * super-admin home to send anyone to.
 *
 * Only ever a DEFAULT: it decides nothing about access. `(admin)/layout.tsx`
 * and `(crm)/layout.tsx` remain the gate, so a wrong guess here sends someone to
 * a page that bounces them straight back rather than letting them in.
 */
export function roleHomePath(role?: string | null): string {
  return role === 'admin' || role === 'super_admin' ? '/admin' : '/dashboard';
}

/**
 * Resolves where to send the user after login/registration:
 * 1. A template they picked while logged out (stored before the auth wall)
 * 2. A validated callbackUrl deep link
 * 3. The home page for their role — /admin for staff, /dashboard for everyone else
 *
 * Explicit intent outranks the role default: someone who followed a deep link to
 * a billing page wants that page, not the admin panel, even if they are staff.
 *
 * `role` should come from the ID-token claim (see `currentUserRole`), not from
 * `user.role`. The synced profile can still be the placeholder stand-in at this
 * point, which reports `role: 'user'` for everyone — including real admins.
 */
export function getPostLoginRedirect(callbackUrl?: string | null, role?: string | null): string {
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
  return safeCallbackUrl(callbackUrl) ?? roleHomePath(role);
}
