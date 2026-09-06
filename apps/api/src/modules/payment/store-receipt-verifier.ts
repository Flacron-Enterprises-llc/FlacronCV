import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, sign } from 'node:crypto';
import { BillingProvider } from '@flacroncv/shared-types';
import { IapProductMap } from './iap-product-map';

const STORE_TIMEOUT_MS = 15_000;
const APPLE_PROD = 'https://api.storekit.itunes.apple.com';
const APPLE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export class StoreNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreNotConfiguredError';
  }
}

export class InvalidStoreReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStoreReceiptError';
  }
}

export class StoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}

export interface VerifiedStorePurchase {
  provider: BillingProvider.APPLE | BillingProvider.GOOGLE;
  productId: string;
  expiresAt: Date;
  originalTransactionId?: string;
  purchaseToken?: string;
}

export interface InspectedStorePurchase {
  provider: BillingProvider.APPLE | BillingProvider.GOOGLE;
  productId: string;
  expiresAt: Date | null;
  originalTransactionId?: string;
  purchaseToken?: string;
  /** Store returned this purchase. */
  found: boolean;
  /** Found and currently entitled (active / grace / cancelled-but-unexpired). */
  entitled: boolean;
}

export interface AppleVerifyInput {
  signedTransactionInfo?: string;
  transactionId?: string;
}

export interface GoogleVerifyInput {
  purchaseToken: string;
}

/**
 * Talks to Apple App Store Server API and Google Play Developer API.
 * Tests replace this class — never hit a live store from a unit test.
 */
@Injectable()
export class StoreReceiptVerifier {
  private readonly logger = new Logger(StoreReceiptVerifier.name);
  private googleAccessToken: { value: string; expiresAtMs: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  async inspectApple(input: AppleVerifyInput): Promise<InspectedStorePurchase> {
    const apple = this.requireAppleConfig();
    const transactionId = this.resolveAppleTransactionId(input);
    let signed: string;
    try {
      signed = await this.fetchAppleSignedTransaction(apple, transactionId);
    } catch (err) {
      if (err instanceof InvalidStoreReceiptError) {
        return {
          provider: BillingProvider.APPLE,
          productId: '',
          expiresAt: null,
          originalTransactionId: transactionId,
          found: false,
          entitled: false,
        };
      }
      throw err;
    }
    const payload = decodeJwsPayload(signed);
    const bundleId = typeof payload.bundleId === 'string' ? payload.bundleId : '';
    if (bundleId !== apple.bundleId) {
      throw new InvalidStoreReceiptError('Apple receipt bundle does not match');
    }
    const productId = typeof payload.productId === 'string' ? payload.productId : '';
    const expiresAt = coerceStoreDate(payload.expiresDate);
    const originalTransactionId =
      (typeof payload.originalTransactionId === 'string' && payload.originalTransactionId) ||
      (typeof payload.transactionId === 'string' && payload.transactionId) ||
      transactionId;
    const revoked = payload.revocationDate != null && payload.revocationDate !== '';
    const entitled =
      !revoked && !!productId && !!expiresAt && expiresAt.getTime() > Date.now();
    return {
      provider: BillingProvider.APPLE,
      productId,
      expiresAt,
      originalTransactionId,
      found: true,
      entitled,
    };
  }

  async inspectGoogle(input: GoogleVerifyInput): Promise<InspectedStorePurchase> {
    const google = this.requireGoogleConfig();
    const token = input.purchaseToken.trim();
    if (!token) {
      throw new InvalidStoreReceiptError('Google purchase token is required');
    }
    const accessToken = await this.googleAccess(google);
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(google.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
    const res = await this.storeFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404 || res.status === 400 || res.status === 410) {
      return {
        provider: BillingProvider.GOOGLE,
        productId: '',
        expiresAt: null,
        purchaseToken: token,
        found: false,
        entitled: false,
      };
    }
    if (res.status === 401 || res.status === 403) {
      throw new StoreUnavailableError('Google Play API rejected the credential');
    }
    if (!res.ok) {
      throw new StoreUnavailableError('Google Play API is unavailable');
    }
    const body = (await res.json()) as {
      subscriptionState?: string;
      lineItems?: Array<{ productId?: string; expiryTime?: string }>;
    };
    const state = body.subscriptionState ?? '';
    const entitledStates = new Set([
      'SUBSCRIPTION_STATE_ACTIVE',
      'SUBSCRIPTION_STATE_CANCELED',
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    ]);
    const line = body.lineItems?.find((item) => item.productId) ?? body.lineItems?.[0];
    const productId = line?.productId ?? '';
    const expiresAt = coerceStoreDate(line?.expiryTime);
    const entitled =
      entitledStates.has(state) &&
      !!productId &&
      !!expiresAt &&
      expiresAt.getTime() > Date.now();
    return {
      provider: BillingProvider.GOOGLE,
      productId,
      expiresAt,
      purchaseToken: token,
      found: true,
      entitled,
    };
  }

  async verifyApple(input: AppleVerifyInput): Promise<VerifiedStorePurchase> {
    const inspected = await this.inspectApple(input);
    return this.requireEntitled(inspected);
  }

  async verifyGoogle(input: GoogleVerifyInput): Promise<VerifiedStorePurchase> {
    const inspected = await this.inspectGoogle(input);
    return this.requireEntitled(inspected);
  }

  private requireEntitled(inspected: InspectedStorePurchase): VerifiedStorePurchase {
    if (!inspected.found || !inspected.entitled || !inspected.expiresAt) {
      throw new InvalidStoreReceiptError('Store purchase is not active');
    }
    return {
      provider: inspected.provider,
      productId: inspected.productId,
      expiresAt: inspected.expiresAt,
      originalTransactionId: inspected.originalTransactionId,
      purchaseToken: inspected.purchaseToken,
    };
  }

  private requireAppleConfig(): {
    bundleId: string;
    issuerId: string;
    keyId: string;
    privateKey: string;
  } {
    const bundleId = this.configService.get<string>('iap.apple.bundleId') ?? '';
    const issuerId = this.configService.get<string>('iap.apple.issuerId') ?? '';
    const keyId = this.configService.get<string>('iap.apple.keyId') ?? '';
    const privateKey = this.configService.get<string>('iap.apple.privateKey') ?? '';
    const products = this.configService.get<IapProductMap>('iap.apple.products') ?? {};
    if (!bundleId || !issuerId || !keyId || !privateKey.trim()) {
      throw new StoreNotConfiguredError('Apple IAP is not configured');
    }
    if (!hasAnyProduct(products)) {
      throw new StoreNotConfiguredError('Apple IAP product ids are not configured');
    }
    return { bundleId, issuerId, keyId, privateKey };
  }

  private requireGoogleConfig(): {
    packageName: string;
    clientEmail: string;
    privateKey: string;
  } {
    const packageName = this.configService.get<string>('iap.google.packageName') ?? '';
    const clientEmail = this.configService.get<string>('iap.google.clientEmail') ?? '';
    const privateKey = this.configService.get<string>('iap.google.privateKey') ?? '';
    const products = this.configService.get<IapProductMap>('iap.google.products') ?? {};
    if (!packageName || !clientEmail || !privateKey.trim()) {
      throw new StoreNotConfiguredError('Google Play Billing is not configured');
    }
    if (!hasAnyProduct(products)) {
      throw new StoreNotConfiguredError('Google Play product ids are not configured');
    }
    return { packageName, clientEmail, privateKey };
  }

  private resolveAppleTransactionId(input: AppleVerifyInput): string {
    const fromBody = input.transactionId?.trim();
    if (fromBody) return fromBody;
    const jws = input.signedTransactionInfo?.trim();
    if (!jws) {
      throw new InvalidStoreReceiptError('Apple transaction id or signed transaction is required');
    }
    const payload = decodeJwsPayload(jws);
    const id =
      (typeof payload.transactionId === 'string' && payload.transactionId) ||
      (typeof payload.originalTransactionId === 'string' && payload.originalTransactionId) ||
      '';
    if (!id) {
      throw new InvalidStoreReceiptError('Apple signed transaction is missing a transaction id');
    }
    return id;
  }

  private async fetchAppleSignedTransaction(
    apple: { issuerId: string; keyId: string; privateKey: string; bundleId: string },
    transactionId: string,
  ): Promise<string> {
    const jwt = signEs256Jwt(
      {
        iss: apple.issuerId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 1200,
        aud: 'appstoreconnect-v1',
        bid: apple.bundleId,
      },
      apple.privateKey,
      apple.keyId,
    );
    const path = `/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    const prod = await this.storeFetch(`${APPLE_PROD}${path}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (prod.status === 404) {
      const sandbox = await this.storeFetch(`${APPLE_SANDBOX}${path}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      return this.readAppleTransactionResponse(sandbox);
    }
    return this.readAppleTransactionResponse(prod);
  }

  private async readAppleTransactionResponse(res: Response): Promise<string> {
    if (res.status === 404 || res.status === 400) {
      throw new InvalidStoreReceiptError('Apple purchase could not be verified');
    }
    if (res.status === 401 || res.status === 403) {
      throw new StoreUnavailableError('Apple App Store API rejected the credential');
    }
    if (!res.ok) {
      throw new StoreUnavailableError('Apple App Store API is unavailable');
    }
    const body = (await res.json()) as { signedTransactionInfo?: string };
    if (!body.signedTransactionInfo) {
      throw new InvalidStoreReceiptError('Apple purchase response was empty');
    }
    return body.signedTransactionInfo;
  }

  private async googleAccess(google: { clientEmail: string; privateKey: string }): Promise<string> {
    const now = Date.now();
    if (this.googleAccessToken && this.googleAccessToken.expiresAtMs > now + 30_000) {
      return this.googleAccessToken.value;
    }
    const assertion = signRs256Jwt(
      {
        iss: google.clientEmail,
        sub: google.clientEmail,
        aud: GOOGLE_TOKEN_URL,
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + 3600,
        scope: GOOGLE_PLAY_SCOPE,
      },
      google.privateKey,
    );
    const res = await this.storeFetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`,
    });
    if (!res.ok) {
      throw new StoreUnavailableError('Google Play token endpoint rejected the credential');
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new StoreUnavailableError('Google Play token endpoint returned no access token');
    }
    const ttlSec = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    this.googleAccessToken = {
      value: body.access_token,
      expiresAtMs: now + ttlSec * 1000,
    };
    return body.access_token;
  }

  private async storeFetch(url: string, init: RequestInit = {}): Promise<Response> {
    if (typeof fetch !== 'function') {
      throw new StoreUnavailableError('Store HTTP client is unavailable');
    }
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(STORE_TIMEOUT_MS) });
    } catch (err) {
      this.logger.warn(`Store request failed: ${(err as Error).name}`);
      throw new StoreUnavailableError('Store request failed');
    }
  }
}

function hasAnyProduct(products: IapProductMap): boolean {
  return Boolean(
    products.proMonthly ||
      products.proYearly ||
      products.enterpriseMonthly ||
      products.enterpriseYearly,
  );
}

export function decodeJwsPayload(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw new InvalidStoreReceiptError('Signed transaction is malformed');
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new InvalidStoreReceiptError('Signed transaction payload is malformed');
  }
}

export function coerceStoreDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      const ms = n < 1e12 ? n * 1000 : n;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function encodeJwtSection(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signEs256Jwt(payload: Record<string, unknown>, pem: string, kid: string): string {
  const header = { alg: 'ES256', kid, typ: 'JWT' };
  const signingInput = `${encodeJwtSection(header)}.${encodeJwtSection(payload)}`;
  const key = createPrivateKey(pem);
  const signature = sign('SHA256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

function signRs256Jwt(payload: Record<string, unknown>, pem: string): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const signingInput = `${encodeJwtSection(header)}.${encodeJwtSection(payload)}`;
  const key = createPrivateKey(pem);
  const signature = sign('SHA256', Buffer.from(signingInput), key);
  return `${signingInput}.${signature.toString('base64url')}`;
}
