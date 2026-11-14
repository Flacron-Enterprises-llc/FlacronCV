/**
 * Validation for the three link fields on the profile form.
 *
 * These inputs sit next to each other and are trivially mixed up, and nothing
 * downstream re-checks them — the CV templates render whatever is stored as the
 * LinkedIn/GitHub link. Before this, the server checked only "is a string, is
 * under 500 chars", so a GitHub URL pasted into the LinkedIn box (or a bare
 * word, or a `javascript:` URL) saved happily and shipped onto a CV under the
 * wrong label.
 *
 * It lives in shared-types so the browser and the API run the SAME rule. Client
 * validation alone is a UX nicety an attacker skips; server validation alone
 * means the user only learns they were wrong after a round-trip. Duplicating it
 * in two languages of the same repo is how the two silently drift apart.
 */

/** Profile fields that must hold a URL. */
export type ProfileLinkField = 'linkedin' | 'github' | 'website';

/**
 * Hosts each field may point at. An empty list means "any host" — Website is
 * free-form by definition. Subdomains are accepted (`www.`, and LinkedIn's
 * country prefixes such as `pk.linkedin.com`, which are real profile URLs).
 */
export const PROFILE_LINK_HOSTS: Record<ProfileLinkField, string[]> = {
  linkedin: ['linkedin.com'],
  github: ['github.com'],
  website: [],
};

/** Human label used in the English error messages. */
const FIELD_LABEL: Record<ProfileLinkField, string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  website: 'Website',
};

/**
 * Why a link was rejected, as data rather than a sentence, so each client can
 * show it in the user's language:
 * - `too_long`     — over `max` characters
 * - `invalid`      — not a usable web address (includes: contains whitespace,
 *                    a percent-encoded host, or a host without a dot)
 * - `scheme`       — parsed, but not http/https
 * - `host`         — not on `host` (LinkedIn/GitHub fields only)
 * - `profile_path` — on `host` but its home page, not a profile
 */
export type ProfileLinkIssue =
  | { code: 'too_long'; max: number }
  | { code: 'invalid' }
  | { code: 'scheme' }
  | { code: 'host'; host: string }
  | { code: 'profile_path'; host: string };

export type ProfileLinkIssueCode = ProfileLinkIssue['code'];

export interface ProfileLinkCheck {
  /** The value to store — normalised, or '' when the field was cleared. */
  value: string;
  /** Present when the input is not acceptable; `value` is meaningless then. */
  issue?: ProfileLinkIssue;
}

export interface ProfileLinkResult {
  /** The value to store — normalised, or '' when the field was cleared. */
  value: string;
  /** Present when the input is not acceptable; `value` is meaningless then. */
  error?: string;
}

/**
 * Validates and normalises one link field, returning a machine-readable
 * {@link ProfileLinkIssue}. The web settings page uses this and translates the
 * issue; {@link validateProfileLink} wraps it with English sentences for the
 * API and other callers.
 *
 * An empty value is always valid — it clears the field. A value with no scheme
 * gets `https://` prepended rather than rejected: the scheme is the part people
 * leave off when pasting, and refusing `github.com/name` reads as the field
 * being broken rather than as a correction.
 */
export function checkProfileLink(
  field: ProfileLinkField,
  raw: string,
  maxLength = 500,
): ProfileLinkCheck {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return { value: '' };

  if (trimmed.length > maxLength) {
    return { value: trimmed, issue: { code: 'too_long', max: maxLength } };
  }

  // WHATWG URL parsing is forgiving in ways that turn typos into "valid" links:
  // `not a url` becomes https://not%20a%20url/ in Chrome, and a space inside a
  // path is silently percent-encoded. Nobody means a link with a space in it,
  // so whitespace in what was typed is a mistake to correct, not to encode.
  if (/\s/.test(trimmed)) return { value: trimmed, issue: { code: 'invalid' } };

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { value: trimmed, issue: { code: 'invalid' } };
  }

  // http/https only. These are rendered as clickable links on a CV that gets
  // shared as a PDF and a public page, so a `javascript:` or `data:` value here
  // is stored XSS with a distribution channel attached.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { value: trimmed, issue: { code: 'scheme' } };
  }

  // A public link needs a real domain: a single label ("jane", "localhost") or
  // a host the parser had to percent-encode is a typo, not a website. Browsers
  // and Node differ on how they treat such hosts, which is how the form and the
  // API once disagreed — rejecting them outright keeps both sides equal.
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname.includes('%') || !hostname.includes('.')) {
    return { value: trimmed, issue: { code: 'invalid' } };
  }

  const allowed = PROFILE_LINK_HOSTS[field];
  if (allowed.length > 0) {
    const onAllowedHost = allowed.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
    if (!onAllowedHost) {
      return { value: trimmed, issue: { code: 'host', host: allowed[0] } };
    }

    // A bare `https://github.com` identifies nobody. Host-restricted fields are
    // profile links, so they need a path — this is what catches someone pasting
    // the site's home page instead of their own profile.
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return { value: trimmed, issue: { code: 'profile_path', host: allowed[0] } };
    }
  }

  return { value: parsed.toString() };
}

/** English sentence for an issue — the API's 400 message and non-localized callers. */
export function profileLinkIssueMessage(field: ProfileLinkField, issue: ProfileLinkIssue): string {
  const label = FIELD_LABEL[field];
  switch (issue.code) {
    case 'too_long':
      return `${label} link must be at most ${issue.max} characters.`;
    case 'invalid':
      return `${label} must be a valid link.`;
    case 'scheme':
      return `${label} must be an http or https link.`;
    case 'host':
      return `${label} link must be on ${issue.host}.`;
    case 'profile_path':
      return `${label} link must point at a profile, e.g. https://${issue.host}/username.`;
  }
}

/**
 * Validates and normalises one link field, with an English error sentence.
 * Same rule as {@link checkProfileLink}; prefer that one wherever the message
 * is shown to a user in their own language.
 */
export function validateProfileLink(
  field: ProfileLinkField,
  raw: string,
  maxLength = 500,
): ProfileLinkResult {
  const { value, issue } = checkProfileLink(field, raw, maxLength);
  return issue ? { value, error: profileLinkIssueMessage(field, issue) } : { value };
}

/**
 * Machine-readable code the API puts on a 400 for a rejected link, e.g.
 * `PROFILE_LINK_WEBSITE_INVALID`. The global exception filter forwards only
 * `message` and `code`, so the field and the reason both travel in the code and
 * the client can show a translated message under the right input.
 */
export function profileLinkErrorCode(field: ProfileLinkField, issue: ProfileLinkIssue): string {
  return `PROFILE_LINK_${field.toUpperCase()}_${issue.code.toUpperCase()}`;
}

/** Inverse of {@link profileLinkErrorCode}; undefined for any other code. */
export function parseProfileLinkErrorCode(
  code: string | undefined,
): { field: ProfileLinkField; issue: ProfileLinkIssueCode } | undefined {
  const match = /^PROFILE_LINK_(LINKEDIN|GITHUB|WEBSITE)_(TOO_LONG|INVALID|SCHEME|HOST|PROFILE_PATH)$/.exec(
    code ?? '',
  );
  if (!match) return undefined;
  return {
    field: match[1].toLowerCase() as ProfileLinkField,
    issue: match[2].toLowerCase() as ProfileLinkIssueCode,
  };
}

/** True when `field` is one of the URL-validated profile fields. */
export function isProfileLinkField(field: string): field is ProfileLinkField {
  return field === 'linkedin' || field === 'github' || field === 'website';
}
