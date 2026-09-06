import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoreNotConfiguredError, StoreUnavailableError } from './store-receipt-verifier';

const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_ISS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/**
 * Pub/Sub push OIDC. Unsigned RTDNs must not drive Play lookups or writes.
 */
@Injectable()
export class GoogleRtdnAuth {
  constructor(private readonly configService: ConfigService) {}

  async assert(authorization: string | undefined): Promise<void> {
    const audience = this.configService.get<string>('iap.google.rtdnAudience')?.trim() ?? '';
    if (!audience) {
      throw new StoreNotConfiguredError('Google RTDN audience is not configured');
    }
    const token = bearerToken(authorization);
    if (!token) {
      throw new GoogleRtdnUnauthorizedError();
    }

    let res: Response;
    try {
      res = await fetch(`${TOKENINFO}?id_token=${encodeURIComponent(token)}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new StoreUnavailableError('Google tokeninfo is unavailable');
    }
    if (!res.ok) {
      throw new GoogleRtdnUnauthorizedError();
    }
    const body = (await res.json()) as {
      iss?: string;
      aud?: string;
      email?: string;
      email_verified?: string | boolean;
      exp?: string;
    };
    if (!GOOGLE_ISS.has(body.iss ?? '')) {
      throw new GoogleRtdnUnauthorizedError();
    }
    if (body.aud !== audience) {
      throw new GoogleRtdnUnauthorizedError();
    }
    const exp = Number(body.exp);
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
      throw new GoogleRtdnUnauthorizedError();
    }
    const verified = body.email_verified === true || body.email_verified === 'true';
    if (!verified || !body.email) {
      throw new GoogleRtdnUnauthorizedError();
    }
    const expected = this.configService.get<string>('iap.google.rtdnServiceAccount')?.trim();
    if (expected && body.email !== expected) {
      throw new GoogleRtdnUnauthorizedError();
    }
  }
}

export class GoogleRtdnUnauthorizedError extends Error {
  constructor() {
    super('Google RTDN push token was rejected');
    this.name = 'GoogleRtdnUnauthorizedError';
  }
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)/i.exec(authorization.trim());
  return match?.[1] ?? null;
}
