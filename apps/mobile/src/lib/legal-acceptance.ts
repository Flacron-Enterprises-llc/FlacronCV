import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { api } from './api';
import { getFirebaseAuth } from './firebase';
import { currentLegalVersions, legalDocUrl, type LegalDocKind } from './legal-docs';
import { secureStore } from './secure-store';

export async function openLegalDocument(kind: LegalDocKind): Promise<void> {
  const url = legalDocUrl(kind);
  if (!url) {
    Alert.alert(
      'Documents unavailable',
      'Legal documents are not configured in this build. Cannot open Terms, Privacy, or Disclaimer.',
    );
    return;
  }
  await WebBrowser.openBrowserAsync(url);
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
 * True when this uid already has a row. Missing is `{ acceptance: null }`, not
 * 404 — same as grandfathered. Callers must not treat false as "prompt them".
 * Throws on network/auth failure so the caller can fail closed (stay gated).
 */
export async function fetchLegalAcceptanceRecord(): Promise<{
  acceptance: unknown | null;
}> {
  return api.get<{ acceptance: unknown | null }>('/legal/acceptances/me');
}

/**
 * After Firebase Auth has created/signed in the user. Pending flag first so a
 * mid-request crash still retries. Never deletes the Auth account.
 * Returns whether the write succeeded.
 */
export async function recordAcceptanceAfterSignup(): Promise<boolean> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (uid) await secureStore.setPendingLegalPost(uid);
  await secureStore.clearPendingLegalConsent();
  try {
    await submitLegalAcceptance();
    await secureStore.clearPendingLegalPost();
    return true;
  } catch {
    return false;
  }
}

/** No-op when the stored uid does not match the signed-in user (grandfathered). */
export async function retryPendingLegalAcceptance(): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  const pending = await secureStore.getPendingLegalPost();
  if (pending !== uid) return;
  try {
    await submitLegalAcceptance();
    await secureStore.clearPendingLegalPost();
  } catch {
    // Stay pending. Never delete the account.
  }
}

export const LEGAL_POST_FAILED_TITLE = 'Account created';
export const LEGAL_POST_FAILED_MESSAGE =
  'Your account was created, but we could not save your agreement to Terms, Privacy, and the Disclaimer. We will retry automatically. You can keep using the app.';
