import axios from 'axios';
import { ALLOWANCES } from '../../../../packages/career-shared/src/catalog';
import { PLAN_CONFIGS } from '../../../../packages/shared-types/src/subscription.types';
import type { SubscriptionPlan as SharedPlan } from '../../../../packages/shared-types/src/enums';
import { formatNumber, t } from '../i18n';
import {
  equivalentPlan,
  isLegacyPlan,
  isPricingPlan,
  lowestPlanMeeting,
  nextPlanUp,
  planName,
  PRICING_PLANS,
  templateTierOfPlan,
  type PlanId,
} from './plan-catalog';

/**
 * Upgrade prompts for every limit the app can meet (CV / cover-letter
 * capacity, DOCX, template tier, Engine credits, résumé analyses, job tracker
 * capacity, exports), worded for the five-plan catalog and driven by the same
 * API error codes the website maps (useApiErrorMessage `knownCodeMessage`):
 * PLAN_NOT_CONFIGURED, CV_LIMIT_REACHED, JOB_CAPACITY_REACHED,
 * ANALYSES_EXHAUSTED, USAGE_METER_UNAVAILABLE, UPGRADE_REQUIRED (+ minimumPlan).
 *
 * Every prompt states the fact. The upgrade line ("Professional includes …")
 * is added only when the app can actually sell that plan (`canUpgrade`), so a
 * build without in-app purchase never points anywhere it cannot deliver.
 */

export type UpgradeReason =
  | 'cvs'
  | 'coverLetters'
  | 'docx'
  | 'templates'
  | 'aiCredits'
  | 'analyses'
  | 'jobCapacity'
  | 'exports'
  | 'meter'
  | 'notOnSale'
  | 'feature';

export interface UpgradePrompt {
  reason: UpgradeReason;
  title: string;
  message: string;
  /** The plan the prompt offers, or null (top plan, or nothing to buy). */
  offeredPlan: PlanId | null;
  /** False for problems an upgrade does not solve (meter outage, not on sale). */
  upgradeable: boolean;
}

export interface PromptContext {
  /** The account's effective plan id (five-plan or legacy). */
  plan: string | null | undefined;
  /** True when the app can sell a plan right now (in-app purchase configured, nothing billed elsewhere). */
  canUpgrade: boolean;
  /** Template name and the tier it needs (templates). */
  templateName?: string;
  requiredTier?: string;
  /** Plan the API named as the minimum (UPGRADE_REQUIRED). */
  minimumPlan?: string | null;
  /** Limit the API reported, when it did. */
  limit?: number | null;
}

const count = (value: number | 'unlimited' | null | undefined): string =>
  value === 'unlimited' || value === null || value === undefined ? t('plans.allowanceTable.unlimited') : formatNumber(value);

function limitsOf(plan: string | null | undefined) {
  return PLAN_CONFIGS[(plan ?? 'free') as SharedPlan]?.limits ?? PLAN_CONFIGS.free.limits;
}

/** The plan to offer: the minimum the API named, else the next of the five above the account's tier. */
function offerFor(reason: UpgradeReason, ctx: PromptContext): PlanId | null {
  if (reason === 'meter' || reason === 'notOnSale') return null;
  const current = equivalentPlan(ctx.plan);
  const minimum =
    lowestPlanMeeting(ctx.minimumPlan) ??
    (reason === 'templates' ? lowestPlanMeeting(ctx.requiredTier) : null) ??
    (reason === 'docx' ? lowestDocxPlan() : null);
  if (minimum && minimum !== current && rank(minimum) > rank(current)) return minimum;
  return nextPlanUp(ctx.plan);
}

/** Commercial order of the five plans (plan ids only — template tiers go through lowestPlanMeeting). */
function rank(plan: PlanId): number {
  return PRICING_PLANS.indexOf(plan);
}

/** DOCX export starts on the lowest plan whose catalog allowance includes it (Starter). */
function lowestDocxPlan(): PlanId | null {
  return PRICING_PLANS.find((p) => ALLOWANCES[p].docxExport) ?? null;
}

function offerLine(reason: UpgradeReason, offered: PlanId): string {
  const plan = planName(offered);
  const allowance = ALLOWANCES[offered];
  const limits = PLAN_CONFIGS[offered as SharedPlan].limits;
  switch (reason) {
    case 'cvs':
      return t('plans.upgrade.offer.cvs', { plan, amount: count(limits.cvs) });
    case 'coverLetters':
      return t('plans.upgrade.offer.coverLetters', { plan, amount: count(limits.coverLetters) });
    case 'aiCredits':
      return t('plans.upgrade.offer.aiCredits', { plan, amount: count(allowance.documentCredits) });
    case 'analyses':
      return t('plans.upgrade.offer.analyses', { plan, amount: count(allowance.resumeAnalyses) });
    case 'jobCapacity':
      return t('plans.upgrade.offer.jobCapacity', { plan, amount: count(limits.trackedApplications) });
    case 'docx':
      return t('plans.upgrade.offer.docx', { plan });
    case 'templates':
      return t('plans.upgrade.offer.templates', { plan, reach: t(`plans.templateReach.${templateTierOfPlan(offered)}`) });
    case 'exports':
      return t('plans.upgrade.offer.exports', { plan });
    default:
      return t('plans.upgrade.offer.feature', { plan });
  }
}

function factFor(reason: UpgradeReason, ctx: PromptContext): string {
  const plan = ctx.plan ?? 'free';
  const name = planName(plan);
  const limits = limitsOf(plan);
  const legacy = isLegacyPlan(plan) || PLAN_CONFIGS[plan as SharedPlan]?.legacy === true;
  const free = equivalentPlan(plan) === 'free' && !legacy;
  switch (reason) {
    case 'cvs': {
      const limit = ctx.limit ?? limits.cvs;
      return t(legacy ? 'plans.upgrade.fact.cvsMonthly' : 'plans.upgrade.fact.cvsCapacity', {
        plan: name,
        limit: count(limit),
        count: typeof limit === 'number' ? limit : 2,
      });
    }
    case 'coverLetters': {
      const limit = ctx.limit ?? limits.coverLetters;
      return t(legacy ? 'plans.upgrade.fact.coverLettersMonthly' : 'plans.upgrade.fact.coverLettersCapacity', {
        plan: name,
        limit: count(limit),
        count: typeof limit === 'number' ? limit : 2,
      });
    }
    case 'docx':
      return t('plans.upgrade.fact.docx', { plan: name, minimum: planName(lowestDocxPlan() ?? 'starter') });
    case 'templates': {
      const minimum = lowestPlanMeeting(ctx.requiredTier) ?? 'starter';
      const reach = t(`plans.templateReach.${limits.templates}`);
      return ctx.templateName
        ? t('plans.upgrade.fact.templatesNamed', { name: ctx.templateName, minimum: planName(minimum), plan: name, reach })
        : t('plans.upgrade.fact.templates', { minimum: planName(minimum), plan: name, reach });
    }
    case 'aiCredits':
      return t(free ? 'plans.upgrade.fact.aiCreditsFree' : 'plans.upgrade.fact.aiCredits');
    case 'analyses':
      return t(free ? 'plans.upgrade.fact.analysesFree' : 'plans.upgrade.fact.analyses');
    case 'jobCapacity':
      return t('plans.upgrade.fact.jobCapacity', { limit: count(ctx.limit ?? limits.trackedApplications) });
    case 'exports':
      return t('plans.upgrade.fact.exports', { limit: count(ctx.limit ?? limits.exports) });
    case 'meter':
      return t('plans.upgrade.fact.meter');
    case 'notOnSale':
      return t('plans.upgrade.fact.notOnSale');
    case 'feature':
    default: {
      const minimum = lowestPlanMeeting(ctx.minimumPlan);
      return minimum ? t('plans.upgrade.fact.featurePlan', { plan: planName(minimum) }) : t('plans.upgrade.fact.feature');
    }
  }
}

/** Builds the prompt for one limit. */
export function upgradePrompt(reason: UpgradeReason, ctx: PromptContext): UpgradePrompt {
  const upgradeable = reason !== 'meter' && reason !== 'notOnSale';
  const offeredPlan = upgradeable ? offerFor(reason, ctx) : null;
  const lines = [factFor(reason, ctx)];
  if (upgradeable && ctx.canUpgrade) {
    lines.push(offeredPlan ? offerLine(reason, offeredPlan) : t('plans.upgrade.topPlan'));
  }
  return {
    reason,
    title: t(`plans.upgrade.title.${reason}`),
    message: lines.join('\n\n'),
    offeredPlan,
    upgradeable,
  };
}

// ─── API errors ──────────────────────────────────────────────────────────────

function body(err: unknown): Record<string, unknown> {
  if (!axios.isAxiosError(err)) return {};
  const data = err.response?.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

export function errorCode(err: unknown): string {
  const code = body(err).code;
  return typeof code === 'string' ? code : '';
}

function errorMessage(err: unknown): string {
  const raw = body(err).message;
  if (typeof raw === 'string') return raw;
  return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').join(' ') : '';
}

function status(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

/**
 * The limit an API refusal is about, by code first (the website's mapping),
 * then by the older English messages the API still sends for cover letters,
 * DOCX, exports and Engine credits. Null for anything that is not a limit.
 */
export function reasonForApiError(err: unknown, hint?: 'cvs' | 'coverLetters' | 'export' | 'ai'): UpgradeReason | null {
  switch (errorCode(err)) {
    case 'CV_LIMIT_REACHED':
      return 'cvs';
    case 'JOB_CAPACITY_REACHED':
      return 'jobCapacity';
    case 'ANALYSES_EXHAUSTED':
      return 'analyses';
    case 'USAGE_METER_UNAVAILABLE':
      return 'meter';
    case 'PLAN_NOT_CONFIGURED':
      return 'notOnSale';
    case 'UPGRADE_REQUIRED':
      return 'feature';
    default:
      break;
  }
  const message = errorMessage(err);
  const code = status(err);
  if (code === 403 && /docx/i.test(message)) return 'docx';
  if (code === 403 && /export limit/i.test(message)) return 'exports';
  if (code === 403 && /cover letter limit/i.test(message)) return 'coverLetters';
  if (code === 403 && /cv limit/i.test(message)) return 'cvs';
  if (code === 403 && /limit reached/i.test(message)) {
    if (hint === 'coverLetters') return 'coverLetters';
    if (hint === 'cvs') return 'cvs';
    if (hint === 'export') return 'exports';
  }
  if ((code === 403 || code === 503 || code === 402) && /credit/i.test(message)) return 'aiCredits';
  return null;
}

/** The prompt for an API refusal, or null when the error is not a plan limit. */
export function promptForApiError(
  err: unknown,
  ctx: Omit<PromptContext, 'minimumPlan' | 'limit'>,
  hint?: 'cvs' | 'coverLetters' | 'export' | 'ai',
): UpgradePrompt | null {
  const reason = reasonForApiError(err, hint);
  if (!reason) return null;
  const data = body(err);
  const minimumPlan = typeof data.minimumPlan === 'string' && isPricingPlan(data.minimumPlan) ? data.minimumPlan : null;
  const limit = typeof data.limit === 'number' && Number.isFinite(data.limit) ? data.limit : null;
  return upgradePrompt(reason, { ...ctx, minimumPlan, limit });
}
