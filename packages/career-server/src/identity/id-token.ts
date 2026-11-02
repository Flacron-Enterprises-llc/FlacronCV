import { createPublicKey, KeyObject, verify as verifySignature, X509Certificate } from 'crypto';
import { BillingError } from '../billing/errors';

/** What the API trusts about the caller after the token check. */
export interface VerifiedIdentity {
  /** Firebase uid. `users.auth_user_id`. */
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** When the person last entered a credential. A "fresh sign-in" is judged from this. */
  authTime: Date;
  issuedAt: Date;
  signInProvider: string | null;
}

export interface IdTokenVerifier {
  /** Throws `unauthenticated` for anything it cannot trust. Never says why to the caller. */
  verify(token: string): Promise<VerifiedIdentity>;
}

/** Public keys by key id. The live source is Google's published certificates. */
export interface SigningKeySource {
  key(kid: string): Promise<KeyObject | null>;
}

/** Allowed difference between our clock and the issuer's, for `iat` and `auth_time`. */
const CLOCK_SKEW_SECONDS = 300;
const MAX_TOKEN_LENGTH = 8192;

interface JwtParts {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signedPart: string;
  signature: Buffer;
}

function deny(reason: string): never {
  throw new BillingError('unauthenticated', { reason });
}

function decodeJwt(token: string): JwtParts {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) deny('malformed');
  const parts = token.split('.');
  if (parts.length !== 3) deny('malformed');
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as unknown;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown;
    if (!isRecord(header) || !isRecord(payload)) deny('malformed');
    return {
      header,
      payload,
      signedPart: `${parts[0]}.${parts[1]}`,
      signature: Buffer.from(parts[2], 'base64url'),
    };
  } catch (error) {
    if (error instanceof BillingError) throw error;
    return deny('malformed');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function seconds(payload: Record<string, unknown>, claim: string): number {
  const value = payload[claim];
  if (typeof value !== 'number' || !Number.isFinite(value)) deny(`claim_${claim}`);
  return value;
}

/**
 * The claim checks Firebase documents for an ID token: issuer and audience
 * are the project, `sub` is a non-empty uid of at most 128 characters, the
 * token is not expired, and it was not issued or authenticated in the
 * future.
 */
function checkClaims(payload: Record<string, unknown>, projectId: string, now: Date): VerifiedIdentity {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.aud !== projectId) deny('audience');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) deny('issuer');
  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 128) deny('subject');
  const exp = seconds(payload, 'exp');
  const iat = seconds(payload, 'iat');
  const authTime = seconds(payload, 'auth_time');
  if (exp <= nowSeconds) deny('expired');
  if (iat > nowSeconds + CLOCK_SKEW_SECONDS) deny('issued_in_future');
  if (authTime > nowSeconds + CLOCK_SKEW_SECONDS) deny('auth_time_in_future');

  const firebase = isRecord(payload.firebase) ? payload.firebase : {};
  return {
    uid: sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    authTime: new Date(authTime * 1000),
    issuedAt: new Date(iat * 1000),
    signInProvider: typeof firebase.sign_in_provider === 'string' ? firebase.sign_in_provider : null,
  };
}

type Now = () => Date;

/**
 * Production check of a Firebase ID token from the existing project
 * (decision 1): RS256, key id from Google's published keys, then the
 * claims. No Firebase Admin SDK.
 */
export class FirebaseIdTokenVerifier implements IdTokenVerifier {
  constructor(
    private readonly projectId: string,
    private readonly keys: SigningKeySource,
    private readonly now: Now = () => new Date(),
  ) {
    if (!projectId) throw new Error('FirebaseIdTokenVerifier needs a project id');
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    const jwt = decodeJwt(token);
    if (jwt.header.alg !== 'RS256') deny('algorithm');
    const kid = jwt.header.kid;
    if (typeof kid !== 'string' || kid.length === 0) deny('key_id');
    const key = await this.keys.key(kid);
    if (!key) deny('unknown_key');
    if (!verifySignature('RSA-SHA256', Buffer.from(jwt.signedPart), key, jwt.signature)) deny('signature');
    return checkClaims(jwt.payload, this.projectId, this.now());
  }
}

/**
 * Local development only. The Firebase Auth emulator signs nothing
 * (`alg: none`), so this checks the claims and nothing else. It refuses to
 * exist in production.
 */
export class EmulatorIdTokenVerifier implements IdTokenVerifier {
  constructor(
    private readonly projectId: string,
    nodeEnv: string,
    private readonly now: Now = () => new Date(),
  ) {
    if (nodeEnv === 'production') throw new Error('The Auth emulator verifier cannot run in production');
    if (!projectId) throw new Error('EmulatorIdTokenVerifier needs a project id');
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    const jwt = decodeJwt(token);
    if (jwt.header.alg !== 'none' || jwt.signature.length !== 0) deny('not_an_emulator_token');
    return checkClaims(jwt.payload, this.projectId, this.now());
  }
}

/** Bound when no verifier is configured. Every request is unauthenticated. */
export class UnconfiguredIdTokenVerifier implements IdTokenVerifier {
  async verify(): Promise<VerifiedIdentity> {
    return deny('not_configured');
  }
}

export const GOOGLE_SECURETOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export type FetchJson = (url: string) => Promise<{ body: unknown; maxAgeSeconds: number | null }>;

/**
 * Google's published signing certificates, cached for the `max-age` the
 * response gives. An unknown key id refetches once per minute at most, so
 * a forged `kid` cannot make every request call Google.
 */
export class GooglePublicKeySource implements SigningKeySource {
  private keys = new Map<string, KeyObject>();
  private expiresAt = 0;
  private lastFetch = 0;

  constructor(
    private readonly fetchJson: FetchJson,
    private readonly url: string = GOOGLE_SECURETOKEN_CERTS_URL,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async key(kid: string): Promise<KeyObject | null> {
    const t = this.now();
    const cached = this.keys.get(kid);
    if (cached && t < this.expiresAt) return cached;
    if (t < this.expiresAt && t - this.lastFetch < 60_000) return null;
    await this.refresh(t);
    return this.keys.get(kid) ?? null;
  }

  private async refresh(t: number): Promise<void> {
    this.lastFetch = t;
    let response: Awaited<ReturnType<FetchJson>>;
    try {
      response = await this.fetchJson(this.url);
    } catch {
      throw new BillingError('provider_unavailable', { provider: 'firebase_keys' });
    }
    if (!isRecord(response.body)) throw new BillingError('provider_unavailable', { provider: 'firebase_keys' });
    const next = new Map<string, KeyObject>();
    for (const [kid, pem] of Object.entries(response.body)) {
      if (typeof pem !== 'string') continue;
      next.set(kid, pem.includes('BEGIN CERTIFICATE') ? new X509Certificate(pem).publicKey : createPublicKey(pem));
    }
    this.keys = next;
    this.expiresAt = t + Math.max(response.maxAgeSeconds ?? 0, 60) * 1000;
  }
}

/** `fetch` with the `Cache-Control: max-age` Google sends. Used only in production. */
export const fetchJsonWithMaxAge: FetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const match = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '');
  return { body: (await res.json()) as unknown, maxAgeSeconds: match ? Number(match[1]) : null };
};

/** A delete needs a credential entered in this attempt (API_CONTRACT `account/delete`). */
export function isFreshSignIn(identity: VerifiedIdentity, now: Date, maxAgeSeconds = 300): boolean {
  return now.getTime() - identity.authTime.getTime() <= maxAgeSeconds * 1000;
}
