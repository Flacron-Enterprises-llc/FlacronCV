import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { currentCaller } from './caller-context';
import { MeterOutcome, MeterRequest, MeterReservation, MeteredUnit, UsageMeter, counterFor } from './usage-meter';

export const CAREER_API_PATH = '/api/career/v1';
const TIMEOUT_MS = 10_000;
const CLOSE_ATTEMPTS = 3;
const OPERATION = /^[a-z0-9][a-z0-9._-]{0,47}$/;

/** What the career API answers for a reservation (`apps/career-api/src/metering/reservations.controller.ts`). */
interface ReservationBody {
  reservationId: string;
  state: 'reserved' | 'committed' | 'released';
  usage?: { renewalDate?: string };
}

interface ErrorBody {
  code?: string;
  renewalDate?: string;
  state?: string;
  topUp?: { eligible?: boolean; addonId?: string };
}

/** Charges an opted-in automatic top-up through V1's Stripe. See `CareerTopUpCharger`. */
export interface TopUpCharger {
  charge(uid: string, addonId: string, reservationKey: string): Promise<boolean>;
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

/** `CAREER_API_URL` is the career service origin; the API path is added unless it is already there. */
export function careerApiBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed.endsWith(CAREER_API_PATH) ? trimmed : `${trimmed}${CAREER_API_PATH}`;
}

/**
 * The career ledger as the single pool for V1's AI endpoints. Calls the
 * career API server-to-server with the caller's OWN ID token, so the career
 * service resolves the same person and V1 can never spend someone else's
 * units. Fails closed: if the ledger cannot be reached, nothing runs
 * unmetered (`unavailable`).
 *
 * Idempotency: the reservation key is derived from the request's
 * Idempotency-Key when the client sent one (a retry is the same reservation),
 * otherwise it is random per call.
 *
 * Automatic top-up: only when the career service says the person opted in
 * (consent + monthly cap + compatible pack) does V1 charge one pack, then
 * reserve once more. Never otherwise.
 */
export class CareerLedgerMeter implements UsageMeter {
  readonly kind = 'career_ledger' as const;
  private readonly logger = new Logger(CareerLedgerMeter.name);
  private readonly base: string;

  constructor(
    careerApiUrl: string,
    private readonly topUp: TopUpCharger | null = null,
    private readonly fetchImpl: Fetch = (globalThis.fetch as unknown as Fetch),
  ) {
    this.base = careerApiBase(careerApiUrl);
  }

  async reserve(request: MeterRequest): Promise<MeterOutcome> {
    const counter = counterFor(request.unit);
    const caller = currentCaller();
    // Only the signed-in person can spend their pool: no token, no reservation.
    if (!caller || (caller.uid !== null && caller.uid !== request.uid)) {
      this.logger.warn(`No caller token for ${request.operation}; refusing to run unmetered`);
      return { ok: false, reason: 'unavailable', unit: request.unit, counter };
    }
    const operation = OPERATION.test(request.operation) ? request.operation : 'ai.generate';
    const clientKey = request.idempotencyKey ?? caller.idempotencyKey;
    const key = clientKey ? `v1:${request.uid}:${operation}:${clientKey}`.slice(0, 255) : `v1:${randomUUID()}`;

    const first = await this.post(caller.idToken, '/metering/reservations', { unit: request.unit, operation }, key);
    if (first.status === 201 || first.status === 200) return this.opened(caller.idToken, request.unit, first.body as ReservationBody, key, operation);

    const error = (first.body ?? {}) as ErrorBody;
    if (first.status === 402 && error.code === 'quota_exhausted') {
      if (error.topUp?.eligible && error.topUp.addonId && this.topUp) {
        const charged = await this.topUp.charge(request.uid, error.topUp.addonId, key).catch((err: Error) => {
          this.logger.warn(`Automatic top-up failed: ${err.message}`);
          return false;
        });
        if (charged) {
          const retryKey = `${key}:topup`.slice(0, 255);
          const retry = await this.post(caller.idToken, '/metering/reservations', { unit: request.unit, operation }, retryKey);
          if (retry.status === 201 || retry.status === 200) {
            return this.opened(caller.idToken, request.unit, retry.body as ReservationBody, retryKey, operation);
          }
        }
      }
      return { ok: false, reason: 'exhausted', unit: request.unit, counter, renewalDate: error.renewalDate ?? null };
    }
    if (first.status === 403 && (error.code === 'plan_upgrade_required' || error.code === 'billing_inactive')) {
      return { ok: false, reason: 'exhausted', unit: request.unit, counter, renewalDate: null };
    }
    this.logger.warn(`Career ledger reserve answered ${first.status}${error.code ? ` ${error.code}` : ''}`);
    return { ok: false, reason: 'unavailable', unit: request.unit, counter };
  }

  private async opened(idToken: string, unit: MeteredUnit, body: ReservationBody, key: string, operation: string): Promise<MeterOutcome> {
    if (body.state === 'released') {
      // This key's earlier attempt failed and was given back: a new attempt needs a new reservation.
      const fresh = `${key}:${randomUUID()}`.slice(0, 255);
      const again = await this.post(idToken, '/metering/reservations', { unit, operation }, fresh);
      if (again.status !== 201 && again.status !== 200) return { ok: false, reason: 'unavailable', unit, counter: counterFor(unit) };
      body = again.body as ReservationBody;
    }
    return { ok: true, reservation: this.reservation(idToken, unit, body) };
  }

  private reservation(idToken: string, unit: MeteredUnit, body: ReservationBody): MeterReservation {
    let state = body.state;
    const path = (action: 'commit' | 'release') => `/metering/reservations/${encodeURIComponent(body.reservationId)}/${action}`;
    return {
      unit,
      counter: counterFor(unit),
      commit: async () => {
        if (state !== 'reserved') return;
        for (let attempt = 0; attempt < CLOSE_ATTEMPTS; attempt++) {
          const res = await this.post(idToken, path('commit'), {});
          if (res.status === 200) {
            state = 'committed';
            return;
          }
          // Already released (the reservation expired): nothing is charged; the result is still delivered.
          if (res.status === 409) {
            this.logger.warn(`Career reservation ${body.reservationId} was closed before commit; not charged`);
            state = ((res.body as ErrorBody | null)?.state as typeof state) ?? 'released';
            return;
          }
        }
        // Left reserved: the career worker releases it after its TTL, so the person is never charged twice.
        this.logger.error(`Could not commit career reservation ${body.reservationId}`);
      },
      release: async (reason = 'provider_failed') => {
        if (state === 'released') return true;
        if (state === 'committed') return false;
        for (let attempt = 0; attempt < CLOSE_ATTEMPTS; attempt++) {
          const res = await this.post(idToken, path('release'), { reason: reason.replace(/[^a-z0-9_]/g, '_').slice(0, 48) || 'released' });
          if (res.status === 200 && (res.body as ReservationBody | null)?.state === 'released') {
            state = 'released';
            return true;
          }
          if (res.status === 409) return false;
        }
        // The career worker releases an open reservation after its TTL; report "not confirmed" now.
        this.logger.error(`Could not release career reservation ${body.reservationId}; the TTL sweep will`);
        return false;
      },
    };
  }

  private async post(idToken: string, path: string, body: unknown, idempotencyKey?: string): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      const res = await this.fetchImpl(`${this.base}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      const parsed = await res.json().catch(() => null);
      return { status: res.status, body: parsed };
    } catch (err) {
      this.logger.warn(`Career ledger unreachable: ${(err as Error).name}`);
      return { status: 0, body: null };
    } finally {
      clearTimeout(timer);
    }
  }
}
