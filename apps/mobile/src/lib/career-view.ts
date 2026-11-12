import { includedUnits, type PlanId } from '../../../../packages/career-shared/src/catalog';
import { FACT_FIELDS } from '../../../../packages/career-shared/src/facts';
import { ApiError } from '../../../../packages/career-api-client/src/client';
import type { CareerAccessView, UsageSummary } from '../../../../packages/career-api-client/src/types';

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
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Headline + explanation for the entitlement card. */
export function describeAccess(state: CareerAccessState): { title: string; body: string; badge?: string } {
  switch (state.kind) {
    case 'off':
      return { title: 'Career tools are not available in this app', body: 'Your FlacronCV plan, CVs, cover letters and Job Tracker work as usual.' };
    case 'loading':
      return { title: 'Checking your career tools…', body: '' };
    case 'offline':
      return { title: 'You are offline', body: 'Career tools need a connection. Nothing was changed. Try again when you are back online.' };
    case 'unavailable':
      return { title: 'Career tools are unavailable right now', body: 'The career service did not answer. Nothing was changed. Please try again later.' };
    case 'v1_inactive':
      return { title: 'Career tools are unavailable for this account', body: 'Your FlacronCV account is not active.' };
    case 'not_included':
      return {
        title: 'Career tools are not included in your plan',
        body: 'Career tools are an optional add-on with their own credits. Your FlacronCV plan, its benefits and its AI credits stay exactly as they are.',
      };
    case 'active': {
      const day = formatDay(state.endsOrRenews);
      const lines: string[] = [];
      if (state.origin === 'local_fixture') {
        lines.push('Local test entitlement for this demo. It is not a purchase and nothing was charged.');
      } else if (state.origin === 'purchase') {
        lines.push('A separate add-on beside your FlacronCV plan. Cancelling it ends only the career tools; your FlacronCV plan continues.');
        if (state.pastDue) lines.push('The last payment for the add-on failed. Access continues until the end of the paid period.');
        if (day) lines.push(state.cancelAtPeriodEnd ? `Ends on ${day}.` : `Renews on ${day}.`);
      } else {
        lines.push('Included with your FlacronCV plan.');
      }
      return {
        title: `Career ${state.planName}`,
        body: lines.join(' '),
        badge: state.origin === 'local_fixture' ? 'TEST ENTITLEMENT' : state.cancelAtPeriodEnd ? 'ENDING' : 'ACTIVE',
      };
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
  { key: 'profile', title: 'Career profile', body: 'Add, edit, confirm or remove the facts your drafts are built from; import a resume and set your preferences.', where: 'app', route: '/(dashboard)/career/profile' },
  { key: 'documents', title: 'Career drafts', body: 'Create, generate, tailor, edit and save career CVs and letters; switch layouts, check readability, export and share.', where: 'app', route: '/(dashboard)/career/documents' },
  { key: 'opportunities', title: 'Job search', body: 'Search your listings, paste a job advert, check it and compare it with your career CV. No live job feed is connected.', where: 'app', route: '/(dashboard)/career/opportunities' },
  { key: 'map', title: 'Map session', body: 'Listings as a list with approximate locations. No map tiles are connected.', where: 'app', route: '/(dashboard)/career/opportunities/map', feature: 'mapSessions' },
  { key: 'alerts', title: 'Alerts', body: 'Saved searches, places, followed companies and the listings they surface.', where: 'app', route: '/(dashboard)/career/alerts', feature: 'alertItems' },
  { key: 'tracker', title: 'Job Tracker', body: 'Your applications stay in the FlacronCV Job Tracker.', where: 'app', route: '/(dashboard)/jobs' },
  { key: 'outcomes', title: 'Application outcomes', body: 'Observed counts from your Job Tracker. Not a hiring probability.', where: 'app', route: '/(dashboard)/career/learning-loop', feature: 'applicationAnalytics' },
  { key: 'evidence', title: 'Evidence vault', body: 'Add, edit and delete proof of your work; attach a photo of a certificate.', where: 'app', route: '/(dashboard)/career/evidence', feature: 'evidenceItems' },
  { key: 'portfolios', title: 'Portfolio pages', body: 'Choose work to show, publish or make a private link, share it and show its QR code.', where: 'app', route: '/(dashboard)/career/portfolios', feature: 'portfolioPages' },
  { key: 'interviews', title: 'Interview practice', body: 'Text interview practice, your sessions and STAR stories.', where: 'app', route: '/(dashboard)/career/interviews', feature: 'textInterviewSessions' },
  { key: 'voice', title: 'Voice practice', body: 'Practice out loud and type what you said. The app does not record audio.', where: 'app', route: '/(dashboard)/career/interviews/voice', feature: 'voiceMinutes' },
  { key: 'action-packs', title: 'Action packs', body: 'Turn a saved opportunity into a tailored application pack with a checklist.', where: 'app', route: '/(dashboard)/career/action-pack', feature: 'actionPacks' },
  { key: 'learning', title: 'Learning plans', body: 'Skill gaps, milestones and a project brief for a target role.', where: 'app', route: '/(dashboard)/career/learning', feature: 'skillReports' },
  { key: 'maintenance', title: 'Career maintenance', body: 'Log achievements and promotion goals; see credentials due within 90 days.', where: 'app', route: '/(dashboard)/career/maintenance' },
  { key: 'scenarios', title: 'Scenario planner', body: 'Compare up to three routes. Missing pay stays unknown.', where: 'app', route: '/(dashboard)/career/scenarios', feature: 'scenarioReports' },
  { key: 'relocation', title: 'Relocation and career modes', body: 'Target locations, relocation plans and the specialist lens for your drafts.', where: 'app', route: '/(dashboard)/career/relocation', feature: 'locationProfiles' },
  { key: 'recruiting', title: 'Recruiting opt-in', body: 'Choose whether employers may see that you opted in. Your email stays private.', where: 'app', route: '/(dashboard)/career/recruiting' },
  { key: 'services', title: 'Human review', body: 'A person reviews selected material. Not bookable yet.', where: 'app', route: '/(dashboard)/career/services' },
  { key: 'data', title: 'Career data', body: 'Export a copy of your career records.', where: 'app', route: '/(dashboard)/career/data' },
  { key: 'forms', title: 'Application form filling', body: 'Uses the desktop browser extension; not available on phones.', where: 'desktop' },
];

export function visibleAreas(features: Record<string, boolean> | undefined): CareerArea[] {
  return CAREER_AREAS.filter((area) => !area.feature || features?.[area.feature] === true);
}

export const WHERE_LABEL: Record<CareerArea['where'], string> = {
  app: '',
  web: 'On the website',
  provider: 'Not available yet',
  desktop: 'Desktop only',
};

/** Messages for career API failures. Never claims a write succeeded. */
export function careerErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'network_error') return 'No connection. Nothing was saved. Check your network and try again.';
    if (error.code === 'revision_conflict')
      return 'This draft changed somewhere else. Reload it before saving again; your edit was not saved.';
    if (error.code === 'feature_unavailable') return 'This career feature is switched off.';
    if (error.code === 'record_deleted') return 'This draft was deleted somewhere else; your edit was not saved.';
    if (error.code === 'plan_upgrade_required' || error.code === 'capacity_exceeded') return 'Your career plan does not include this.';
    if (error.code === 'quota_exhausted') return 'Your career credits for this period are used up.';
    if (error.code === 'provider_unavailable') return 'This needs a service that is not available right now. Nothing was charged.';
    if (error.code === 'rate_limited') return 'Too many requests. Wait a moment and try again.';
    if (error.status === 401) return 'Your session expired. Sign in again.';
    if (error.status === 403) return 'You do not have access to this.';
    if (error.status === 404) return 'This item no longer exists.';
  }
  if (isNetworkFailure(error)) return 'No connection. Nothing was saved. Check your network and try again.';
  return fallback;
}

export const FACT_TYPE_LABEL: Record<string, string> = {
  contact: 'Contact',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skill: 'Skill',
  project: 'Project',
  achievement: 'Achievement',
  certification: 'Certification',
  language: 'Language',
  reference: 'Reference',
};

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
