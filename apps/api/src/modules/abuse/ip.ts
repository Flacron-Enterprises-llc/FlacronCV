/**
 * Normalise a client address for hashing. Never log the input.
 *
 * IPv4-mapped IPv6 (`::ffff:a.b.c.d`) becomes the IPv4 form so the same
 * household is not split across two hashes.
 */
export function normalizeClientIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (!ip) return null;

  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }

  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return mapped[1];

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip;

  const zone = ip.indexOf('%');
  if (zone >= 0) ip = ip.slice(0, zone);

  if (ip.includes(':')) return ip.toLowerCase();

  return ip;
}

/**
 * IPv6 /64 prefix identifier used as the "network" signal. IPv4 public IPs
 * ARE the network — returns the same string so callers can hash once.
 */
export function networkIdentifier(ip: string): string {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip;

  const groups = expandIPv6(ip);
  if (!groups) return ip;
  return `${groups.slice(0, 4).join(':')}::/64`;
}

function expandIPv6(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : [];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    return head.map((h) => h.padStart(4, '0'));
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...Array(missing).fill('0'), ...tail].map((h) => h.padStart(4, '0'));
}

const SCRIPTED_UA = /curl\/|wget\/|python-requests/i;

export function looksLikeScriptedUserAgent(ua: string | undefined | null): boolean {
  if (ua == null) return false;
  const trimmed = ua.trim();
  if (!trimmed) return false;
  return SCRIPTED_UA.test(trimmed);
}
