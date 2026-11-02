import { generateKeyPairSync, KeyObject, sign } from 'crypto';
import { BillingError } from '../billing/errors';
import type { IdTokenVerifier, SigningKeySource, VerifiedIdentity } from '../identity/id-token';

export const TEST_FIREBASE_PROJECT = 'demo-flacroncv-test';

export interface TokenClaims {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
  /** Seconds since epoch. Defaults to `iat`. */
  authTime?: number;
  /** Seconds since epoch. Defaults to now. */
  iat?: number;
  /** Seconds since epoch. Defaults to `iat` + 1 hour. */
  exp?: number;
  aud?: string;
  iss?: string;
  signInProvider?: string;
}

function payloadFor(claims: TokenClaims, projectId: string): Record<string, unknown> {
  const iat = claims.iat ?? Math.floor(Date.now() / 1000);
  return {
    iss: claims.iss ?? `https://securetoken.google.com/${projectId}`,
    aud: claims.aud ?? projectId,
    auth_time: claims.authTime ?? iat,
    user_id: claims.uid,
    sub: claims.uid,
    iat,
    exp: claims.exp ?? iat + 3600,
    ...(claims.email === undefined || claims.email === null ? {} : { email: claims.email }),
    email_verified: claims.emailVerified ?? false,
    firebase: { sign_in_provider: claims.signInProvider ?? 'password', identities: {} },
  };
}

function segment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** The shape the Firebase Auth emulator issues: `alg: none`, empty signature. */
export function emulatorIdToken(claims: TokenClaims, projectId = TEST_FIREBASE_PROJECT): string {
  return `${segment({ alg: 'none', typ: 'JWT' })}.${segment(payloadFor(claims, projectId))}.`;
}

/** A local RS256 key pair standing in for Google's signing keys. */
export class TestSigningKeys implements SigningKeySource {
  readonly kid = 'test-key-1';
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor() {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
  }

  async key(kid: string): Promise<KeyObject | null> {
    return kid === this.kid ? this.publicKey : null;
  }

  publicPem(): string {
    return this.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  token(claims: TokenClaims, projectId = TEST_FIREBASE_PROJECT, header: Record<string, unknown> = {}): string {
    const signedPart = `${segment({ alg: 'RS256', kid: this.kid, typ: 'JWT', ...header })}.${segment(payloadFor(claims, projectId))}`;
    return `${signedPart}.${sign('RSA-SHA256', Buffer.from(signedPart), this.privateKey).toString('base64url')}`;
  }
}

/**
 * Tests sign in with `fake:<uid>` (or `fake:<uid>:<email>`). Any other
 * string is unauthenticated. `authTime` defaults to now, so a delete
 * counts as a fresh sign-in unless a test moves it.
 */
export class FakeIdTokenVerifier implements IdTokenVerifier {
  private readonly overrides = new Map<string, Partial<VerifiedIdentity>>();

  /** Changes what the next verify of this uid returns, for example an old `authTime`. */
  set(uid: string, identity: Partial<VerifiedIdentity>): void {
    this.overrides.set(uid, identity);
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    const match = /^fake:([A-Za-z0-9_-]{1,128})(?::(.+))?$/.exec(token ?? '');
    if (!match) throw new BillingError('unauthenticated', { reason: 'fake_token' });
    const now = new Date();
    return {
      uid: match[1],
      email: match[2] ?? `${match[1]}@example.test`,
      emailVerified: true,
      authTime: now,
      issuedAt: now,
      signInProvider: 'password',
      ...this.overrides.get(match[1]),
    };
  }
}

export function bearer(uid: string): string {
  return `Bearer fake:${uid}`;
}
