import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { ActionPack, ActionPackChecklistItem, ActionPackEdit, OpportunityItem } from '../../../../../packages/career-api-client/src/types';
import {
  ACTION_PACK_CHECKLIST_IDS,
  ACTION_PACK_EDIT_LIMITS,
  ACTION_PACK_LETTER_ATTEMPTS,
  actionPackNextStepCodes,
  type ActionPackNextStepCode,
} from '../../../../../packages/career-shared/src/action-pack';
import { isFactType } from '../../../../../packages/career-shared/src/facts';
import { statedOrganization } from '../../../../../packages/career-shared/src/opportunities';
import { factLineText } from '../../../../../packages/career-shared/src/resume';
import { hasKey, t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for the mobile action-pack screens (tested in action-packs.test.ts).
 * Same behaviour as the website's ActionPackScreen: one pack per saved
 * opportunity, one action-pack credit per pack, checklist toggles are free.
 * Credits are career units, never a price.
 */

/** Shown whenever a career call answers `provider_unavailable` (the English text; tests compare to it). */
export const PROVIDER_UNAVAILABLE_MESSAGE =
  'Needs the AI provider, which is not configured in this environment. Nothing was charged.';

/** PROVIDER_UNAVAILABLE_MESSAGE in the current language. */
export function providerUnavailableMessage(): string {
  return t('careerPlans.providerUnavailable');
}

/**
 * One idempotency key per user action. A retry of the SAME action (same
 * signature) reuses the key so the server never debits twice; a changed
 * input starts a new action with a new key.
 */
export interface KeyedAction {
  signature: string;
  key: string;
}

export function keyForAction(current: KeyedAction | null, signature: string, makeKey: () => string): KeyedAction {
  return current && current.signature === signature ? current : { signature, key: makeKey() };
}

export type PillTone = 'default' | 'brand' | 'warning' | 'success';

const FIT_TONE: Record<string, PillTone> = {
  strong: 'success',
  partial: 'brand',
  possible: 'brand',
  none: 'default',
  blocked: 'warning',
};

export function fitLabel(fit: string): string {
  const key = `careerPlans.actionPack.fit.${fit}`;
  return hasKey(key) ? t(key) : fit.toUpperCase();
}

export function fitTone(fit: string): PillTone {
  return FIT_TONE[fit] ?? 'default';
}

/** Remaining credits of a balance (included + packs), or null when unknown. */
export function creditsLeft(balance: { includedRemaining: number; packRemaining: number } | null | undefined): number | null {
  if (!balance) return null;
  return balance.includedRemaining + balance.packRemaining;
}

export function organizationName(organization: string | null | undefined): string {
  return organization && organization.trim().length > 0 ? organization : t('careerPlans.actionPack.unstatedOrganization');
}

export function opportunityLabel(opp: Pick<OpportunityItem, 'title' | 'organization'>): string {
  return `${opp.title} — ${organizationName(opp.organization)}`;
}

export function checklistProgress(pack: Pick<ActionPack, 'checklist'>): { done: number; total: number } {
  return { done: pack.checklist.filter((item) => item.done).length, total: pack.checklist.length };
}

/** The pack with one checklist item set, for an optimistic update before the server answers. */
export function withChecklistItem(pack: ActionPack, checklistId: string, done: boolean): ActionPack {
  return { ...pack, checklist: pack.checklist.map((item) => (item.id === checklistId ? { ...item, done } : item)) };
}

/** Replaces one pack in a list (by id), keeping order. */
export function replacePack<T extends { id: string }>(items: T[], updated: T): T[] {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

/** Newest first, the same order the website shows after creating one. */
export function sortPacks(items: ActionPack[]): ActionPack[] {
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** Message for a failed "create action pack". Every refusal states that no credit was used. */
export function actionPackErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'plan_upgrade_required':
        return t('careerPlans.actionPack.errors.planUpgrade');
      case 'quota_exhausted':
        return t('careerPlans.actionPack.errors.quota');
      case 'feature_unavailable':
        return t('careerPlans.actionPack.errors.featureOff');
      case 'provider_unavailable':
        return providerUnavailableMessage();
      case 'validation_error':
        return error.body.reason === 'no_confirmed_facts'
          ? t('careerPlans.actionPack.errors.noFacts')
          : t('careerPlans.actionPack.errors.invalidOpportunity');
      case 'not_found':
        return t('careerPlans.actionPack.errors.notFound');
      default:
        break;
    }
  }
  return careerErrorMessage(error, t('careerPlans.actionPack.errors.createFailed'));
}

export function checklistErrorMessage(error: unknown): string {
  return careerErrorMessage(error, t('careerPlans.actionPack.errors.checklistFailed'));
}

// ---------------------------------------------------------------------------
// Unfinished packs. A pack holds one credit while it is generating or partial
// (only the cover letter can fail); retrying the letter is free, cancelling
// returns the credit, and a pack whose hold ran out is "expired" (credit
// already returned, it can only be deleted). Packs made before resumable packs
// existed have no status and are complete.

export type PackStatus = NonNullable<ActionPack['status']>;

export function packStatus(pack: Pick<ActionPack, 'status'>): PackStatus {
  return pack.status ?? 'complete';
}

export function letterAttemptsLeft(pack: Pick<ActionPack, 'letterAttempts'>): number {
  return Math.max(0, ACTION_PACK_LETTER_ATTEMPTS - (pack.letterAttempts ?? 0));
}

/** The list badge for a pack that is not complete, or null. */
export function statusBadge(pack: Pick<ActionPack, 'status'>): { label: string; tone: PillTone } | null {
  const status = packStatus(pack);
  if (status === 'complete') return null;
  return { label: t(`careerPlans.actionPack.status.${status}`), tone: status === 'expired' ? 'default' : 'warning' };
}

/** A retry that failed for good: the server removed the pack and returned the credit. */
export function isFinalRetryFailure(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'provider_unavailable' && error.body.released === true;
}

export function retryErrorMessage(error: unknown): string {
  if (isFinalRetryFailure(error)) {
    return (error as ApiError).body.reason === 'pack_expired'
      ? t('careerPlans.actionPack.statusExpired')
      : t('careerPlans.actionPack.finalFailure');
  }
  if (error instanceof ApiError && error.code === 'request_in_progress') return t('careerPlans.actionPack.statusGenerating');
  if (error instanceof ApiError && error.code === 'validation_error' && error.body.reason === 'attempts_used') {
    return t('careerPlans.actionPack.noRetriesLeft');
  }
  return careerErrorMessage(error, t('careerPlans.actionPack.retryFailed'));
}

export function cancelErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'request_in_progress') return t('careerPlans.actionPack.statusGenerating');
  return careerErrorMessage(error, t('careerPlans.actionPack.cancelFailed'));
}

// ---------------------------------------------------------------------------
// Reading, editing and using a pack (website ActionPackScreen / ActionPackEditors).
// Editing, saving to Documents and downloading are free; the pack credit
// already covers its documents.

export type PackComponent = NonNullable<ActionPack['editedComponents']>[number];
export type ExportComponent = 'tailoredResume' | 'coverLetter';
export type ExportFormat = 'pdf' | 'docx';

/** Packs saved before the server fix can hold the "unstated" storage marker; it is never shown. */
export function normalizePack(pack: ActionPack): ActionPack {
  return { ...pack, vacancySnapshot: { ...pack.vacancySnapshot, organization: statedOrganization(pack.vacancySnapshot.organization) } };
}

/** A complete or partial pack can be edited; one still generating or expired cannot. */
export function isEditable(pack: Pick<ActionPack, 'status'>): boolean {
  const status = packStatus(pack);
  return status === 'complete' || status === 'partial';
}

export function isEdited(pack: Pick<ActionPack, 'editedComponents'>, component: PackComponent): boolean {
  return (pack.editedComponents ?? []).includes(component);
}

/** "Why you qualify" and the gaps: from the matched words when the pack has them, else the stored sentences. */
export function fitLines(pack: Pick<ActionPack, 'fit' | 'editedComponents'>): { reasons: string[]; gaps: string[] } {
  if (isEdited(pack, 'fit')) return { reasons: pack.fit.reasons, gaps: pack.fit.gaps };
  const reasonTokens = pack.fit.reasonTokens;
  const gapTokens = pack.fit.gapTokens;
  return {
    reasons: Array.isArray(reasonTokens) ? reasonTokens.map((token) => t('careerPlans.pack.reason_token', { token })) : pack.fit.reasons,
    gaps: Array.isArray(gapTokens) ? gapTokens.map((token) => t('careerPlans.pack.gap_token', { token })) : pack.fit.gaps,
  };
}

function checklistText(id: string, at: boolean, params: Record<string, string>): string {
  switch (id) {
    case 'review_resume':
      return at ? t('careerPlans.pack.checklist_review_resume_at', params) : t('careerPlans.pack.checklist_review_resume', params);
    case 'review_cover_letter':
      return at ? t('careerPlans.pack.checklist_review_cover_letter_at', params) : t('careerPlans.pack.checklist_review_cover_letter', params);
    case 'check_deadline':
      return t('careerPlans.pack.checklist_check_deadline');
    case 'attach_evidence':
      return t('careerPlans.pack.checklist_attach_evidence');
    default:
      return t('careerPlans.pack.checklist_prepare_interview');
  }
}

/** A built-in checklist item in the current language; the person's own items as written. */
export function checklistLabel(pack: Pick<ActionPack, 'vacancySnapshot'>, item: Pick<ActionPackChecklistItem, 'id' | 'label'>): string {
  if (!(ACTION_PACK_CHECKLIST_IDS as readonly string[]).includes(item.id)) return item.label;
  const organization = statedOrganization(pack.vacancySnapshot.organization);
  return checklistText(item.id, organization !== null, { title: pack.vacancySnapshot.title, organization: organization ?? '' });
}

function nextStepText(code: ActionPackNextStepCode, count: number): string {
  switch (code) {
    case 'resolve_blockers':
      return t('careerPlans.pack.next_resolve_blockers');
    case 'apply_promptly':
      return t('careerPlans.pack.next_apply_promptly');
    case 'reach_out':
      return t('careerPlans.pack.next_reach_out');
    case 'address_gaps':
      return t('careerPlans.pack.next_address_gaps');
    case 'highlight_transferable':
      return t('careerPlans.pack.next_highlight_transferable');
    case 'add_gap_evidence':
      return t('careerPlans.pack.next_add_gap_evidence', { count });
    case 'track_application':
      return t('careerPlans.pack.next_track_application');
  }
}

/** Next steps derived from the fit (so older packs translate too); the person's own steps as written. */
export function nextStepTexts(pack: Pick<ActionPack, 'fit' | 'nextSteps' | 'editedComponents'>): string[] {
  if (isEdited(pack, 'nextSteps')) return pack.nextSteps;
  const gapCount = pack.fit.gapTokens?.length || pack.fit.gaps.length || 0;
  return actionPackNextStepCodes(pack.fit.fit, gapCount).map((code) => nextStepText(code, gapCount));
}

/** One item per line, blank lines dropped. */
export function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface ResumeRow {
  factId: string;
  factType: string;
  text: string;
}

export function moveRow<T>(rows: T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return rows;
  const next = rows.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Confirmed facts frozen in the pack that are not on the résumé, with the
 * line they would add. There is no free "add a line": every line stands for
 * a confirmed fact (the server checks this too).
 */
export function factsToAddBack(pack: Pick<ActionPack, 'profileSnapshot'>, rows: Pick<ResumeRow, 'factId'>[]): ResumeRow[] {
  const used = new Set(rows.map((row) => row.factId));
  const out: ResumeRow[] = [];
  for (const fact of pack.profileSnapshot) {
    if (used.has(fact.id) || !isFactType(fact.factType)) continue;
    const text = factLineText(fact.factType, fact.value);
    if (text) out.push({ factId: fact.id, factType: fact.factType, text });
  }
  return out;
}

export function resumeRows(pack: Pick<ActionPack, 'tailoredResume'>): ResumeRow[] {
  return pack.tailoredResume.lines.map((line) => ({ factId: line.factId, factType: line.factType, text: line.text }));
}

export function resumeEdit(title: string, rows: ResumeRow[]): ActionPackEdit {
  return { tailoredResume: { title: title.trim(), lines: rows.map(({ factId, text }) => ({ factId, text: text.trim() })) } };
}

export function letterEdit(title: string, body: string): ActionPackEdit {
  return { coverLetter: { title: title.trim(), body: body.trim() } };
}

export function fitEdit(reasons: string, gaps: string): ActionPackEdit {
  return { fit: { reasons: splitLines(reasons), gaps: splitLines(gaps) } };
}

export function nextStepsEdit(text: string): ActionPackEdit {
  return { nextSteps: splitLines(text) };
}

export interface ChecklistRow {
  id?: string;
  original: string;
  label: string;
  done: boolean;
}

export function checklistRows(pack: Pick<ActionPack, 'checklist' | 'vacancySnapshot'>): ChecklistRow[] {
  return pack.checklist.map((item) => {
    const label = checklistLabel(pack, item);
    return { id: item.id, original: label, label, done: item.done };
  });
}

/**
 * The checklist edit: a built-in item whose words did not change is sent by
 * id only (so it stays translated); a reworded or new item is sent with its
 * label and becomes the person's own; a blank row is dropped.
 */
export function checklistEdit(rows: ChecklistRow[]): ActionPackEdit {
  return {
    checklist: rows
      .filter((row) => row.label.trim().length > 0)
      .map((row) => (row.id && row.label === row.original ? { id: row.id, done: row.done } : { id: row.id, label: row.label.trim(), done: row.done })),
  };
}

export function canAddChecklistRow(rows: readonly unknown[]): boolean {
  return rows.length < ACTION_PACK_EDIT_LIMITS.listItems;
}

export const PACK_LIMITS = ACTION_PACK_EDIT_LIMITS;

/** True when the résumé or letter was already copied to Documents. */
export function savedToDocuments(pack: Pick<ActionPack, 'savedDocuments'>): boolean {
  return Boolean(pack.savedDocuments?.resumeVersionId || pack.savedDocuments?.letterDocumentId);
}

/** The ?opportunityId= a screen was opened with, when it names one of the saved opportunities. */
export function preselectedOpportunity(param: string | string[] | undefined, items: readonly Pick<OpportunityItem, 'id'>[]): string | null {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value) return null;
  return items.some((item) => item.id === value) ? value : null;
}

export function editErrorMessage(error: unknown): string {
  return careerErrorMessage(error, t('careerPlans.pack.edit_failed'));
}

export function saveDocumentsErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'capacity_exceeded') return t('careerPlans.pack.save_capacity_exceeded');
  if (error instanceof ApiError && error.code === 'plan_upgrade_required') return t('careerPlans.pack.save_plan_upgrade');
  return careerErrorMessage(error, t('careerPlans.pack.save_failed'));
}

export function downloadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'plan_upgrade_required') return t('careerPlans.pack.docx_upgrade');
  return careerErrorMessage(error, t('careerPlans.pack.download_failed'));
}

/** Title for a downloaded file: the component's own title, else a generic one. */
export function exportTitle(pack: Pick<ActionPack, 'tailoredResume' | 'coverLetter'>, component: ExportComponent): string {
  const title = component === 'tailoredResume' ? pack.tailoredResume.title : (pack.coverLetter?.title ?? '');
  return title.trim() || (component === 'tailoredResume' ? t('careerPlans.pack.resume_title_label') : t('careerPlans.pack.letter_title_label'));
}

/** The "Credits required / Your balance" lines shown before a paid run. */
export function balanceText(remaining: number | null): string {
  return remaining === null ? t('careerPlans.pack.cost_balance_unknown') : t('careerPlans.pack.cost_balance', { count: remaining });
}
