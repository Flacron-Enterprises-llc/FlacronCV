import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { ActionPack, OpportunityItem } from '../../../../../packages/career-api-client/src/types';
import { ACTION_PACK_LETTER_ATTEMPTS } from '../../../../../packages/career-shared/src/action-pack';
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
