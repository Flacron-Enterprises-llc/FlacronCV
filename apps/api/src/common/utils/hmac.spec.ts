import { hmacHex, isHmacSecretConfigured } from './hmac';

describe('hmacHex', () => {
  const secret = 'test-abuse-hmac-secret';

  it('returns a stable hex digest for the same secret and value', () => {
    const a = hmacHex(secret, 'device-token-aaaa');
    const b = hmacHex(secret, 'device-token-aaaa');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not equal the plaintext', () => {
    const digest = hmacHex(secret, '203.0.113.10');
    expect(digest).not.toContain('203.0.113.10');
    expect(digest).not.toBe('203.0.113.10');
  });

  it('changes when the secret or the value changes', () => {
    const base = hmacHex(secret, 'token-1');
    expect(hmacHex(secret, 'token-2')).not.toBe(base);
    expect(hmacHex('other-secret', 'token-1')).not.toBe(base);
  });

  it('returns null when the secret is missing, empty, or whitespace — fail soft', () => {
    expect(hmacHex(undefined, 'token')).toBeNull();
    expect(hmacHex(null, 'token')).toBeNull();
    expect(hmacHex('', 'token')).toBeNull();
    expect(hmacHex('   ', 'token')).toBeNull();
  });

  it('returns null for an empty value even when a secret is set', () => {
    expect(hmacHex(secret, '')).toBeNull();
  });
});

describe('isHmacSecretConfigured', () => {
  it('is false for missing or blank secrets', () => {
    expect(isHmacSecretConfigured(undefined)).toBe(false);
    expect(isHmacSecretConfigured(null)).toBe(false);
    expect(isHmacSecretConfigured('')).toBe(false);
    expect(isHmacSecretConfigured('  ')).toBe(false);
  });

  it('is true when a non-blank secret is present', () => {
    expect(isHmacSecretConfigured('abc')).toBe(true);
  });
});
