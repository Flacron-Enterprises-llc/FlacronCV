/**
 * Profile link validation, same rule as the website and the API
 * (`packages/shared-types/src/profile-links.ts` `validateProfileLink`).
 *
 * Why a copy: the shared function relies on the WHATWG `URL` parser. React
 * Native's global `URL` is a regex shim that never throws, keeps the host's
 * case and appends a trailing slash to every URL — so on a phone
 * `github.com/name` would be saved as `https://github.com/name/`, a different
 * value from the one the website saves. This file parses http(s) links itself
 * (no `URL` global) and `profile-links.test.ts` checks it against the shared
 * function, which runs on Node's real WHATWG parser, so the two cannot drift
 * silently. The API still re-validates and normalises every value it stores.
 */

export type ProfileLinkField = 'linkedin' | 'github' | 'website';

export const PROFILE_LINK_FIELDS: readonly ProfileLinkField[] = ['linkedin', 'github', 'website'];

/** Hosts each field may point at; an empty list means any host (Website). */
export const PROFILE_LINK_HOSTS: Record<ProfileLinkField, string[]> = {
  linkedin: ['linkedin.com'],
  github: ['github.com'],
  website: [],
};

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

type ParsedWebUrl = { href: string; hostname: string; pathname: string };
type ParseOutcome = { kind: 'ok'; url: ParsedWebUrl } | { kind: 'invalid' } | { kind: 'not-web' };

/** Validates and normalises one link field. Empty clears; a missing scheme gets https://. */
export function validateProfileLink(
  field: ProfileLinkField,
  raw: string,
  maxLength = 500,
): ProfileLinkResult {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return { value: '' };

  const label = FIELD_LABEL[field];
  if (trimmed.length > maxLength) {
    return { value: trimmed, error: `${label} link must be at most ${maxLength} characters.` };
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  const parsed = parseWebUrl(candidate);
  if (parsed.kind === 'invalid') {
    return { value: trimmed, error: `${label} must be a valid link.` };
  }
  if (parsed.kind === 'not-web') {
    return { value: trimmed, error: `${label} must be an http or https link.` };
  }
  const url = parsed.url;
  if (!url.hostname) {
    return { value: trimmed, error: `${label} must be a valid link.` };
  }

  const allowed = PROFILE_LINK_HOSTS[field];
  if (allowed.length > 0) {
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const onAllowedHost = allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
    if (!onAllowedHost) {
      return { value: trimmed, error: `${label} link must be on ${allowed[0]}.` };
    }
    if (url.pathname === '/' || url.pathname === '') {
      return {
        value: trimmed,
        error: `${label} link must point at a profile, e.g. https://${allowed[0]}/username.`,
      };
    }
  }

  return { value: url.href };
}

// ── Minimal WHATWG-style parser for http(s) URLs ─────────────────────────────

const C0_OR_NON_ASCII = (code: number) => code < 0x20 || code > 0x7e;
const PATH_SET = new Set([' ', '"', '#', '<', '>', '?', '`', '{', '}']);
const QUERY_SET = new Set([' ', '"', '#', '<', '>', "'"]);
const FRAGMENT_SET = new Set([' ', '"', '<', '>', '`']);
const USERINFO_SET = new Set([
  ' ', '"', '#', '<', '>', '?', '`', '{', '}', '/', ':', ';', '=', '@', '[', '\\', ']', '^', '|',
]);
const FORBIDDEN_HOST = /[\u0000-\u001f\u007f #%/:<>?@[\\\]^|]/;
const DEFAULT_PORT: Record<string, string> = { http: '80', https: '443' };

function percentEncode(input: string, set: Set<string>): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x80 && (C0_OR_NON_ASCII(code) || set.has(ch))) {
      // encodeURIComponent leaves ' and some others alone; WHATWG does not.
      out += `%${code.toString(16).toUpperCase().padStart(2, '0')}`;
    } else if (C0_OR_NON_ASCII(code)) {
      try {
        out += encodeURIComponent(ch);
      } catch {
        out += '%EF%BF%BD'; // lone surrogate → U+FFFD, as WHATWG does
      }
    } else {
      out += ch;
    }
  }
  return out;
}

function parseIpv4Part(part: string): number | null {
  if (part === '') return null;
  if (/^0[xX][0-9a-fA-F]*$/.test(part)) return part.length === 2 ? 0 : parseInt(part.slice(2), 16);
  if (/^0[0-7]+$/.test(part)) return parseInt(part.slice(1), 8);
  if (/^\d+$/.test(part)) return /^0\d/.test(part) ? null : parseInt(part, 10);
  return null;
}

/** WHATWG treats a host whose last label is numeric as IPv4. null = invalid. */
function normaliseHost(host: string): string | null {
  const labels = host.split('.');
  if (labels.length > 1 && labels[labels.length - 1] === '') labels.pop();
  const last = labels[labels.length - 1] ?? '';
  const endsInNumber = /^\d+$/.test(last) || /^0[xX][0-9a-fA-F]*$/.test(last);
  if (!endsInNumber) return host;

  if (labels.length > 4) return null;
  const numbers = labels.map(parseIpv4Part);
  if (numbers.some((n) => n === null)) return null;
  const nums = numbers as number[];
  const lastNum = nums[nums.length - 1];
  if (nums.slice(0, -1).some((n) => n > 255)) return null;
  if (lastNum >= 256 ** (5 - nums.length)) return null;
  let ipv4 = lastNum;
  nums.slice(0, -1).forEach((n, i) => {
    ipv4 += n * 256 ** (3 - i);
  });
  return [24, 16, 8, 0].map((shift) => Math.floor(ipv4 / 2 ** shift) % 256).join('.');
}

function normalisePath(rawPath: string): string {
  const path = rawPath.replace(/\\/g, '/');
  if (path === '') return '/';
  const segments = path.split('/').slice(1);
  const out: string[] = [];
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    const lower = segment.toLowerCase();
    if (lower === '..' || lower === '.%2e' || lower === '%2e.' || lower === '%2e%2e') {
      out.pop();
      if (isLast) out.push('');
    } else if (lower === '.' || lower === '%2e') {
      if (isLast) out.push('');
    } else {
      out.push(percentEncode(segment, PATH_SET));
    }
  });
  return `/${out.join('/')}`;
}

function parseWebUrl(input: string): ParseOutcome {
  const match = /^([a-z][a-z0-9+.-]*):([\s\S]*)$/i.exec(input);
  if (!match) return { kind: 'invalid' };
  const scheme = match[1].toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return { kind: 'not-web' };

  const rest = match[2].replace(/[\t\n\r]/g, '').replace(/^[/\\]*/, '');
  const authorityEnd = rest.search(/[/\\?#]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const tail = authorityEnd === -1 ? '' : rest.slice(authorityEnd);

  const at = authority.lastIndexOf('@');
  let userinfo = '';
  if (at >= 0) {
    const credentials = authority.slice(0, at);
    const colon = credentials.indexOf(':');
    const user = percentEncode(colon >= 0 ? credentials.slice(0, colon) : credentials, USERINFO_SET);
    const pass = colon >= 0 ? percentEncode(credentials.slice(colon + 1), USERINFO_SET) : '';
    if (user || pass) userinfo = `${user}${pass ? `:${pass}` : ''}@`;
  }
  const hostPort = authority.slice(at + 1);

  let host: string;
  let port = '';
  if (hostPort.startsWith('[')) {
    const close = hostPort.indexOf(']');
    if (close === -1) return { kind: 'invalid' };
    host = hostPort.slice(0, close + 1).toLowerCase();
    const after = hostPort.slice(close + 1);
    if (after !== '' && !after.startsWith(':')) return { kind: 'invalid' };
    port = after.slice(1);
  } else {
    const colon = hostPort.lastIndexOf(':');
    host = colon >= 0 ? hostPort.slice(0, colon) : hostPort;
    port = colon >= 0 ? hostPort.slice(colon + 1) : '';
    if (host.includes('%')) {
      try {
        host = decodeURIComponent(host);
      } catch {
        return { kind: 'invalid' };
      }
    }
    if (host === '' || FORBIDDEN_HOST.test(host)) return { kind: 'invalid' };
    const normalised = normaliseHost(host.toLowerCase());
    if (normalised === null) return { kind: 'invalid' };
    host = normalised;
  }

  if (port !== '') {
    if (!/^\d+$/.test(port) || Number(port) > 65535) return { kind: 'invalid' };
    port = String(Number(port));
    if (port === DEFAULT_PORT[scheme]) port = '';
  }

  const hashIndex = tail.indexOf('#');
  const beforeHash = hashIndex >= 0 ? tail.slice(0, hashIndex) : tail;
  const fragment = hashIndex >= 0 ? tail.slice(hashIndex + 1) : null;
  const queryIndex = beforeHash.indexOf('?');
  const rawPath = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : null;

  const pathname = normalisePath(rawPath);
  const href =
    `${scheme}://${userinfo}${host}${port ? `:${port}` : ''}${pathname}` +
    (query !== null ? `?${percentEncode(query, QUERY_SET)}` : '') +
    (fragment !== null ? `#${percentEncode(fragment, FRAGMENT_SET)}` : '');

  return { kind: 'ok', url: { href, hostname: host, pathname } };
}
