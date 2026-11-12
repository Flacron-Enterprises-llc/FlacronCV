import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { ActionPack, OpportunityItem } from '../../../../../packages/career-api-client/src/types';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for the mobile action-pack screens (tested in action-packs.test.ts).
 * Same behaviour as the website's ActionPackScreen: one pack per saved
 * opportunity, one action-pack credit per pack, checklist toggles are free.
 * Credits are career units, never a price.
 */

/** Shown whenever a career call answers `provider_unavailable`. */
export const PROVIDER_UNAVAILABLE_MESSAGE =
  'Needs the AI provider, which is not configured in this environment. Nothing was charged.';

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

const FIT_LABEL: Record<string, string> = {
  strong: 'STRONG FIT',
  partial: 'PARTIAL FIT',
  possible: 'POSSIBLE FIT',
  none: 'LOW OVERLAP',
  blocked: 'BLOCKED',
};

const FIT_TONE: Record<string, PillTone> = {
  strong: 'success',
  partial: 'brand',
  possible: 'brand',
  none: 'default',
  blocked: 'warning',
};

export function fitLabel(fit: string): string {
  return FIT_LABEL[fit] ?? fit.toUpperCase();
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
  return organization && organization.trim().length > 0 ? organization : 'Unstated organization';
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
        return 'Action packs are not included in your current career plan. No credit was used.';
      case 'quota_exhausted':
        return 'No action pack credits left. Credits renew on your next billing date.';
      case 'feature_unavailable':
        return 'Action packs are not open yet. No credit was used.';
      case 'provider_unavailable':
        return PROVIDER_UNAVAILABLE_MESSAGE;
      case 'validation_error':
        return error.body.reason === 'no_confirmed_facts'
          ? 'Confirm at least one fact in your career profile first. No credit was used.'
          : 'Choose a valid opportunity. No credit was used.';
      case 'not_found':
        return 'That opportunity is no longer available. No credit was used.';
      default:
        break;
    }
  }
  return careerErrorMessage(error, 'The action pack was not created. No credit was used.');
}

export function checklistErrorMessage(error: unknown): string {
  return careerErrorMessage(error, 'The checklist item was not updated. Please try again.');
}
