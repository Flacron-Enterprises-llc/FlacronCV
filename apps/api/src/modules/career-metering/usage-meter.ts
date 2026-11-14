/**
 * One way for V1's AI endpoints to spend a metered unit (PLAN_CONTRACT
 * "Metering"), with two implementations:
 *
 * - `V1CounterMeter`: V1's own Firestore counters (`usage.aiCreditsUsed`,
 *   `usage.analysesUsed`), used when the career service is not configured.
 * - `CareerLedgerMeter`: the career service's ledger, used when
 *   `CAREER_API_URL` is set, so document credits and résumé analyses are ONE
 *   pool across the CV builder and the career tools.
 *
 * Contract for callers: reserve before the paid call; `commit()` after a
 * result was produced; `release()` when none was (the unit comes back, so the
 * customer is never charged for a failure). Both are safe to call twice.
 */
export const USAGE_METER = Symbol('USAGE_METER');

/** The units V1 spends. A document credit is one AI writing result; an analysis is one ATS check. */
export type MeteredUnit = 'document_credit' | 'resume_analysis';

/** V1 counter names (UsersService), kept so messages stay exactly as before on the V1 path. */
export type V1Counter = 'aiCredits' | 'analyses';

export interface MeterRequest {
  uid: string;
  unit: MeteredUnit;
  /** What is being done, e.g. `ai.generate`, `ai.ats-check`. Lowercase, digits, `.`, `_`, `-`. */
  operation: string;
  /** The request's Idempotency-Key, when the client sent one: a retry never debits twice. */
  idempotencyKey?: string;
}

export interface MeterReservation {
  readonly unit: MeteredUnit;
  /** The V1 counter actually charged (legacy plans spend an AI credit for an analysis). */
  readonly counter: V1Counter;
  /** The result was produced: the unit is used. */
  commit(): Promise<void>;
  /** No result: give the unit back. Resolves true when it is confirmed returned. */
  release(reason?: string): Promise<boolean>;
}

export type MeterOutcome =
  | { ok: true; reservation: MeterReservation }
  | {
      ok: false;
      /** `exhausted`: no unit left this month; `unavailable`: the meter could not be reached (fail closed). */
      reason: 'exhausted' | 'unavailable';
      unit: MeteredUnit;
      counter: V1Counter;
      /** Next allowance renewal, when the career ledger reported it. */
      renewalDate?: string | null;
    };

export interface UsageMeter {
  readonly kind: 'v1_counters' | 'career_ledger';
  reserve(request: MeterRequest): Promise<MeterOutcome>;
}

export function counterFor(unit: MeteredUnit): V1Counter {
  return unit === 'resume_analysis' ? 'analyses' : 'aiCredits';
}
