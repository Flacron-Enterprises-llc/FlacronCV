import { looksLikeScriptedUserAgent, networkIdentifier, normalizeClientIp } from './ip';

describe('normalizeClientIp', () => {
  it('returns IPv4 as-is and unwraps mapped IPv6', () => {
    expect(normalizeClientIp('203.0.113.10')).toBe('203.0.113.10');
    expect(normalizeClientIp('::ffff:203.0.113.10')).toBe('203.0.113.10');
  });

  it('returns null for missing input', () => {
    expect(normalizeClientIp(undefined)).toBeNull();
    expect(normalizeClientIp('  ')).toBeNull();
  });
});

describe('networkIdentifier', () => {
  it('treats an IPv4 address as the network', () => {
    expect(networkIdentifier('203.0.113.10')).toBe('203.0.113.10');
  });

  it('reduces IPv6 to a /64 prefix', () => {
    expect(networkIdentifier('2001:db8:1:2:3:4:5:6')).toBe('2001:0db8:0001:0002::/64');
  });
});

describe('looksLikeScriptedUserAgent', () => {
  it('flags empty and scripted agents', () => {
    expect(looksLikeScriptedUserAgent(undefined)).toBe(true);
    expect(looksLikeScriptedUserAgent('')).toBe(true);
    expect(looksLikeScriptedUserAgent('curl/8.0')).toBe(true);
  });

  it('does not flag an ordinary browser', () => {
    expect(
      looksLikeScriptedUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0',
      ),
    ).toBe(false);
  });
});
