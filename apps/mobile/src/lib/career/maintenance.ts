import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  AchievementInput,
  CredentialInput,
  CredentialReminder,
  MaintenanceAchievement,
  MaintenanceCredential,
  MaintenancePromotionGoal,
  MaintenanceView,
} from '../../../../../packages/career-api-client/src/types';
import { isCalendarDate } from '../../../../../packages/career-shared/src/remaining';
import { getLocale, hasKey, intlLocale, t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Pure logic for the mobile career-maintenance screen (tested in maintenance.test.ts).
 * Same server rules as the website: titles are trimmed, non-empty and at most
 * 200 characters, details at most 2000; every date is a real YYYY-MM-DD day
 * (2027-02-30 is refused, here and by the server); the server marks
 * credentials due within 90 days and builds the reminder list. A promotion
 * goal is not a confirmed fact. All of it is free.
 */

export const MAX_TITLE = 200;
export const MAX_DETAILS = 2000;
export const MAX_SHORT = 200;

export type TextCheck = { ok: true; value: string } | { ok: false; message: string };
export type OptionalDateCheck = { ok: true; value: string | null } | { ok: false; message: string };

/** Translation key part for each field noun the screen passes as `what`. */
const TITLE_KIND: Record<string, string> = {
  achievement: 'achievement',
  'promotion goal': 'promotionGoal',
  'credential name': 'credentialName',
};

function titleMessage(kind: 'empty' | 'tooLong', what: string): string {
  const field = TITLE_KIND[what];
  const key = `careerPlans.maintenance.check.${kind}.${field}`;
  if (field && hasKey(key)) return t(key, { max: MAX_TITLE });
  return kind === 'empty'
    ? t('careerPlans.maintenance.check.emptyOther', { what })
    : t('careerPlans.maintenance.check.tooLongOther', { what, max: MAX_TITLE });
}

export function checkTitle(raw: string, what: string): TextCheck {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: titleMessage('empty', what) };
  if (value.length > MAX_TITLE) return { ok: false, message: titleMessage('tooLong', what) };
  return { ok: true, value };
}

/**
 * A real calendar day written YYYY-MM-DD (the format the server requires).
 * Rejects impossible days such as 2026-02-30 that the format alone allows.
 */
export function checkExpiryDate(raw: string): TextCheck {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, message: t('careerPlans.maintenance.check.dateFormat') };
  if (!isCalendarDate(value)) return { ok: false, message: t('careerPlans.maintenance.check.dateMissing') };
  return { ok: true, value };
}

/** An optional day: blank is "not set" (null); anything else must be a real YYYY-MM-DD day. */
export function checkOptionalDate(raw: string): OptionalDateCheck {
  const value = raw.trim();
  if (value === '') return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, message: t('careerPlans.maintenance.check.optionalDateFormat') };
  if (!isCalendarDate(value)) return { ok: false, message: t('careerPlans.maintenance.check.dateMissing') };
  return { ok: true, value };
}

function checkShort(raw: string, max: number): TextCheck {
  const value = raw.trim();
  if (value.length > max) return { ok: false, message: t('careerPlans.maintenance.check.textTooLong', { max }) };
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Drafts (the add form and the edit form share them)

export interface AchievementDraft {
  title: string;
  details: string;
  achievedOn: string;
}

export interface GoalDraft {
  desiredTitle: string;
  targetDate: string;
}

export interface CredentialDraft {
  name: string;
  expiresOn: string;
  reviewOn: string;
  issuer: string;
  region: string;
}

export const EMPTY_ACHIEVEMENT: AchievementDraft = { title: '', details: '', achievedOn: '' };
export const EMPTY_GOAL: GoalDraft = { desiredTitle: '', targetDate: '' };
export const EMPTY_CREDENTIAL: CredentialDraft = { name: '', expiresOn: '', reviewOn: '', issuer: '', region: '' };

export function achievementDraft(a: MaintenanceAchievement): AchievementDraft {
  return { title: a.title, details: a.details ?? '', achievedOn: a.achievedOn ?? '' };
}

export function goalDraft(g: MaintenancePromotionGoal): GoalDraft {
  return { desiredTitle: g.desiredTitle, targetDate: g.targetDate ?? '' };
}

export function credentialDraft(c: MaintenanceCredential): CredentialDraft {
  return { name: c.name, expiresOn: c.expiresOn, reviewOn: c.reviewOn ?? '', issuer: c.issuer ?? '', region: c.region ?? '' };
}

export function isBlankDraft(draft: object): boolean {
  return Object.values(draft).every((value) => typeof value !== 'string' || value.trim() === '');
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;
type Checked<T, K extends string> = { ok: true; input: T } | { ok: false; errors: FieldErrors<K> };

/** Validates an achievement and builds the body the API takes (links are kept as they are). */
export function checkAchievement(draft: AchievementDraft): Checked<AchievementInput & { title: string }, keyof AchievementDraft> {
  const errors: FieldErrors<keyof AchievementDraft> = {};
  const title = checkTitle(draft.title, 'achievement');
  if (!title.ok) errors.title = title.message;
  const details = checkShort(draft.details, MAX_DETAILS);
  if (!details.ok) errors.details = details.message;
  const achievedOn = checkOptionalDate(draft.achievedOn);
  if (!achievedOn.ok) errors.achievedOn = achievedOn.message;
  if (!title.ok || !details.ok || !achievedOn.ok) return { ok: false, errors };
  return { ok: true, input: { title: title.value, details: details.value, achievedOn: achievedOn.value } };
}

export function checkGoal(draft: GoalDraft): Checked<{ desiredTitle: string; targetDate: string | null }, keyof GoalDraft> {
  const errors: FieldErrors<keyof GoalDraft> = {};
  const title = checkTitle(draft.desiredTitle, 'promotion goal');
  if (!title.ok) errors.desiredTitle = title.message;
  const targetDate = checkOptionalDate(draft.targetDate);
  if (!targetDate.ok) errors.targetDate = targetDate.message;
  if (!title.ok || !targetDate.ok) return { ok: false, errors };
  return { ok: true, input: { desiredTitle: title.value, targetDate: targetDate.value } };
}

export function checkCredentialDraft(
  draft: CredentialDraft,
): Checked<CredentialInput & { name: string; expiresOn: string }, keyof CredentialDraft> {
  const errors: FieldErrors<keyof CredentialDraft> = {};
  const name = checkTitle(draft.name, 'credential name');
  if (!name.ok) errors.name = name.message;
  const expiresOn = checkExpiryDate(draft.expiresOn);
  if (!expiresOn.ok) errors.expiresOn = expiresOn.message;
  const reviewOn = checkOptionalDate(draft.reviewOn);
  if (!reviewOn.ok) errors.reviewOn = reviewOn.message;
  const issuer = checkShort(draft.issuer, MAX_SHORT);
  if (!issuer.ok) errors.issuer = issuer.message;
  const region = checkShort(draft.region, MAX_SHORT);
  if (!region.ok) errors.region = region.message;
  if (!name.ok || !expiresOn.ok || !reviewOn.ok || !issuer.ok || !region.ok) return { ok: false, errors };
  return {
    ok: true,
    input: { name: name.value, expiresOn: expiresOn.value, reviewOn: reviewOn.value, issuer: issuer.value, region: region.value },
  };
}

/** Kept for callers that only have a name and an expiry date. */
export function checkCredential(name: string, expiresOn: string): { ok: true; name: string; expiresOn: string } | { ok: false; field: 'name' | 'expiresOn'; message: string } {
  const n = checkTitle(name, 'credential name');
  if (!n.ok) return { ok: false, field: 'name', message: n.message };
  const e = checkExpiryDate(expiresOn);
  if (!e.ok) return { ok: false, field: 'expiresOn', message: e.message };
  return { ok: true, name: n.value, expiresOn: e.value };
}

// ---------------------------------------------------------------------------
// Display

/** "31 March 2027" (English; other languages use their own format) for a YYYY-MM-DD day, read as a calendar day (no time-zone shift). */
export function formatExpiry(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString(getLocale() === 'en' ? 'en-GB' : intlLocale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function dueCredentials(view: Pick<MaintenanceView, 'credentials'> | undefined): MaintenanceView['credentials'] {
  return (view?.credentials ?? []).filter((c) => c.due);
}

export function isEmpty(view: Pick<MaintenanceView, 'achievements' | 'promotionGoals' | 'credentials'> | undefined): boolean {
  return !view || view.achievements.length + view.promotionGoals.length + view.credentials.length === 0;
}

/** "Expires in 12 days (1 March 2027)", "Review due today (…)" or "Expired on …". */
export function reminderText(reminder: Pick<CredentialReminder, 'kind' | 'date' | 'daysLeft' | 'expired'>): string {
  const date = formatExpiry(reminder.date);
  if (reminder.expired) return t('careerPlans.maintenance.reminderExpired', { date });
  if (reminder.kind === 'review' && reminder.daysLeft < 0) return t('careerPlans.maintenance.reviewOverdue', { date });
  return reminder.kind === 'review'
    ? t('careerPlans.maintenance.reminderReview', { days: reminder.daysLeft, date })
    : t('careerPlans.maintenance.reminderExpiry', { days: reminder.daysLeft, date });
}

export function goalStatusLabel(status: MaintenancePromotionGoal['status']): string {
  const key = `careerPlans.maintenance.goalStatus.${status}`;
  return hasKey(key) ? t(key) : status;
}

/** Facts about a credential that are known; blanks are left out, never guessed. */
export function credentialLines(c: Pick<MaintenanceCredential, 'expiresOn' | 'reviewOn' | 'issuer' | 'region'>): string[] {
  const lines = [t('careerPlans.maintenance.expires', { date: formatExpiry(c.expiresOn) })];
  if (c.reviewOn) lines.push(t('careerPlans.maintenance.reviewBy', { date: formatExpiry(c.reviewOn) }));
  if (c.issuer) lines.push(t('careerPlans.maintenance.issuedBy', { issuer: c.issuer }));
  if (c.region) lines.push(t('careerPlans.maintenance.validIn', { region: c.region }));
  return lines;
}

/** Links the person made on the website, shown read-only. */
export function linkLabels(item: { factId: string | null; evidenceId: string | null }): string[] {
  const out: string[] = [];
  if (item.factId) out.push(t('careerPlans.maintenance.linkedFact'));
  if (item.evidenceId) out.push(t('careerPlans.maintenance.linkedEvidence'));
  return out;
}

const DATE_FIELDS = new Set(['expiresOn', 'reviewOn', 'achievedOn', 'targetDate']);
/** Server field names that are also draft keys on the screen's forms. */
const FORM_FIELDS = new Set(['title', 'details', 'achievedOn', 'desiredTitle', 'targetDate', 'name', 'expiresOn', 'reviewOn', 'issuer', 'region']);

/** The form field a server refusal points at, so the message shows next to it; null for a general message. */
export function errorField(error: unknown): string | null {
  if (error instanceof ApiError && error.code === 'validation_error' && typeof error.body.field === 'string' && FORM_FIELDS.has(error.body.field)) {
    return error.body.field;
  }
  return null;
}

/** Same refusals the website's maintenance page distinguishes. Never claims a save. */
export function maintenanceErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'validation_error') {
      const field = error.body.field;
      if (field === 'expiresOn') return t('careerPlans.maintenance.errors.dateFormat');
      if (typeof field === 'string' && DATE_FIELDS.has(field)) return t('careerPlans.maintenance.errors.dateInvalid');
      if (field === 'status' && error.body.reason === 'already_confirmed') return t('careerPlans.maintenance.errors.goalConfirmed');
      return t('careerPlans.maintenance.errors.checkText');
    }
    if (error.code === 'not_found') return t('careerPlans.maintenance.errors.notFound');
    if (error.code === 'plan_upgrade_required') return t('careerPlans.maintenance.errors.planUpgrade');
    if (error.code === 'feature_unavailable') return t('careerPlans.maintenance.errors.featureOff');
  }
  return careerErrorMessage(error, t('careerPlans.maintenance.errors.saveFailed'));
}

export function deleteErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'not_found') return t('careerPlans.maintenance.errors.notFound');
  return careerErrorMessage(error, t('careerPlans.maintenance.errors.deleteFailed'));
}

// ---------------------------------------------------------------------------
// Links to a profile fact or an evidence item (optional, chosen by the person).

export interface ItemLinks {
  factId: string;
  evidenceId: string;
}

export const NO_LINKS: ItemLinks = { factId: '', evidenceId: '' };

export function linksOf(item: { factId: string | null; evidenceId: string | null }): ItemLinks {
  return { factId: item.factId ?? '', evidenceId: item.evidenceId ?? '' };
}

/** The body with its links; a blank choice clears the link (null). */
export function withLinks<T extends object>(input: T, links: ItemLinks): T & { factId: string | null; evidenceId: string | null } {
  return { ...input, factId: links.factId || null, evidenceId: links.evidenceId || null };
}

/** A short name for a profile fact in a picker (website MaintenancePanel `factLabel`). */
export function factOptionLabel(fact: { factType: string; value: Record<string, unknown> }): string {
  const v = fact.value;
  const text = (key: string) => (typeof v[key] === 'string' ? (v[key] as string).trim() : '');
  if (fact.factType === 'experience') {
    const label = [text('position'), text('company')].filter(Boolean).join(' · ');
    if (label) return label;
  }
  for (const key of ['title', 'name', 'position', 'institution', 'fullName', 'text']) if (text(key)) return text(key).slice(0, 80);
  return fact.factType;
}

// ---------------------------------------------------------------------------
// "I got this promotion": the only way a goal changes the profile. The person
// either picks the experience fact whose title becomes the goal's title, or
// names the employer of a new role (with an optional start date).

export interface PromotionDraft {
  factId: string;
  company: string;
  startDate: string;
}

export const EMPTY_PROMOTION: PromotionDraft = { factId: '', company: '', startDate: '' };

export type PromotionInput = { experienceFactId: string } | { company: string; startDate: string | null };

export function checkPromotion(draft: PromotionDraft): { ok: true; input: PromotionInput } | { ok: false; field: 'factId' | 'company' | 'startDate'; message: string } {
  if (draft.factId) return { ok: true, input: { experienceFactId: draft.factId } };
  const company = draft.company.trim();
  if (!company) return { ok: false, field: 'factId', message: t('careerPlans.scope.promotion_need_role') };
  if (company.length > MAX_SHORT) return { ok: false, field: 'company', message: t('careerPlans.maintenance.check.textTooLong', { max: MAX_SHORT }) };
  const start = checkOptionalDate(draft.startDate);
  if (!start.ok) return { ok: false, field: 'startDate', message: start.message };
  return { ok: true, input: { company, startDate: start.value } };
}
