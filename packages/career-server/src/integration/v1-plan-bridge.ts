import type { Pool } from 'pg';
import { PLAN_ORDER } from '@flacroncv/career-shared';
import type { ApplicationStatus, PlanId } from '@flacroncv/career-shared';
import type { CapacityGrant } from '../billing/capacity';
import { CatalogStore } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import { syncV1Plan } from '../billing/v1-sync';

/**
 * FlacronCV V1 owns identity, plans, subscriptions and payments. Since the
 * five-plan decision (14 Nov 2026) a V1 plan IS the career plan: the five
 * plans share their ids with the career catalog and map 1:1. The legacy V1
 * plans keep their customers' price and map to the closest career plan.
 * `CAREER_PLAN_MAP` can still override any entry (including `none`).
 */
export const V1_PLANS = ['free', 'starter', 'professional', 'career_pro', 'business', 'pro', 'career_accelerator', 'enterprise'] as const;
export type V1Plan = (typeof V1_PLANS)[number];

export type CareerPlanMap = Record<V1Plan, PlanId | null>;

/** PLAN_CONTRACT "Career access for every plan". */
export const DEFAULT_CAREER_PLAN_MAP: Readonly<CareerPlanMap> = Object.freeze({
  free: 'free',
  starter: 'starter',
  professional: 'professional',
  career_pro: 'career_pro',
  business: 'business',
  pro: 'starter',
  career_accelerator: 'professional',
  enterprise: 'career_pro',
});

export function isV1Plan(value: unknown): value is V1Plan {
  return typeof value === 'string' && (V1_PLANS as readonly string[]).includes(value);
}

/**
 * `free:none,pro:professional,career_accelerator:career_pro,enterprise:business`.
 * Unknown V1 plans or career plans are a boot error (named, never echoed
 * with a secret). Omitted V1 plans keep the default map entry.
 */
export function parseCareerPlanMap(raw: string | undefined): CareerPlanMap {
  const map: CareerPlanMap = { ...DEFAULT_CAREER_PLAN_MAP };
  const text = raw?.trim() ?? '';
  if (text.length === 0) return map;
  for (const entry of text.split(',')) {
    const [rawKey, rawValue, extra] = entry.split(':').map((part) => part.trim());
    if (!rawKey || rawValue === undefined || extra !== undefined) {
      throw new Error('CAREER_PLAN_MAP entries must look like v1plan:careerplan');
    }
    if (!isV1Plan(rawKey)) throw new Error(`CAREER_PLAN_MAP names an unknown V1 plan: ${rawKey}`);
    if (rawValue === 'none') {
      map[rawKey] = null;
      continue;
    }
    if (!(PLAN_ORDER as readonly string[]).includes(rawValue)) {
      throw new Error(`CAREER_PLAN_MAP names an unknown career plan: ${rawValue}`);
    }
    map[rawKey] = rawValue as PlanId;
  }
  return map;
}

/** What the career service reads about a V1 customer. Read-only; V1 stays the owner. */
export interface V1AccountSnapshot {
  uid: string;
  /** The V1 *effective* plan (`resolveEffectivePlan`), not the stored label. */
  plan: V1Plan;
  /** False once V1 soft-deleted or deactivated the account. */
  active: boolean;
  /**
   * A career entitlement the person bought through V1's billing
   * (`users/{uid}.careerSubscription`, written only by V1's webhook handler).
   * Absent when they never bought one.
   */
  careerPurchase?: CareerPurchase | null;
  /** Billing facts V1 recorded (verified Stripe state). Absent fields are unknown, never guessed. */
  billing?: V1BillingFacts | null;
}

/**
 * What V1's billing says about the period and the add-ons, as V1's own
 * webhook handlers wrote it. Read-only here.
 */
export interface V1BillingFacts {
  /** V1 account creation: the Free allowance anniversary. */
  accountCreatedAt?: Date | null;
  /** The V1 plan subscription period: the paid allowance anniversary. */
  periodStart?: Date | null;
  periodEnd?: Date | null;
  /** Stripe subscription status of the V1 plan (`trialing` during a configured trial). */
  status?: string | null;
  /** One-time packs paid through V1 Stripe (`career_pack_purchases`). */
  packPurchases?: V1PackPurchase[];
  /** Recurring capacity add-ons (`career_capacity_subscriptions`). */
  capacity?: V1CapacitySubscription[];
}

export interface V1PackPurchase {
  /** Checkout Session or PaymentIntent id: the idempotency key of the grant. */
  purchaseRef: string;
  addonId: string;
  purchasedAt: Date;
  amountCents: number | null;
  currency: string | null;
  /** `paid` grants; `refunded`/`disputed` revoke the unused units. */
  status: 'paid' | 'refunded' | 'disputed';
  autoTopup?: boolean;
}

export interface V1CapacitySubscription {
  addonId: string;
  quantity: number;
  status: string;
  currentPeriodEnd: Date | null;
}

/** Capacity add-ons that count now: same paid-period rule as a plan (`livePurchasedPlan`). */
export function liveCapacity(subscriptions: readonly V1CapacitySubscription[] | undefined, now: Date): CapacityGrant[] {
  const out: CapacityGrant[] = [];
  for (const sub of subscriptions ?? []) {
    const withinPeriod = sub.currentPeriodEnd !== null && sub.currentPeriodEnd.getTime() > now.getTime();
    const live =
      ((sub.status === 'active' || sub.status === 'trialing') && (sub.currentPeriodEnd === null || withinPeriod)) ||
      ((sub.status === 'past_due' || sub.status === 'canceled') && withinPeriod);
    if (live) out.push({ addonId: sub.addonId, quantity: sub.quantity });
  }
  return out;
}

/** The provider state V1 recorded for a purchased career entitlement. */
export interface CareerPurchase {
  plan: string;
  /** Stripe subscription status as V1 stored it (`active`, `trialing`, `past_due`, `canceled`, …). */
  status: string;
  currentPeriodEnd: Date | null;
  /** `local_fixture` marks an entitlement granted by the local demo seed, never by a payment. */
  source?: string | null;
}

/**
 * Whether a purchased entitlement grants access now. Same rule V1 applies to
 * its own plans (`resolveEffectivePlan`): active or trialing grants; a
 * past-due or cancelling subscription keeps access until the paid period ends;
 * anything else (canceled after period end, unpaid, incomplete, a failed or
 * abandoned checkout) grants nothing.
 */
export function livePurchasedPlan(purchase: CareerPurchase | null | undefined, now: Date): PlanId | null {
  if (!purchase || !(PLAN_ORDER as readonly string[]).includes(purchase.plan) || purchase.plan === 'free') return null;
  const plan = purchase.plan as PlanId;
  const withinPeriod = purchase.currentPeriodEnd !== null && purchase.currentPeriodEnd.getTime() > now.getTime();
  if (purchase.status === 'active' || purchase.status === 'trialing') {
    return purchase.currentPeriodEnd === null || withinPeriod ? plan : null;
  }
  if (purchase.status === 'past_due' || purchase.status === 'canceled') return withinPeriod ? plan : null;
  return null;
}

export interface V1AccountSource {
  read(uid: string): Promise<V1AccountSnapshot | null>;
  /**
   * Statuses of the person's live (not deleted) V1 Jobs-tracker entries, or
   * null when this source has no V1 tracker to read (V2's own tests).
   * V1's tracker is the only application tracker; the career service never writes it.
   */
  jobStatuses(uid: string): Promise<ApplicationStatus[] | null>;
}

/** V1 `JobStatus` → the career outcome status. An accepted offer was an offer. */
const V1_JOB_STATUS: Record<string, ApplicationStatus> = {
  // Current V1 statuses (same ids as the career statuses).
  saved: 'saved',
  preparing: 'preparing',
  applied: 'applied',
  interviewing: 'interviewing',
  offered: 'offered',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
  // Legacy V1 statuses still in old documents (shared-types normalizeJobStatus).
  wishlist: 'saved',
  offer: 'offered',
  accepted: 'offered',
};

/** Unknown or missing V1 statuses are dropped rather than guessed. */
export function careerStatusFromV1(status: unknown): ApplicationStatus | null {
  return typeof status === 'string' && Object.prototype.hasOwnProperty.call(V1_JOB_STATUS, status) ? V1_JOB_STATUS[status] : null;
}

export type CareerAccess =
  | {
      enabled: true;
      v1Plan: V1Plan;
      careerPlan: PlanId;
      source: 'v1_plan_map' | 'purchase';
      /** V1 billing facts for `applyMappedPlan` (period anchor, packs, capacity). Not sent to clients. */
      billing?: V1BillingFacts | null;
    }
  | { enabled: false; v1Plan: V1Plan | null; reason: 'plan_not_mapped' | 'v1_account_missing' | 'v1_account_inactive' };

/**
 * The career plan is the higher of what the V1 plan maps to and a live
 * purchased entitlement. Neither one changes the V1 plan or its benefits.
 */
export function decideCareerAccess(account: V1AccountSnapshot | null, map: CareerPlanMap, now: Date = new Date()): CareerAccess {
  if (!account) return { enabled: false, v1Plan: null, reason: 'v1_account_missing' };
  if (!account.active) return { enabled: false, v1Plan: account.plan, reason: 'v1_account_inactive' };
  const mapped = map[account.plan];
  const purchased = livePurchasedPlan(account.careerPurchase, now);
  if (!mapped && !purchased) return { enabled: false, v1Plan: account.plan, reason: 'plan_not_mapped' };
  const billing = account.billing ?? null;
  if (purchased && (!mapped || PLAN_ORDER.indexOf(purchased) > PLAN_ORDER.indexOf(mapped))) {
    // A legacy career add-on: its own Stripe period is the paid anniversary.
    const addonFacts: V1BillingFacts = {
      ...(billing ?? {}),
      periodStart: null,
      periodEnd: account.careerPurchase?.currentPeriodEnd ?? null,
      status: account.careerPurchase?.status ?? null,
    };
    return { enabled: true, v1Plan: account.plan, careerPlan: purchased, source: 'purchase', billing: addonFacts };
  }
  return { enabled: true, v1Plan: account.plan, careerPlan: mapped as PlanId, source: 'v1_plan_map', billing };
}

/**
 * Brings one career billing account in line with the mapped plan and the V1
 * billing facts (period anchor, packs, capacity add-ons). The rules live in
 * `billing/v1-sync.ts`; see `syncV1Plan`.
 */
export async function applyMappedPlan(
  pool: Pool,
  billingAccountId: string,
  access: Extract<CareerAccess, { enabled: true }>,
  catalogVersion: string,
  now: Date,
  catalogs: CatalogStore = new CatalogStore(),
): Promise<{ changed: boolean; renewed: boolean }> {
  return withTransaction(pool, (db) =>
    syncV1Plan(
      db,
      billingAccountId,
      {
        careerPlan: access.careerPlan,
        v1Plan: access.v1Plan,
        billing: access.billing ?? null,
        packPurchases: access.billing?.packPurchases ?? [],
        capacity: liveCapacity(access.billing?.capacity, now),
      },
      catalogVersion,
      now,
      catalogs,
    ),
  );
}
