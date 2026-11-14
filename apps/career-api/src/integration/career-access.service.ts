import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { applyMappedPlan, BillingError, businessSponsorFor, decideCareerAccess, parseCareerPlanMap } from '@flacroncv/career-server';
import type { BusinessSponsor, CareerAccess, CareerPlanMap, V1AccountSource } from '@flacroncv/career-server';
import { DatabaseService } from '../database/database.service';

export const V1_ACCOUNT_SOURCE = Symbol('V1_ACCOUNT_SOURCE');
export const CAREER_PLAN_MAP = Symbol('CAREER_PLAN_MAP');
export const ACCESS_CLOCK = Symbol('ACCESS_CLOCK');

/**
 * How long a V1 plan read is reused. A V1 upgrade or cancellation reaches the
 * career features within this window. Short enough that a downgraded
 * customer cannot keep spending for long; long enough that a page with a
 * dozen requests reads Firestore once.
 */
export const ACCESS_CACHE_MS = 30_000;

interface Cached<T> {
  value: T;
  expiresAt: number;
}

/**
 * Decides, per request, whether the caller may use the career features, and
 * keeps the caller's career billing account on the plan their V1 plan maps to.
 * V1 is read, never written.
 */
@Injectable()
export class CareerAccessService {
  private readonly accessCache = new Map<string, Cached<CareerAccess>>();
  private readonly syncCache = new Map<string, Cached<string>>();

  constructor(
    @Inject(V1_ACCOUNT_SOURCE) private readonly source: V1AccountSource,
    @Inject(CAREER_PLAN_MAP) private readonly map: CareerPlanMap,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ACCESS_CLOCK) private readonly clock: { now(): Date },
  ) {}

  /**
   * `fresh` skips the cache: the guard asks for it before anything that could
   * create or change career records, so a V1 account deactivated or deleted a
   * moment ago (and a stale token that still carries a staff claim) is refused
   * before any write. A V1 record that cannot be read is never treated as
   * active: the request fails closed with `provider_unavailable`.
   */
  async forUid(uid: string, options: { fresh?: boolean } = {}): Promise<CareerAccess> {
    const now = this.clock.now().getTime();
    const cached = this.accessCache.get(uid);
    if (!options.fresh && cached && cached.expiresAt > now) return cached.value;
    let account: Awaited<ReturnType<V1AccountSource['read']>>;
    try {
      account = await this.source.read(uid);
    } catch {
      this.accessCache.delete(uid);
      throw new BillingError('provider_unavailable', { reason: 'v1_status_unavailable' });
    }
    const access = decideCareerAccess(account, this.map, this.clock.now());
    this.accessCache.set(uid, { value: access, expiresAt: now + ACCESS_CACHE_MS });
    return access;
  }

  /** Applies the mapped plan at most once per cache window per account and plan. */
  async syncPlan(billingAccountId: string, access: Extract<CareerAccess, { enabled: true }>): Promise<void> {
    const now = this.clock.now();
    // The V1 billing facts are part of the key, so a new pack, a capacity
    // add-on or a new paid period applies on the next request, not 30 s later.
    const key = `${access.v1Plan}:${access.careerPlan}:${JSON.stringify(access.billing ?? null)}`;
    const cached = this.syncCache.get(billingAccountId);
    if (cached && cached.value === key && cached.expiresAt > now.getTime()) return;
    await applyMappedPlan(this.database.connectionPool, billingAccountId, access, CATALOG_VERSION, now);
    this.syncCache.set(billingAccountId, { value: key, expiresAt: now.getTime() + ACCESS_CACHE_MS });
  }

  /**
   * The live Business account that pays for this person, when they are an
   * active accepted Business candidate and their own account is on Free
   * (pooled usage; see business-sponsor.ts). Read per request, uncached, so
   * archiving, leaving or a cancelled Business plan stops it at once.
   */
  businessSponsor(uid: string): Promise<BusinessSponsor | null> {
    return businessSponsorFor(this.database.connectionPool, uid);
  }

  /** The configured map, for the access endpoint and the operator view. */
  planMap(): CareerPlanMap {
    return { ...this.map };
  }
}

export function careerPlanMapFromEnv(env: NodeJS.ProcessEnv = process.env): CareerPlanMap {
  return parseCareerPlanMap(env.CAREER_PLAN_MAP);
}
