import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { DocumentCredit, ResumeVersion, WritingType } from '../../../../../packages/career-api-client/src/types';
import { COVER_LETTER_TEMPLATES, isCoverLetterTemplateId, type CoverLetterTemplateId } from '../../../../../packages/career-shared/src/writing';
import { isResumeTemplateId, RESUME_TEMPLATES, type ResumeTemplateId } from '../../../../../packages/career-shared/src/resume';
import { careerErrorMessage, FACT_TYPE_LABEL } from '../career-view';

/**
 * Pure logic for the mobile career drafts (career CVs and letters): template
 * names, readability wording, paid-action keys and failure copy. Mirrors the
 * website's resume studio (apps/web/src/components/career/resume/ResumeScreen.tsx).
 * No React Native or Expo imports, so it runs under vitest.
 */

/** Same names as the website's `career.resume.templates.*`. */
export const RESUME_TEMPLATE_NAMES: Record<ResumeTemplateId, string> = {
  classic: 'Classic',
  modern: 'Modern',
  minimal: 'Minimal',
  compact: 'Compact',
  academic: 'Academic',
  professional: 'Professional',
  creative: 'Creative',
  executive: 'Executive',
  'two-column': 'Two-column',
  bold: 'Bold',
  sidebar: 'Sidebar',
  topbar: 'Top bar',
  'slate-gold': 'Slate',
  editorial: 'Editorial',
  structured: 'Structured',
};

/** Same names as the website's `career.home.letter_template_*`. */
export const LETTER_TEMPLATE_NAMES: Record<CoverLetterTemplateId, string> = {
  classic: 'Classic letter',
  modern: 'Modern letter',
  minimalist: 'Minimalist letter',
  creative: 'Creative letter',
  corporate: 'Corporate letter',
  executive: 'Executive letter',
  editorial: 'Editorial letter',
  structured: 'Structured letter',
};

export type TemplateOption = { id: string; name: string; accent: string };

export const RESUME_TEMPLATE_OPTIONS: TemplateOption[] = RESUME_TEMPLATES.map((t) => ({ id: t.id, name: RESUME_TEMPLATE_NAMES[t.id], accent: t.accent }));
export const LETTER_TEMPLATE_OPTIONS: TemplateOption[] = COVER_LETTER_TEMPLATES.map((t) => ({ id: t.id, name: LETTER_TEMPLATE_NAMES[t.id], accent: t.accent }));

export function resumeTemplateName(id: string | null | undefined): string {
  if (!id) return '';
  return isResumeTemplateId(id) ? RESUME_TEMPLATE_NAMES[id] : id;
}

export function letterTemplateName(id: string | null | undefined): string {
  if (!id) return '';
  return isCoverLetterTemplateId(id) ? LETTER_TEMPLATE_NAMES[id] : id;
}

export { isCoverLetterTemplateId, isResumeTemplateId };

export const WRITING_TYPE_OPTIONS: Array<{ id: WritingType; label: string }> = [
  { id: 'cover_letter', label: 'Cover letter' },
  { id: 'bio', label: 'Bio' },
  { id: 'linkedin', label: 'LinkedIn text' },
  { id: 'outreach', label: 'Outreach draft' },
];

/** Default title for a new career CV (the website uses "Resume"). */
export const DEFAULT_RESUME_TITLE = 'Resume';

/** The career API accepts a 1–200 character title. Returns an error message, or null when valid. */
export function resumeTitleError(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) return 'Give the CV a name.';
  if (trimmed.length > 200) return 'Keep the name under 200 characters.';
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
  return `${count} document ${count === 1 ? 'credit' : 'credits'} remaining.`;
}

export type ReadabilityIssue = { code: string; section?: string; factId?: string };

/** Same wording as the website's readability check. */
export function readabilityIssueText(issue: ReadabilityIssue): string {
  if (issue.code === 'empty') return 'This version has no lines.';
  if (issue.code === 'unconfirmed_version') return 'This version is not confirmed yet.';
  if (issue.code === 'missing_section') {
    const section = issue.section ? (FACT_TYPE_LABEL[issue.section] ?? issue.section) : 'A section';
    return `${section} is missing.`;
  }
  return 'A line is still marked uncertain.';
}

/** Readability issues, one line each, uncertain lines collapsed into a count. */
export function readabilityLines(issues: ReadabilityIssue[]): string[] {
  const out: string[] = [];
  let uncertain = 0;
  for (const issue of issues) {
    if (issue.code === 'uncertain_line') uncertain += 1;
    else out.push(readabilityIssueText(issue));
  }
  if (uncertain === 1) out.push('A line is still marked uncertain.');
  if (uncertain > 1) out.push(`${uncertain} lines are still marked uncertain.`);
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
      const charged = error.body.released === true ? 'No document credit was used.' : 'Your current version is unchanged.';
      if (UNUSABLE_REASONS.has(reason))
        return {
          title: 'The draft was not usable',
          body: 'The draft described a role, employer or date that is not in your confirmed facts. The credit was returned. Saved documents were not replaced.',
        };
      if (NOT_CONFIGURED_REASONS.has(reason) || reason === '')
        return { title: 'Not available yet', body: `Needs the AI provider, which is not configured in this environment. ${charged}` };
      return { title: 'The new version was not created', body: `The AI provider did not answer. ${charged}` };
    }
    if (error.code === 'validation_error' && ['need_experience_or_education', 'no_facts', 'no_confirmed_facts'].includes(reason))
      return { title: 'Add facts first', body: 'Add a confirmed job or school on your career profile first. No credit was used.' };
    if (error.code === 'not_found') return { title: 'Listing not found', body: 'That listing is not in FlacronCV any more. No credit was used.' };
    if (error.code === 'quota_exhausted') {
      const day = credit?.renewalDate ? credit.renewalDate.slice(0, 10) : null;
      return { title: 'No document credits left', body: `The current version is still here.${day ? ` Credits renew on ${day}.` : ''}` };
    }
    if (error.code === 'capacity_exceeded') {
      const limit = typeof error.body.limit === 'number' ? error.body.limit : null;
      return { title: 'No room for another version', body: limit !== null ? `This plan has room for ${limit} resume versions.` : 'Your career plan has no room for more.' };
    }
  }
  return { title: 'Not created', body: careerErrorMessage(error, 'Nothing was created and no credit was used. Please try again.') };
}

/** Failure copy for creating a CV (free; no credit involved). */
export function createResumeFailure(error: unknown): string {
  if (error instanceof ApiError && error.code === 'capacity_exceeded') {
    const limit = typeof error.body.limit === 'number' ? error.body.limit : null;
    return limit !== null ? `This plan has room for ${limit} career CVs.` : 'Your career plan has no room for another CV.';
  }
  if (error instanceof ApiError && error.code === 'validation_error') return 'Check the name, language and layout, then try again.';
  return careerErrorMessage(error, 'The CV was not created. Please try again.');
}

/** "Version 3 · 12 Nov 2026 · Editorial · Confirmed" style label. */
export function versionMeta(version: ResumeVersion): string {
  const day = version.createdAt ? version.createdAt.slice(0, 10) : '';
  const parts = [day, resumeTemplateName(version.body.templateId), version.body.confirmation === 'confirmed' ? 'Confirmed' : 'Draft'];
  return parts.filter(Boolean).join(' · ');
}
