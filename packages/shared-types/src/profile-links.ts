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

/** Human label used in error messages. */
const FIELD_LABEL: Record<ProfileLinkField, string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  website: 'Website',
};

export interface ProfileLinkResult {
  /** The value to store — normalised, or '' when the field was cleared. */
  value: string;
  /** Present when the input is not acceptable; `value` is meaningless then. */
  error?: string;
}

/**
 * Validates and normalises one link field.
 *
 * An empty value is always valid — it clears the field. A value with no scheme
 * gets `https://` prepended rather than rejected: the scheme is the part people
 * leave off when pasting, and refusing `github.com/name` reads as the field
 * being broken rather than as a correction.
 */
export function validateProfileLink(
  field: ProfileLinkField,
  raw: string,
  maxLength = 500,
): ProfileLinkResult {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return { value: '' };

  if (trimmed.length > maxLength) {
    return { value: trimmed, error: `${FIELD_LABEL[field]} link must be at most ${maxLength} characters.` };
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { value: trimmed, error: `${FIELD_LABEL[field]} must be a valid link.` };
  }

  // http/https only. These are rendered as clickable links on a CV that gets
  // shared as a PDF and a public page, so a `javascript:` or `data:` value here
  // is stored XSS with a distribution channel attached.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { value: trimmed, error: `${FIELD_LABEL[field]} must be an http or https link.` };
  }

  if (!parsed.hostname) {
    return { value: trimmed, error: `${FIELD_LABEL[field]} must be a valid link.` };
  }

  const allowed = PROFILE_LINK_HOSTS[field];
  if (allowed.length > 0) {
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    const onAllowedHost = allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
    if (!onAllowedHost) {
      return { value: trimmed, error: `${FIELD_LABEL[field]} link must be on ${allowed[0]}.` };
    }

    // A bare `https://github.com` identifies nobody. Host-restricted fields are
    // profile links, so they need a path — this is what catches someone pasting
    // the site's home page instead of their own profile.
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return {
        value: trimmed,
        error: `${FIELD_LABEL[field]} link must point at a profile, e.g. https://${allowed[0]}/username.`,
      };
    }
  }

  return { value: parsed.toString() };
}

/** True when `field` is one of the URL-validated profile fields. */
export function isProfileLinkField(field: string): field is ProfileLinkField {
  return field === 'linkedin' || field === 'github' || field === 'website';
}
