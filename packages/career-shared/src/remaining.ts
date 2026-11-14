import type { ApplicationStatus } from './applications';
import type { ApplicationAnalytics } from './catalog';

export const MAX_SCENARIO_OPTIONS = 3;
export const MAP_SESSION_MINUTES = 15;
export const SUPPORTED_FORM_SITES = ['example-jobs.test'] as const;
export const REQUIRED_ATTRIBUTION = 'Source: FlacronCV';
export const API_READS_PER_PACKAGE = 10_000;
export const TRANSCRIPTION_LANGUAGES = ['en', 'fr'] as const;
// audio/ogg: Firefox and Android record Opus in an Ogg container.
export const TRANSCRIPTION_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/mpeg'] as const;
export const TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;

const FORBIDDEN = /\b(guaranteed|you will earn|you will be hired)\b/i;

export type ScenarioSource = 'user' | 'market' | 'estimate';
export const SCENARIO_SOURCES: readonly ScenarioSource[] = ['user', 'market', 'estimate'];
export type ScenarioUncertainty = 'low' | 'medium' | 'high' | 'unknown';
export const SCENARIO_UNCERTAINTIES: readonly ScenarioUncertainty[] = ['low', 'medium', 'high', 'unknown'];
export type ScenarioWageLabel = 'user_supplied' | 'market_data' | 'estimate' | 'unknown';

export const SCENARIO_TEXT_MAX = 120;
export const SCENARIO_NOTE_MAX = 500;

/**
 * One route. `source` says where its figures come from: values the person
 * typed (`user`), a published market source they name and date (`market`),
 * or a rough estimate (`estimate`). A missing figure stays null (unknown).
 */
export interface ScenarioOptionInput {
  name: string;
  costCents: number | null;
  months: number | null;
  destination: string;
  wageCents: number | null;
  source: ScenarioSource;
  /** Required for `market`: the publication or dataset the figures come from. */
  sourceName?: string | null;
  /** YYYY-MM-DD the source was published or checked. Required for `market`. */
  sourceDate?: string | null;
  uncertainty?: ScenarioUncertainty;
  /** Known requirements for this route (licences, language, study), as the person wrote them. */
  requirements?: string | null;
  locationProfileId?: string | null;
  skillReportId?: string | null;
}

export interface ScenarioOptionView {
  name: string;
  costCents: number | null;
  months: number | null;
  destination: string;
  wageCents: number | null;
  wageLabel: ScenarioWageLabel;
  source: ScenarioSource;
  sourceName: string | null;
  sourceDate: string | null;
  uncertainty: ScenarioUncertainty;
  requirements: string | null;
  locationProfileId: string | null;
  skillReportId: string | null;
}

export interface ScenarioComparison {
  options: ScenarioOptionView[];
  tradeoff: string;
}

/** A saved comparison, reopened from the list. */
export interface SavedScenario extends ScenarioComparison {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const WAGE_LABEL: Record<ScenarioSource, ScenarioWageLabel> = {
  user: 'user_supplied',
  market: 'market_data',
  estimate: 'estimate',
};

/**
 * Up to three routes. A missing wage stays unknown, and a wage is labelled by
 * where it came from, never as the person's own figure when it is not.
 */
export function compareScenarios(options: ScenarioOptionInput[]): ScenarioComparison | null {
  if (!Array.isArray(options) || options.length < 1 || options.length > MAX_SCENARIO_OPTIONS) return null;
  const views: ScenarioOptionView[] = [];
  for (const option of options) {
    const name = typeof option.name === 'string' ? option.name.trim() : '';
    const destination = typeof option.destination === 'string' ? option.destination.trim() : '';
    if (name.length === 0 || destination.length === 0) return null;
    if (name.length > SCENARIO_TEXT_MAX || destination.length > SCENARIO_TEXT_MAX) return null;
    if (!(SCENARIO_SOURCES as readonly string[]).includes(option.source)) return null;
    const uncertainty = option.uncertainty ?? 'unknown';
    if (!(SCENARIO_UNCERTAINTIES as readonly string[]).includes(uncertainty)) return null;
    const sourceName = optionalText(option.sourceName, SCENARIO_TEXT_MAX);
    if (sourceName === undefined) return null;
    const sourceDate = typeof option.sourceDate === 'string' && option.sourceDate.trim() ? option.sourceDate.trim() : null;
    if (sourceDate !== null && !isCalendarDate(sourceDate)) return null;
    // Market data is only market data when it says which source and when.
    if (option.source === 'market' && (sourceName === null || sourceDate === null)) return null;
    const requirements = optionalText(option.requirements, SCENARIO_NOTE_MAX);
    if (requirements === undefined) return null;
    const wageCents = wholeOrNull(option.wageCents);
    views.push({
      name,
      destination,
      costCents: wholeOrNull(option.costCents),
      months: wholeOrNull(option.months),
      wageCents,
      wageLabel: wageCents === null ? 'unknown' : WAGE_LABEL[option.source],
      source: option.source,
      sourceName,
      sourceDate,
      uncertainty,
      requirements,
      locationProfileId: option.locationProfileId ?? null,
      skillReportId: option.skillReportId ?? null,
    });
  }
  const tradeoff = 'These are tradeoffs from the values you entered. Missing pay stays unknown. This is not a promise of earnings or employment.';
  if (FORBIDDEN.test(tradeoff)) throw new Error('scenario tradeoff made a promise');
  return { options: views, tradeoff };
}

/** Trimmed text or null; undefined when it is too long or not text. */
function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text.length === 0) return null;
  return text.length > max ? undefined : text;
}

/**
 * A real calendar date in YYYY-MM-DD form. "2026-02-31" is refused: Postgres
 * would reject it later, and a browser could roll it into March.
 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export interface LearningLoopInput {
  status: ApplicationStatus;
}

export interface LearningLoopReport {
  sampleSize: number;
  recordedApplications: number;
  unrecorded: number;
  noResponse: number;
  interviews: number;
  offers: number;
  interviewRatePercent: number | null;
  statement: string;
  suggestion: string | null;
  level: ApplicationAnalytics;
}

const RECORDED: readonly ApplicationStatus[] = ['applied', 'interviewing', 'offered', 'rejected', 'withdrawn'];

/** Observed rates only. 2 interviews from 10 recorded applications is 20 percent in that sample. */
export function learningLoopReport(rows: LearningLoopInput[], level: ApplicationAnalytics): LearningLoopReport {
  const recordedRows = rows.filter((row) => RECORDED.includes(row.status));
  const recordedApplications = recordedRows.length;
  const interviews = recordedRows.filter((row) => row.status === 'interviewing' || row.status === 'offered').length;
  const offers = recordedRows.filter((row) => row.status === 'offered').length;
  const noResponse = recordedRows.filter((row) => row.status === 'applied').length;
  const unrecorded = rows.length - recordedApplications;
  const interviewRatePercent = recordedApplications === 0 ? null : Math.round((interviews / recordedApplications) * 100);
  const statement =
    interviewRatePercent === null || level === 'none' || level === 'basic_counts'
      ? `${recordedApplications} recorded applications in this sample. Unrecorded outcomes are counted separately.`
      : `${interviews} interviews from ${recordedApplications} recorded applications is a ${interviewRatePercent} percent observed interview rate in that sample, not a future hiring probability.`;
  const suggestion =
    level === 'trends' || level === 'aggregate'
      ? 'Experiment: add missing evidence to the target-role resume. This is not a hiring probability.'
      : null;
  return {
    sampleSize: rows.length,
    recordedApplications,
    unrecorded,
    noResponse,
    interviews,
    offers,
    interviewRatePercent: level === 'none' || level === 'basic_counts' ? null : interviewRatePercent,
    statement,
    suggestion,
    level,
  };
}

export function isSupportedFormSite(site: string): boolean {
  return (SUPPORTED_FORM_SITES as readonly string[]).includes(site.trim().toLowerCase());
}

export function formReviewResult(confirmed: boolean): { externalSubmitted: false; message: string } | null {
  if (!confirmed) return null;
  return { externalSubmitted: false, message: 'FlacronCV does not send this form.' };
}

export const EXAMPLE_JOBS_FIELD_NAMES = ['full_name', 'email', 'phone', 'notes'] as const;

export type FormFillAvailability = 'unpacked_local';
export type FormFillDistribution = 'unpublished';

export interface FormFillPayload {
  site: string;
  submit: false;
  extension: FormFillAvailability;
  distribution: FormFillDistribution;
  fields: Record<string, string>;
  message: string;
}

export interface FormFillDocument {
  querySelector(selector: string): { value: string; type?: string; click?: () => void } | null;
  querySelectorAll(selector: string): ArrayLike<{ click?: () => void; type?: string }>;
}

/** Reviewed example-jobs.test only. Submit stays false. Store listing stays unpublished. */
export function formFillPayload(input: {
  site: string;
  reviewed: boolean;
  fields?: Record<string, string>;
}): FormFillPayload | null {
  if (!isSupportedFormSite(input.site) || !input.reviewed) return null;
  const fields: Record<string, string> = {};
  for (const name of EXAMPLE_JOBS_FIELD_NAMES) {
    const value = input.fields?.[name]?.trim() ?? '';
    fields[name] = value;
  }
  return {
    site: input.site.trim().toLowerCase(),
    submit: false,
    extension: 'unpacked_local',
    distribution: 'unpublished',
    fields,
    message:
      'A local unpacked Chrome extension can fill this site after you start it. FlacronCV does not send the form. Other sites and a store listing are not published.',
  };
}

/** Fills named inputs. Never clicks submit. */
export function applyReviewedFormFill(doc: FormFillDocument, payload: FormFillPayload): { filled: string[]; submit: false } {
  if (payload.submit !== false) throw new Error('submit_forbidden');
  const filled: string[] = [];
  for (const name of EXAMPLE_JOBS_FIELD_NAMES) {
    const field = doc.querySelector(`[name="${name}"]`);
    if (!field || field.type === 'submit' || field.type === 'button') continue;
    field.value = payload.fields[name] ?? '';
    filled.push(name);
  }
  return { filled, submit: false };
}

export function salesInquiryInput(input: {
  name?: string;
  email?: string;
  organization?: string;
  message?: string;
}): { name: string; email: string; organization: string; message: string } | null {
  const name = input.name?.trim() ?? '';
  const email = input.email?.trim() ?? '';
  const organization = input.organization?.trim() ?? '';
  const message = input.message?.trim() ?? '';
  if (name.length < 2 || name.length > 120) return null;
  if (!email.includes('@') || email.length > 200) return null;
  if (organization.length < 2 || organization.length > 120) return null;
  if (message.length < 10 || message.length > 2000) return null;
  return { name, email, organization, message };
}

export type TranscriptionLanguage = (typeof TRANSCRIPTION_LANGUAGES)[number];

export interface TranscriptionRequest {
  language: TranscriptionLanguage;
  mimeType: string | null;
  byteLength: number;
}

/** Launch languages only. Empty audio is valid for the unconfigured path. */
export function transcriptionRequest(input: {
  language?: string;
  mimeType?: string | null;
  byteLength?: number;
}): TranscriptionRequest | null {
  const language = input.language?.trim().toLowerCase();
  if (language !== 'en' && language !== 'fr') return null;
  const mimeType = input.mimeType?.trim().toLowerCase() || null;
  if (mimeType && !(TRANSCRIPTION_MIME_TYPES as readonly string[]).includes(mimeType)) return null;
  const byteLength = input.byteLength ?? 0;
  if (!Number.isInteger(byteLength) || byteLength < 0 || byteLength > TRANSCRIPTION_MAX_BYTES) return null;
  return { language, mimeType, byteLength };
}

export function credentialIsDue(expiresOn: string, today: string): boolean {
  return expiresOn <= addDays(today, 90);
}

export interface MapSessionView {
  minutes: number;
  approximate: true;
  tiles: null;
  coordinates: null;
  attribution: null;
  provider: null;
}

export function mapSessionView(): MapSessionView {
  return {
    minutes: MAP_SESSION_MINUTES,
    approximate: true,
    tiles: null,
    coordinates: null,
    attribution: null,
    provider: null,
  };
}

function wholeOrNull(value: number | null): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map((part) => Number(part));
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return next.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// CV21 career maintenance

export const MAINTENANCE_TITLE_MAX = 200;
export const MAINTENANCE_DETAILS_MAX = 2000;
/** A credential is "due" this many days before it expires (or its review date). */
export const CREDENTIAL_DUE_DAYS = 90;

export interface MaintenanceAchievement {
  id: string;
  title: string;
  details: string;
  achievedOn: string | null;
  /** The confirmed profile fact this records, when the person linked one. */
  factId: string | null;
  evidenceId: string | null;
}

export type PromotionGoalStatus = 'open' | 'confirmed' | 'dropped';

export interface MaintenancePromotionGoal {
  id: string;
  desiredTitle: string;
  targetDate: string | null;
  status: PromotionGoalStatus;
  /** The experience fact the person updated when they confirmed the promotion. */
  confirmedFactId: string | null;
  confirmedAt: string | null;
}

export interface MaintenanceCredential {
  id: string;
  name: string;
  issuer: string;
  /** Where the credential is valid, as the person recorded it. Never extended to other regions. */
  region: string;
  expiresOn: string;
  reviewOn: string | null;
  due: boolean;
  factId: string | null;
  evidenceId: string | null;
}

/** One entry in the reminder feed: a credential whose expiry or review date is near or past. */
export interface CredentialReminder {
  credentialId: string;
  name: string;
  issuer: string;
  region: string;
  kind: 'expiry' | 'review';
  /** YYYY-MM-DD of the expiry or review. */
  date: string;
  /** Whole days from `today`; negative once the date has passed. */
  daysLeft: number;
  expired: boolean;
}

/**
 * The reminders for a set of credentials as of `today`, soonest first: each
 * credential's review date and expiry date when they are within
 * `CREDENTIAL_DUE_DAYS` (or already past).
 */
export function credentialReminders(
  credentials: ReadonlyArray<Pick<MaintenanceCredential, 'id' | 'name' | 'issuer' | 'region' | 'expiresOn' | 'reviewOn'>>,
  today: string,
): CredentialReminder[] {
  const out: CredentialReminder[] = [];
  for (const credential of credentials) {
    const dates: Array<['expiry' | 'review', string | null]> = [
      ['review', credential.reviewOn],
      ['expiry', credential.expiresOn],
    ];
    for (const [kind, date] of dates) {
      if (!date || !isCalendarDate(date)) continue;
      const daysLeft = daysBetween(today, date);
      if (daysLeft > CREDENTIAL_DUE_DAYS) continue;
      out.push({
        credentialId: credential.id,
        name: credential.name,
        issuer: credential.issuer,
        region: credential.region,
        kind,
        date,
        daysLeft,
        expired: kind === 'expiry' && daysLeft < 0,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// CV23 business workspace (spec section 19)

export const BUSINESS_STAFF_ROLES = ['manager', 'counselor', 'billing_admin'] as const;
export type BusinessStaffRole = (typeof BUSINESS_STAFF_ROLES)[number];
/** The account holder of the Business plan acts with every scope. */
export type BusinessRole = BusinessStaffRole | 'owner';

export function isBusinessStaffRole(value: unknown): value is BusinessStaffRole {
  return typeof value === 'string' && (BUSINESS_STAFF_ROLES as readonly string[]).includes(value);
}

export interface BusinessScope {
  /** Which candidate records the role can open. */
  candidates: 'all' | 'assigned' | 'none';
  /** Invite and remove staff, assign counselors, invite and archive candidates. */
  manageWorkspace: boolean;
  /** Aggregate counts only, never documents. */
  reports: boolean;
  /** Invoices, plan, purchases and usage totals; never candidate documents. */
  billing: boolean;
  /** Read the shared opportunity queue and add to it. */
  queue: boolean;
}

/** Spec section 19. Billing access is separate from candidate documents. */
export const BUSINESS_SCOPES: Record<BusinessRole, BusinessScope> = {
  owner: { candidates: 'all', manageWorkspace: true, reports: true, billing: true, queue: true },
  manager: { candidates: 'all', manageWorkspace: true, reports: true, billing: false, queue: true },
  counselor: { candidates: 'assigned', manageWorkspace: false, reports: false, billing: false, queue: true },
  billing_admin: { candidates: 'none', manageWorkspace: false, reports: false, billing: true, queue: false },
};

/** Invitations (staff and candidates) stop working after this many days, or once revoked. */
export const BUSINESS_INVITE_TTL_DAYS = 14;

export type BusinessCandidateStatus = 'invited' | 'active' | 'archived';

// ---------------------------------------------------------------------------
// API keys (spec section 30)

export type ApiKeyEnvironment = 'test' | 'live';
export const API_KEY_ENVIRONMENTS: readonly ApiKeyEnvironment[] = ['test', 'live'];
/** Requests per key per minute. Test keys are for integration work and get a lower ceiling. */
export const API_KEY_RATE_PER_MINUTE: Record<ApiKeyEnvironment, number> = { test: 30, live: 120 };

/** The visible start of every key says which environment it belongs to. */
export function apiKeyPrefix(environment: ApiKeyEnvironment): string {
  return environment === 'test' ? 'flc_test_' : 'flc_live_';
}

export function apiKeyEnvironmentOf(token: string): ApiKeyEnvironment | null {
  if (token.startsWith('flc_test_')) return 'test';
  if (token.startsWith('flc_live_')) return 'live';
  return null;
}
