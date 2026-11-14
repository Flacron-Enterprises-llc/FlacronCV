import { Logger } from '@nestjs/common';
import { MeterOutcome, MeterRequest, UsageMeter, V1Counter, counterFor } from './usage-meter';

/** The UsersService methods this meter uses (V1's transactional Firestore counters). */
export interface V1UsageCounters {
  reserveAiCredit(uid: string): Promise<boolean>;
  reserveAnalysis(uid: string): Promise<{ ok: boolean; counter: V1Counter }>;
  refundAiCredit(uid: string): Promise<void>;
  refundUsage(uid: string, counter: V1Counter): Promise<void>;
}

const REFUND_ATTEMPTS = 3;

/**
 * V1's own counters, used when the career service is not configured. Same
 * limits as the career catalog (PLAN_CONFIGS mirror it). A reservation is the
 * counter increment; release refunds it, retried so a brief Firestore error
 * does not strand the charge. Commit has nothing left to do.
 */
export class V1CounterMeter implements UsageMeter {
  readonly kind = 'v1_counters' as const;
  private readonly logger = new Logger(V1CounterMeter.name);

  constructor(private readonly counters: V1UsageCounters) {}

  async reserve(request: MeterRequest): Promise<MeterOutcome> {
    let counter: V1Counter = counterFor(request.unit);
    if (request.unit === 'resume_analysis') {
      const reserved = await this.counters.reserveAnalysis(request.uid);
      counter = reserved.counter;
      if (!reserved.ok) return { ok: false, reason: 'exhausted', unit: request.unit, counter };
    } else if (!(await this.counters.reserveAiCredit(request.uid))) {
      return { ok: false, reason: 'exhausted', unit: request.unit, counter };
    }

    let state: 'reserved' | 'committed' | 'released' = 'reserved';
    return {
      ok: true,
      reservation: {
        unit: request.unit,
        counter,
        commit: async () => {
          if (state === 'reserved') state = 'committed';
        },
        release: async () => {
          if (state === 'released') return true;
          if (state === 'committed') return false;
          let lastError: unknown;
          for (let attempt = 0; attempt < REFUND_ATTEMPTS; attempt++) {
            try {
              if (counter === 'aiCredits') await this.counters.refundAiCredit(request.uid);
              else await this.counters.refundUsage(request.uid, counter);
              state = 'released';
              return true;
            } catch (err) {
              lastError = err;
            }
          }
          // Same log text as before the meter existed, so production greps stay valid.
          this.logger.error(`Failed to refund AI credit for ${request.uid}: ${(lastError as Error).message}`);
          return false;
        },
      },
    };
  }
}
