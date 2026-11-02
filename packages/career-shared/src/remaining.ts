import type { ApplicationStatus } from './applications';
import type { ApplicationAnalytics } from './catalog';

export const MAX_SCENARIO_OPTIONS = 3;
export const MAP_SESSION_MINUTES = 15;
export const SUPPORTED_FORM_SITES = ['example-jobs.test'] as const;
export const REQUIRED_ATTRIBUTION = 'Source: FlacronCV';
export const API_READS_PER_PACKAGE = 10_000;
export const TRANSCRIPTION_LANGUAGES = ['en', 'fr'] as const;
export const TRANSCRIPTION_MIME_TYPES = ['audio/webm', 'audio/wav', 'audio/mp4', 'audio/mpeg'] as const;
export const TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;

const FORBIDDEN = /\b(guaranteed|you will earn|you will be hired)\b/i;

export interface ScenarioOptionInput {
  name: string;
  costCents: number | null;
  months: number | null;
  destination: string;
  wageCents: number | null;
  source: 'user' | 'estimate';
}

export interface ScenarioOptionView {
  name: string;
  costCents: number | null;
  months: number | null;
  destination: string;
  wageCents: number | null;
  wageLabel: 'user_supplied' | 'unknown';
  source: 'user' | 'estimate';
}

export interface ScenarioComparison {
  options: ScenarioOptionView[];
  tradeoff: string;
}

/** Up to three routes. A missing wage stays unknown. */
export function compareScenarios(options: ScenarioOptionInput[]): ScenarioComparison | null {
  if (options.length < 1 || options.length > MAX_SCENARIO_OPTIONS) return null;
  const views: ScenarioOptionView[] = [];
  for (const option of options) {
    const name = option.name.trim();
    const destination = option.destination.trim();
    if (name.length === 0 || destination.length === 0) return null;
    if (option.source !== 'user' && option.source !== 'estimate') return null;
    views.push({
      name,
      destination,
      costCents: wholeOrNull(option.costCents),
      months: wholeOrNull(option.months),
      wageCents: wholeOrNull(option.wageCents),
      wageLabel: wholeOrNull(option.wageCents) === null ? 'unknown' : 'user_supplied',
      source: option.source,
    });
  }
  const tradeoff = 'These are tradeoffs from the values you entered. Missing pay stays unknown. This is not a promise of earnings or employment.';
  if (FORBIDDEN.test(tradeoff)) throw new Error('scenario tradeoff made a promise');
  return { options: views, tradeoff };
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
