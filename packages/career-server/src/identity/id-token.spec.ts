import { generateKeyPairSync } from 'crypto';
import { isBillingError } from '../billing/errors';
import { emulatorIdToken, TEST_FIREBASE_PROJECT, TestSigningKeys } from '../testing/fake-identity';
import {
  EmulatorIdTokenVerifier,
  FirebaseIdTokenVerifier,
  GooglePublicKeySource,
  isFreshSignIn,
} from './id-token';

const NOW = new Date('2026-10-16T12:00:00Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isBillingError(error, 'unauthenticated')) return String(error.details.reason);
    throw error;
  }
  throw new Error('expected unauthenticated');
}

describe('FirebaseIdTokenVerifier', () => {
  const keys = new TestSigningKeys();
  const verifier = new FirebaseIdTokenVerifier(TEST_FIREBASE_PROJECT, keys, () => NOW);

  it('accepts a token signed by a published key and returns the uid and claims', async () => {
    const identity = await verifier.verify(
      keys.token({ uid: 'uid-1', email: 'a@example.test', emailVerified: true, iat: NOW_S - 10, authTime: NOW_S - 20 }),
    );
    expect(identity).toEqual({
      uid: 'uid-1',
      email: 'a@example.test',
      emailVerified: true,
      authTime: new Date((NOW_S - 20) * 1000),
      issuedAt: new Date((NOW_S - 10) * 1000),
      signInProvider: 'password',
    });
  });

  it('refuses a token signed by another key', async () => {
    const other = new TestSigningKeys();
    expect(await reason(verifier.verify(other.token({ uid: 'uid-1', iat: NOW_S })))).toBe('signature');
  });

  it('refuses a payload changed after signing', async () => {
    const [h, , s] = keys.token({ uid: 'uid-1', iat: NOW_S }).split('.');
    const forged = Buffer.from(
      JSON.stringify({
        iss: `https://securetoken.google.com/${TEST_FIREBASE_PROJECT}`,
        aud: TEST_FIREBASE_PROJECT,
        sub: 'someone-else',
        iat: NOW_S,
        exp: NOW_S + 3600,
        auth_time: NOW_S,
      }),
    ).toString('base64url');
    expect(await reason(verifier.verify(`${h}.${forged}.${s}`))).toBe('signature');
  });

  it('refuses an emulator token (alg none) in the production verifier', async () => {
    expect(await reason(verifier.verify(emulatorIdToken({ uid: 'uid-1', iat: NOW_S })))).toBe('algorithm');
  });

  it('refuses an unknown key id', async () => {
    expect(await reason(verifier.verify(keys.token({ uid: 'u', iat: NOW_S }, TEST_FIREBASE_PROJECT, { kid: 'nope' })))).toBe(
      'unknown_key',
    );
  });

  it.each([
    ['another project', { uid: 'u', iat: NOW_S, aud: 'other-project' }, 'audience'],
    ['another issuer', { uid: 'u', iat: NOW_S, iss: 'https://evil.example' }, 'issuer'],
    ['an expired token', { uid: 'u', iat: NOW_S - 7200, exp: NOW_S - 1 }, 'expired'],
    ['a token issued in the future', { uid: 'u', iat: NOW_S + 3600 }, 'issued_in_future'],
    ['an empty uid', { uid: '', iat: NOW_S }, 'subject'],
    ['a uid over 128 characters', { uid: 'x'.repeat(129), iat: NOW_S }, 'subject'],
  ])('refuses %s', async (_label, claims, expected) => {
    expect(await reason(verifier.verify(keys.token(claims)))).toBe(expected);
  });

  it.each(['', 'abc', 'a.b', 'a.b.c.d', `${'x'.repeat(9000)}.y.z`])('refuses malformed input %#', async (token) => {
    expect(await reason(verifier.verify(token))).toBe('malformed');
  });
});

describe('EmulatorIdTokenVerifier', () => {
  it('cannot be created in production', () => {
    expect(() => new EmulatorIdTokenVerifier(TEST_FIREBASE_PROJECT, 'production')).toThrow(/production/);
  });

  it('accepts an emulator token for the configured project', async () => {
    const verifier = new EmulatorIdTokenVerifier(TEST_FIREBASE_PROJECT, 'development', () => NOW);
    const identity = await verifier.verify(emulatorIdToken({ uid: 'dev-free', iat: NOW_S, email: 'dev-free@example.test' }));
    expect(identity.uid).toBe('dev-free');
    expect(identity.email).toBe('dev-free@example.test');
  });

  it('refuses a signed token and an emulator token for another project', async () => {
    const verifier = new EmulatorIdTokenVerifier(TEST_FIREBASE_PROJECT, 'development', () => NOW);
    expect(await reason(verifier.verify(new TestSigningKeys().token({ uid: 'u', iat: NOW_S })))).toBe(
      'not_an_emulator_token',
    );
    expect(await reason(verifier.verify(emulatorIdToken({ uid: 'u', iat: NOW_S }, 'demo-other')))).toBe('audience');
  });
});

describe('GooglePublicKeySource', () => {
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();

  it('caches keys for max-age and refetches after', async () => {
    let t = 0;
    let calls = 0;
    const source = new GooglePublicKeySource(
      async () => {
        calls += 1;
        return { body: { k1: pem }, maxAgeSeconds: 600 };
      },
      'https://keys.invalid',
      () => t,
    );
    expect(await source.key('k1')).not.toBeNull();
    expect(await source.key('k1')).not.toBeNull();
    expect(calls).toBe(1);
    t = 601_000;
    await source.key('k1');
    expect(calls).toBe(2);
  });

  it('does not refetch on every unknown key id', async () => {
    let t = 0;
    let calls = 0;
    const source = new GooglePublicKeySource(
      async () => {
        calls += 1;
        return { body: { k1: pem }, maxAgeSeconds: 3600 };
      },
      'https://keys.invalid',
      () => t,
    );
    await source.key('k1');
    expect(await source.key('forged-1')).toBeNull();
    expect(await source.key('forged-2')).toBeNull();
    expect(calls).toBe(1);
    t = 61_000;
    await source.key('forged-3');
    expect(calls).toBe(2);
  });

  it('reports provider_unavailable when the keys cannot be fetched', async () => {
    const source = new GooglePublicKeySource(async () => {
      throw new Error('offline');
    }, 'https://keys.invalid');
    await expect(source.key('k1')).rejects.toMatchObject({ code: 'provider_unavailable' });
  });
});

describe('isFreshSignIn', () => {
  it('is true within five minutes of the credential and false after', () => {
    const base = { uid: 'u', email: null, emailVerified: false, issuedAt: NOW, signInProvider: null };
    expect(isFreshSignIn({ ...base, authTime: new Date(NOW.getTime() - 299_000) }, NOW)).toBe(true);
    expect(isFreshSignIn({ ...base, authTime: new Date(NOW.getTime() - 301_000) }, NOW)).toBe(false);
  });
});
