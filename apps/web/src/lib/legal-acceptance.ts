import { api } from './api';
import { LEGAL_VERSION_MAP } from '@/legal/versions';
import {
  needsAcceptance,
  type LegalAcceptance,
  type LegalAcceptanceVersions,
} from '@flacroncv/shared-types';

/**
 * Session flag: Auth succeeded but the acceptance write has not. Retry in this
 * tab; never delete the account; never treat the crash as a grandfathered
 * missing record while this flag is set.
 */
export const PENDING_LEGAL_ACCEPTANCE_KEY = 'flacroncv_pending_legal_acceptance';

export function currentLegalVersions(): LegalAcceptanceVersions {
  return {
    termsVersion: LEGAL_VERSION_MAP.terms.version,
    privacyVersion: LEGAL_VERSION_MAP.privacy.version,
    disclaimerVersion: LEGAL_VERSION_MAP.disclaimer.version,
  };
}

/**
 * Re-consent comparison. Missing record → no prompt (`treatMissingAsStale`
 * defaults off and is not flipped in this batch).
 */
export function shouldPromptForAcceptance(
  record: Pick<LegalAcceptance, 'termsVersion' | 'privacyVersion' | 'disclaimerVersion'> | null,
  treatMissingAsStale = false,
): boolean {
  return needsAcceptance(record, currentLegalVersions(), treatMissingAsStale);
}

function pendingStore(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function hasPendingAcceptance(): boolean {
  return pendingStore()?.getItem(PENDING_LEGAL_ACCEPTANCE_KEY) === '1';
}

export function markAcceptancePending(): void {
  pendingStore()?.setItem(PENDING_LEGAL_ACCEPTANCE_KEY, '1');
}

export function clearAcceptancePending(): void {
  pendingStore()?.removeItem(PENDING_LEGAL_ACCEPTANCE_KEY);
}

export async function submitLegalAcceptance(): Promise<void> {
  const versions = currentLegalVersions();
  await api.post('/legal/acceptances', {
    termsAccepted: true,
    privacyAccepted: true,
    disclaimerAccepted: true,
    ...versions,
  });
}

/**
 * Call only after Firebase Auth has actually created/signed in the user.
 * Sets the pending flag first so a mid-request crash still retries.
 * Swallows write errors — the account stays.
 */
export async function recordAcceptanceAfterSignup(): Promise<void> {
  markAcceptancePending();
  try {
    await submitLegalAcceptance();
    clearAcceptancePending();
  } catch {
    // Keep the flag for retryPendingLegalAcceptance. Do not sign out.
  }
}

/** No-op when the session flag is absent (grandfathered users). */
export async function retryPendingLegalAcceptance(): Promise<void> {
  if (!hasPendingAcceptance()) return;
  try {
    await submitLegalAcceptance();
    clearAcceptancePending();
  } catch {
    // Stay pending. Never delete the account.
  }
}
