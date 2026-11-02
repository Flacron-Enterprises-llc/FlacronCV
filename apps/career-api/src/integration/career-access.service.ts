import { Inject, Injectable } from '@nestjs/common';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { applyMappedPlan, decideCareerAccess, parseCareerPlanMap } from '@flacroncv/career-server';
import type { CareerAccess, CareerPlanMap, V1AccountSource } from '@flacroncv/career-server';
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

  async forUid(uid: string): Promise<CareerAccess> {
    const now = this.clock.now().getTime();
    const cached = this.accessCache.get(uid);
    if (cached && cached.expiresAt > now) return cached.value;
    const access = decideCareerAccess(await this.source.read(uid), this.map);
    this.accessCache.set(uid, { value: access, expiresAt: now + ACCESS_CACHE_MS });
    return access;
  }

  /** Applies the mapped plan at most once per cache window per account and plan. */
  async syncPlan(billingAccountId: string, access: Extract<CareerAccess, { enabled: true }>): Promise<void> {
    const now = this.clock.now();
    const key = `${access.v1Plan}:${access.careerPlan}`;
    const cached = this.syncCache.get(billingAccountId);
    if (cached && cached.value === key && cached.expiresAt > now.getTime()) return;
    await applyMappedPlan(this.database.connectionPool, billingAccountId, access, CATALOG_VERSION, now);
    this.syncCache.set(billingAccountId, { value: key, expiresAt: now.getTime() + ACCESS_CACHE_MS });
  }

  /** The configured map, for the access endpoint and the operator view. */
  planMap(): CareerPlanMap {
    return { ...this.map };
  }
}

export function careerPlanMapFromEnv(env: NodeJS.ProcessEnv = process.env): CareerPlanMap {
  return parseCareerPlanMap(env.CAREER_PLAN_MAP);
}
