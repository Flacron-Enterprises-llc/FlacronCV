import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { DocumentCredit, ResumeVersion, WritingContextInput, WritingType } from '../../../../../packages/career-api-client/src/types';
import {
  COVER_LETTER_TEMPLATES,
  isCoverLetterTemplateId,
  TARGETED_WRITING_TYPES,
  WRITING_CONTEXT_LIMITS,
  type CoverLetterTemplateId,
} from '../../../../../packages/career-shared/src/writing';
import { isCalendarDate } from '../../../../../packages/career-shared/src/remaining';
import { isResumeTemplateId, RESUME_TEMPLATES, type ResumeTemplateId } from '../../../../../packages/career-shared/src/resume';
import { t } from '../../i18n';
import { careerErrorMessage, FACT_TYPE_LABEL, labelMap } from '../career-view';

/**
 * Pure logic for the mobile career drafts (career CVs and letters): template
 * names, readability wording, paid-action keys and failure copy. Mirrors the
 * website's resume studio (apps/web/src/components/career/resume/ResumeScreen.tsx).
 * No React Native or Expo imports, so it runs under vitest.
 */

/** Same names as the website's `career.resume.templates.*` (careerDocuments.templates.resume). */
export const RESUME_TEMPLATE_NAMES: Record<ResumeTemplateId, string> = {
  get classic() { return t('careerDocuments.templates.resume.classic'); },
  get modern() { return t('careerDocuments.templates.resume.modern'); },
  get minimal() { return t('careerDocuments.templates.resume.minimal'); },
  get compact() { return t('careerDocuments.templates.resume.compact'); },
  get academic() { return t('careerDocuments.templates.resume.academic'); },
  get professional() { return t('careerDocuments.templates.resume.professional'); },
  get creative() { return t('careerDocuments.templates.resume.creative'); },
  get executive() { return t('careerDocuments.templates.resume.executive'); },
  get 'two-column'() { return t('careerDocuments.templates.resume.twoColumn'); },
  get bold() { return t('careerDocuments.templates.resume.bold'); },
  get sidebar() { return t('careerDocuments.templates.resume.sidebar'); },
  get topbar() { return t('careerDocuments.templates.resume.topbar'); },
  get 'slate-gold'() { return t('careerDocuments.templates.resume.slateGold'); },
  get editorial() { return t('careerDocuments.templates.resume.editorial'); },
  get structured() { return t('careerDocuments.templates.resume.structured'); },
};

/** Same names as the website's `career.home.letter_template_*`. */
export const LETTER_TEMPLATE_NAMES: Record<CoverLetterTemplateId, string> = labelMap('careerDocuments.templates.letter', [
  'classic',
  'modern',
  'minimalist',
  'creative',
  'corporate',
  'executive',
  'editorial',
  'structured',
] as const);

export type TemplateOption = { id: string; name: string; accent: string };

/** Options whose `name` is read in the current language at render time. */
export const RESUME_TEMPLATE_OPTIONS: TemplateOption[] = RESUME_TEMPLATES.map((tpl) => ({
  id: tpl.id,
  get name() {
    return RESUME_TEMPLATE_NAMES[tpl.id];
  },
  accent: tpl.accent,
}));
export const LETTER_TEMPLATE_OPTIONS: TemplateOption[] = COVER_LETTER_TEMPLATES.map((tpl) => ({
  id: tpl.id,
  get name() {
    return LETTER_TEMPLATE_NAMES[tpl.id];
  },
  accent: tpl.accent,
}));

export function resumeTemplateName(id: string | null | undefined): string {
  if (!id) return '';
  return isResumeTemplateId(id) ? RESUME_TEMPLATE_NAMES[id] : id;
}

export function letterTemplateName(id: string | null | undefined): string {
  if (!id) return '';
  return isCoverLetterTemplateId(id) ? LETTER_TEMPLATE_NAMES[id] : id;
}

export { isCoverLetterTemplateId, isResumeTemplateId };

const WRITING_TYPES = ['cover_letter', 'bio', 'linkedin', 'outreach', 'referral_request', 'thank_you'] as const satisfies readonly WritingType[];

const WRITING_TYPE_LABEL = labelMap('careerDocuments.writingTypes', WRITING_TYPES);

/** The writing type in the current language; an unknown type (newer server) shows its id. */
export function writingTypeLabel(type: string): string {
  return (WRITING_TYPES as readonly string[]).includes(type) ? WRITING_TYPE_LABEL[type as WritingType] : type;
}

export const WRITING_TYPE_OPTIONS: Array<{ id: WritingType; label: string }> = WRITING_TYPES.map((id) => ({
  id,
  get label() {
    return WRITING_TYPE_LABEL[id];
  },
}));

/** Types that name one organization or role: they need a listing or a typed organization/role. */
export function isTargetedWritingType(type: WritingType): boolean {
  return TARGETED_WRITING_TYPES.includes(type);
}

/** Cover letters are written from the listing only; every other type can take the person's own notes. */
export function takesWritingContext(type: WritingType): boolean {
  return type !== 'cover_letter';
}

export type WritingContextDraft = Required<Record<keyof WritingContextInput, string>>;

export const EMPTY_WRITING_CONTEXT: WritingContextDraft = { organization: '', role: '', contactName: '', contactRole: '', interviewDate: '' };

export { WRITING_CONTEXT_LIMITS };

/**
 * The context to send (trimmed, empty fields dropped; the interview date only
 * for thank-you notes), or a message saying what to fix. The draft repeats
 * only these words; the server checks them again.
 */
export function writingContextInput(
  type: WritingType,
  draft: WritingContextDraft,
  hasListing: boolean,
): { ok: true; context: WritingContextInput | undefined } | { ok: false; message: string } {
  if (!takesWritingContext(type)) return { ok: true, context: undefined };
  const context: WritingContextInput = {};
  for (const key of Object.keys(WRITING_CONTEXT_LIMITS) as (keyof typeof WRITING_CONTEXT_LIMITS)[]) {
    const value = draft[key].replace(/\s+/g, ' ').trim();
    if (!value) continue;
    if (value.length > WRITING_CONTEXT_LIMITS[key]) return { ok: false, message: t('careerDocuments.newWriting.tooLong', { max: WRITING_CONTEXT_LIMITS[key] }) };
    context[key] = value;
  }
  if (type === 'thank_you') {
    const date = draft.interviewDate.trim();
    if (date) {
      if (!isCalendarDate(date)) return { ok: false, message: t('careerDocuments.newWriting.dateInvalid') };
      context.interviewDate = date;
    }
  }
  if (isTargetedWritingType(type) && !hasListing && !context.organization && !context.role) {
    return { ok: false, message: t('careerDocuments.paid.targetNeeded') };
  }
  return { ok: true, context: Object.keys(context).length > 0 ? context : undefined };
}

/** Default title for a new career CV (the website uses "Resume"), in the current language. */
export function defaultResumeTitle(): string {
  return t('careerDocuments.defaultTitle');
}

/** The career API accepts a 1–200 character title. Returns an error message, or null when valid. */
export function resumeTitleError(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) return t('careerDocuments.titleEmpty');
  if (trimmed.length > 200) return t('careerDocuments.titleTooLong');
  return null;
}

/** Included plus pack credits; null when unknown. */
export function creditsRemaining(credit: DocumentCredit | null | undefined): number | null {
  if (!credit) return null;
  return credit.includedRemaining + credit.packRemaining;
}

export function creditLine(credit: DocumentCredit | null | undefined): string | null {
  const count = creditsRemaining(credit);
  if (count === null) return null;
  return t('careerDocuments.creditLine', { count });
}

export type ReadabilityIssue = { code: string; section?: string; factId?: string };

/** Same wording as the website's readability check. */
export function readabilityIssueText(issue: ReadabilityIssue): string {
  if (issue.code === 'empty') return t('careerDocuments.readability.empty');
  if (issue.code === 'unconfirmed_version') return t('careerDocuments.readability.unconfirmed');
  if (issue.code === 'missing_section') {
    const section = issue.section ? (FACT_TYPE_LABEL[issue.section] ?? issue.section) : t('careerDocuments.readability.aSection');
    return t('careerDocuments.readability.missingSection', { section });
  }
  return t('careerDocuments.readability.uncertainOne');
}

/** Readability issues, one line each, uncertain lines collapsed into a count. */
export function readabilityLines(issues: ReadabilityIssue[]): string[] {
  const out: string[] = [];
  let uncertain = 0;
  for (const issue of issues) {
    if (issue.code === 'uncertain_line') uncertain += 1;
    else out.push(readabilityIssueText(issue));
  }
  if (uncertain === 1) out.push(t('careerDocuments.readability.uncertainOne'));
  if (uncertain > 1) out.push(t('careerDocuments.readability.uncertainMany', { count: uncertain }));
  return out;
}

/** Lines typed on top of a version that differ from the saved text (same rule as the website's changedLines). */
export function changedLines(version: ResumeVersion | null | undefined, edits: Record<string, string>): Array<{ factId: string; text: string }> {
  if (!version) return [];
  return version.body.sections.flatMap((section) =>
    section.lines.filter((line) => edits[line.factId] !== undefined && edits[line.factId] !== line.text).map((line) => ({ factId: line.factId, text: edits[line.factId] })),
  );
}

/** Patch for a template switch: typed lines are saved together with the template (never for a read-only V1 copy). */
export function templatePatch(
  version: ResumeVersion,
  templateId: string,
  edits: Record<string, string>,
  expectedRevision: number | undefined,
): { templateId: string; lines: Array<{ factId: string; text: string }>; expectedRevision?: number } {
  return { templateId, lines: version.document ? [] : changedLines(version, edits), expectedRevision };
}

/**
 * Idempotency keys for paid actions, kept per action until it settles. A lost
 * response or a server error keeps the key, so a retry of the SAME action is
 * replayed by the server instead of charging twice. A definite answer (any 4xx,
 * or provider_unavailable, whose credit is released) ends the attempt.
 * Same rule as the website's settlePaid.
 */
export function createPaidKeys(newKey: () => string) {
  const keys: Record<string, string> = {};
  return {
    keyFor(action: string): string {
      keys[action] ??= newKey();
      return keys[action];
    },
    settle(action: string, error?: unknown): void {
      if (error === undefined || keyIsSpent(error)) delete keys[action];
    },
    has(action: string): boolean {
      return action in keys;
    },
  };
}

export function isRevisionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'revision_conflict';
}

export function keyIsSpent(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.code === 'provider_unavailable') return true;
  return error.status >= 400 && error.status < 500;
}

const UNUSABLE_REASONS = new Set([
  'current_role_unsupported',
  'ended_role_described_as_current',
  'unsupported_employer',
  'target_as_past_employer',
  'unsupported_date',
  'unusable_output',
  'incomplete_opening',
  'incomplete_body',
  'incomplete_closing',
  'incomplete_letter',
  'missing_evidence',
]);

const NOT_CONFIGURED_REASONS = new Set(['ai_not_configured', 'provider_not_configured', 'not_configured']);

/** Title + body for a failed generate / tailor / write. Never claims a credit was used when it was not. */
export function paidFailure(error: unknown, credit?: DocumentCredit | null): { title: string; body: string } {
  if (error instanceof ApiError) {
    const reason = typeof error.body.reason === 'string' ? error.body.reason : '';
    if (error.code === 'provider_unavailable') {
      const charged = error.body.released === true ? t('careerDocuments.paid.noCreditUsed') : t('careerDocuments.paid.versionUnchanged');
      if (UNUSABLE_REASONS.has(reason))
        return {
          title: t('careerDocuments.paid.unusableTitle'),
          body: t('careerDocuments.paid.unusableBody'),
        };
      if (NOT_CONFIGURED_REASONS.has(reason) || reason === '')
        return { title: t('careerDocuments.paid.notAvailableTitle'), body: [t('careerDocuments.paid.needsProvider'), charged].join(' ') };
      return { title: t('careerDocuments.paid.failedTitle'), body: [t('careerDocuments.paid.providerNoAnswer'), charged].join(' ') };
    }
    if (error.code === 'validation_error' && reason === 'missing_target')
      return { title: t('careerDocuments.paid.targetNeededTitle'), body: t('careerDocuments.paid.targetNeeded') };
    if (error.code === 'validation_error' && ['need_experience_or_education', 'no_facts', 'no_confirmed_facts'].includes(reason))
      return { title: t('careerDocuments.paid.addFactsTitle'), body: t('careerDocuments.paid.addFactsBody') };
    if (error.code === 'not_found') return { title: t('careerDocuments.paid.listingNotFoundTitle'), body: t('careerDocuments.paid.listingNotFoundBody') };
    if (error.code === 'quota_exhausted') {
      const day = credit?.renewalDate ? credit.renewalDate.slice(0, 10) : null;
      return {
        title: t('careerDocuments.paid.quotaTitle'),
        body: [t('careerDocuments.paid.stillHere'), day ? t('careerDocuments.paid.renewOn', { date: day }) : ''].filter(Boolean).join(' '),
      };
    }
    if (error.code === 'capacity_exceeded') {
      const limit = typeof error.body.limit === 'number' ? error.body.limit : null;
      return {
        title: t('careerDocuments.paid.noRoomTitle'),
        body: limit !== null ? t('careerDocuments.paid.capacity', { limit }) : t('careerDocuments.paid.noRoomMore'),
      };
    }
  }
  return { title: t('careerDocuments.paid.notCreatedTitle'), body: careerErrorMessage(error, t('careerDocuments.paid.notCreatedBody')) };
}

/** Failure copy for creating a CV (free; no credit involved). */
export function createResumeFailure(error: unknown): string {
  if (error instanceof ApiError && error.code === 'capacity_exceeded') {
    const limit = typeof error.body.limit === 'number' ? error.body.limit : null;
    return limit !== null ? t('careerDocuments.create.capacity', { limit }) : t('careerDocuments.create.noRoom');
  }
  if (error instanceof ApiError && error.code === 'validation_error') return t('careerDocuments.create.validation');
  return careerErrorMessage(error, t('careerDocuments.create.failed'));
}

/** "Version 3 · 12 Nov 2026 · Editorial · Confirmed" style label. */
export function versionMeta(version: ResumeVersion): string {
  const day = version.createdAt ? version.createdAt.slice(0, 10) : '';
  const parts = [day, resumeTemplateName(version.body.templateId), version.body.confirmation === 'confirmed' ? t('careerDocuments.status.confirmed') : t('careerDocuments.status.draft')];
  return parts.filter(Boolean).join(' · ');
}
