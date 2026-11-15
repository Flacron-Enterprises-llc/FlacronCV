import { includedUnits, type PlanId } from '../../../../packages/career-shared/src/catalog';
import { FACT_FIELDS } from '../../../../packages/career-shared/src/facts';
import { ApiError } from '../../../../packages/career-api-client/src/client';
import type { CareerAccessView, UsageSummary } from '../../../../packages/career-api-client/src/types';
import { formatDate, t } from '../i18n';

/**
 * A label map whose values are read from the translation files at access time
 * (`labelMap('career.factTypes', ['contact', …]).contact` → current language).
 * Every key must exist in the en file under `prefix`.
 */
export function labelMap<K extends string>(prefix: string, keys: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of keys) {
    Object.defineProperty(out, key, { enumerable: true, get: () => t(`${prefix}.${key}`) });
  }
  return out;
}

/**
 * Pure view logic for the mobile career screens (tested in career-view.test.ts).
 *
 * Store rules shape the copy: the app shows whether the career add-on is
 * active and what it includes, never a price, a purchase button or a link to
 * buy elsewhere (Apple 3.1.1 / 3.1.3, Google Play Payments policy). The server
 * decides access; nothing here grants it.
 */

/** V1 API `GET /career-billing/status` → careerSubscription (dates arrive as ISO strings). */
export interface CareerSubscriptionView {
  plan: string | null;
  interval: 'month' | 'year' | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  source: string | null;
}

export const CAREER_PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  career_pro: 'Career Pro',
  business: 'Business',
};

export type CareerAccessState =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'unavailable' }
  | { kind: 'not_included' }
  | { kind: 'v1_inactive' }
  | {
      kind: 'active';
      plan: string;
      planName: string;
      origin: 'purchase' | 'plan_map' | 'local_fixture';
      endsOrRenews: string | null;
      cancelAtPeriodEnd: boolean;
      pastDue: boolean;
    };

export function careerAccessState(input: {
  enabled: boolean;
  loading: boolean;
  error: unknown;
  access: CareerAccessView | undefined;
  subscription: CareerSubscriptionView | null | undefined;
}): CareerAccessState {
  if (!input.enabled) return { kind: 'off' };
  if (input.error) {
    // Unreachable is never "access": the career service decides.
    if (input.error instanceof ApiError && input.error.code === 'network_error') return { kind: 'offline' };
    if (isNetworkFailure(input.error)) return { kind: 'offline' };
    return { kind: 'unavailable' };
  }
  if (input.loading || !input.access) return { kind: 'loading' };
  const access = input.access;
  if (!access.enabled) {
    return access.reason === 'v1_account_inactive' || access.reason === 'v1_account_missing'
      ? { kind: 'v1_inactive' }
      : { kind: 'not_included' };
  }
  const plan = access.careerPlan ?? input.subscription?.plan ?? 'starter';
  const sub = input.subscription ?? null;
  const origin: 'purchase' | 'plan_map' | 'local_fixture' =
    sub?.source === 'local_fixture' ? 'local_fixture' : access.source === 'purchase' ? 'purchase' : 'plan_map';
  return {
    kind: 'active',
    plan,
    planName: CAREER_PLAN_NAMES[plan] ?? plan,
    origin,
    endsOrRenews: origin === 'plan_map' ? null : (sub?.currentPeriodEnd ?? null),
    cancelAtPeriodEnd: Boolean(sub?.cancelAtPeriodEnd),
    pastDue: sub?.status === 'past_due',
  };
}

function isNetworkFailure(error: unknown): boolean {
  // axios (V1 API) network failures have no response.
  return typeof error === 'object' && error !== null && 'isAxiosError' in error && !(error as { response?: unknown }).response;
}

export function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatDate(date, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Headline + explanation for the entitlement card. */
export function describeAccess(state: CareerAccessState): {
  title: string;
  body: string;
  badge?: string;
  badgeKind?: 'test' | 'ending' | 'active';
} {
  switch (state.kind) {
    case 'off':
      return { title: t('career.access.off.title'), body: t('career.access.off.body') };
    case 'loading':
      return { title: t('career.access.loading.title'), body: '' };
    case 'offline':
      return { title: t('career.access.offline.title'), body: t('career.access.offline.body') };
    case 'unavailable':
      return { title: t('career.access.unavailable.title'), body: t('career.access.unavailable.body') };
    case 'v1_inactive':
      return { title: t('career.access.inactive.title'), body: t('career.access.inactive.body') };
    case 'not_included':
      return { title: t('career.access.notIncluded.title'), body: t('career.access.notIncluded.body') };
    case 'active': {
      const day = formatDay(state.endsOrRenews);
      const lines: string[] = [];
      if (state.origin === 'local_fixture') {
        lines.push(t('career.access.localFixture'));
      } else if (state.origin === 'purchase') {
        lines.push(t('career.access.purchase'));
        if (state.pastDue) lines.push(t('career.access.pastDue'));
        if (day) lines.push(state.cancelAtPeriodEnd ? t('career.access.endsOn', { date: day }) : t('career.access.renewsOn', { date: day }));
      } else {
        lines.push(t('career.access.included'));
      }
      const badgeKind = state.origin === 'local_fixture' ? 'test' : state.cancelAtPeriodEnd ? 'ending' : 'active';
      const badge =
        badgeKind === 'test'
          ? t('career.access.badge.test')
          : badgeKind === 'ending'
            ? t('career.access.badge.ending')
            : t('career.access.badge.active');
      return { title: t('career.access.activeTitle', { plan: state.planName }), body: lines.join(' '), badge, badgeKind };
    }
  }
}

/** Remaining career document credits, separate from V1 AI credits. */
export function documentCredits(usage: UsageSummary | undefined, plan: string | null): { remaining: number; granted: number; packs: number } | null {
  const unit = usage?.units.find((u) => u.unit === 'document_credit');
  if (unit) return { remaining: unit.includedRemaining, granted: unit.includedGranted, packs: unit.packRemaining };
  if (!plan || !(plan in CAREER_PLAN_NAMES)) return null;
  const included = includedUnits(plan as PlanId, 'document_credit');
  return included === null ? null : { remaining: included, granted: included, packs: 0 };
}

export type CareerArea = {
  key: string;
  title: string;
  body: string;
  /** app: a screen here · web: on the FlacronCV website · provider: needs a provider not configured · desktop: desktop browser only */
  where: 'app' | 'web' | 'provider' | 'desktop';
  route?: string;
  /** Operator switch from /access `features`; the area is left out when it is off. */
  feature?: string;
};

export const CAREER_AREAS: CareerArea[] = [
  { key: 'profile', get title() { return t('career.areas.profile.title'); }, get body() { return t('career.areas.profile.body'); }, where: 'app', route: '/(dashboard)/career/profile' },
  { key: 'documents', get title() { return t('career.areas.documents.title'); }, get body() { return t('career.areas.documents.body'); }, where: 'app', route: '/(dashboard)/career/documents' },
  { key: 'opportunities', get title() { return t('career.areas.opportunities.title'); }, get body() { return t('career.areas.opportunities.body'); }, where: 'app', route: '/(dashboard)/career/opportunities' },
  { key: 'map', get title() { return t('career.areas.map.title'); }, get body() { return t('career.areas.map.body'); }, where: 'app', route: '/(dashboard)/career/opportunities/map', feature: 'mapSessions' },
  { key: 'alerts', get title() { return t('career.areas.alerts.title'); }, get body() { return t('career.areas.alerts.body'); }, where: 'app', route: '/(dashboard)/career/alerts', feature: 'alertItems' },
  { key: 'reminders', get title() { return t('careerAlerts.remindersScreen.areaTitle'); }, get body() { return t('careerAlerts.remindersScreen.areaBody'); }, where: 'app', route: '/(dashboard)/career/reminders' },
  { key: 'tracker', get title() { return t('career.areas.tracker.title'); }, get body() { return t('career.areas.tracker.body'); }, where: 'app', route: '/(dashboard)/jobs' },
  { key: 'outcomes', get title() { return t('career.areas.outcomes.title'); }, get body() { return t('career.areas.outcomes.body'); }, where: 'app', route: '/(dashboard)/career/learning-loop', feature: 'applicationAnalytics' },
  { key: 'evidence', get title() { return t('career.areas.evidence.title'); }, get body() { return t('career.areas.evidence.body'); }, where: 'app', route: '/(dashboard)/career/evidence', feature: 'evidenceItems' },
  { key: 'portfolios', get title() { return t('career.areas.portfolios.title'); }, get body() { return t('career.areas.portfolios.body'); }, where: 'app', route: '/(dashboard)/career/portfolios', feature: 'portfolioPages' },
  { key: 'interviews', get title() { return t('career.areas.interviews.title'); }, get body() { return t('career.areas.interviews.body'); }, where: 'app', route: '/(dashboard)/career/interviews', feature: 'textInterviewSessions' },
  { key: 'voice', get title() { return t('career.areas.voice.title'); }, get body() { return t('career.areas.voice.body'); }, where: 'app', route: '/(dashboard)/career/interviews/voice', feature: 'voiceMinutes' },
  { key: 'coach', get title() { return t('careerCoach.area.title'); }, get body() { return t('careerCoach.area.body'); }, where: 'app', route: '/(dashboard)/career/coach', feature: 'coachingResponses' },
  { key: 'action-packs', get title() { return t('career.areas.actionPacks.title'); }, get body() { return t('career.areas.actionPacks.body'); }, where: 'app', route: '/(dashboard)/career/action-pack', feature: 'actionPacks' },
  { key: 'learning', get title() { return t('career.areas.learning.title'); }, get body() { return t('career.areas.learning.body'); }, where: 'app', route: '/(dashboard)/career/learning', feature: 'skillReports' },
  { key: 'maintenance', get title() { return t('career.areas.maintenance.title'); }, get body() { return t('career.areas.maintenance.body'); }, where: 'app', route: '/(dashboard)/career/maintenance' },
  { key: 'scenarios', get title() { return t('career.areas.scenarios.title'); }, get body() { return t('career.areas.scenarios.body'); }, where: 'app', route: '/(dashboard)/career/scenarios', feature: 'scenarioReports' },
  { key: 'relocation', get title() { return t('career.areas.relocation.title'); }, get body() { return t('career.areas.relocation.body'); }, where: 'app', route: '/(dashboard)/career/relocation', feature: 'locationProfiles' },
  { key: 'recruiting', get title() { return t('career.areas.recruiting.title'); }, get body() { return t('career.areas.recruiting.body'); }, where: 'app', route: '/(dashboard)/career/recruiting' },
  { key: 'services', get title() { return t('career.areas.services.title'); }, get body() { return t('career.areas.services.body'); }, where: 'app', route: '/(dashboard)/career/services' },
  { key: 'data', get title() { return t('career.areas.data.title'); }, get body() { return t('career.areas.data.body'); }, where: 'app', route: '/(dashboard)/career/data' },
  // Business, developer and forms screens gate themselves (available / coming soon / not in your plan; src/lib/career/nav.ts).
  { key: 'business', get title() { return t('careerBusiness.nav.business'); }, get body() { return t('careerBusiness.scope.businessMetaDescription'); }, where: 'app', route: '/(dashboard)/career/business' },
  { key: 'developer', get title() { return t('careerBusiness.nav.developer'); }, get body() { return t('careerBusiness.scope.developerMetaDescription'); }, where: 'app', route: '/(dashboard)/career/developer' },
  { key: 'forms', get title() { return t('career.areas.forms.title'); }, get body() { return t('career.areas.forms.body'); }, where: 'app', route: '/(dashboard)/career/forms' },
];

export function visibleAreas(features: Record<string, boolean> | undefined): CareerArea[] {
  return CAREER_AREAS.filter((area) => !area.feature || features?.[area.feature] === true);
}

export const WHERE_LABEL: Record<CareerArea['where'], string> = {
  app: '',
  get web() {
    return t('career.where.web');
  },
  get provider() {
    return t('career.where.provider');
  },
  get desktop() {
    return t('career.where.desktop');
  },
};

/** Messages for career API failures. Never claims a write succeeded. */
export function careerErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'network_error') return t('career.errors.network');
    if (error.code === 'revision_conflict')
      return t('career.errors.revisionConflict');
    if (error.code === 'feature_unavailable') return t('career.errors.featureUnavailable');
    if (error.code === 'record_deleted') return t('career.errors.recordDeleted');
    if (error.code === 'plan_upgrade_required' || error.code === 'capacity_exceeded') return t('career.errors.notInPlan');
    if (error.code === 'quota_exhausted') return t('career.errors.quotaExhausted');
    if (error.code === 'provider_unavailable') return t('career.errors.providerUnavailable');
    if (error.code === 'rate_limited') return t('career.errors.rateLimited');
    if (error.status === 401) return t('career.errors.sessionExpired');
    if (error.status === 403) return t('career.errors.forbidden');
    if (error.status === 404) return t('career.errors.notFound');
  }
  if (isNetworkFailure(error)) return t('career.errors.network');
  return fallback;
}

export const FACT_TYPE_LABEL: Record<string, string> = labelMap('career.factTypes', [
  'contact',
  'summary',
  'experience',
  'education',
  'skill',
  'project',
  'achievement',
  'certification',
  'language',
  'reference',
] as const);

/** Title and one detail line for a fact, in the field order the career catalog defines. */
export function factSummary(type: string, value: Record<string, unknown>): { title: string; detail: string } {
  const order = Object.keys((FACT_FIELDS as Record<string, Record<string, unknown>>)[type] ?? value);
  const texts = order
    .map((field) => value[field])
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());
  const title = texts[0] ?? FACT_TYPE_LABEL[type] ?? type;
  const detail = texts.slice(1, 3).join(' · ');
  return { title: title.length > 120 ? `${title.slice(0, 117)}…` : title, detail: detail.length > 140 ? `${detail.slice(0, 137)}…` : detail };
}
