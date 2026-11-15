import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { careerApi } from '../lib/career-api';
import type { V1Usage } from '../lib/billing';
import { useAuthStore } from '../store/auth-store';

interface PortalSession {
  url: string;
}

/**
 * Stripe customer portal for LEGACY Stripe subscribers only (see
 * LEGACY_STRIPE_PORTAL_ENABLED). The app no longer starts a Stripe checkout:
 * plans are bought through the App Store / Google Play (StorePaywall).
 */
export function useCreatePortalSession() {
  return useMutation({
    mutationFn: () => api.post<PortalSession>('/payments/create-portal-session'),
  });
}

export interface MobileVerifyResult {
  /** Plan id the server granted from the store product (five-plan or legacy). */
  plan: string;
  status: string;
  provider: 'apple' | 'google';
  currentPeriodEnd: string;
}

export type VerifyMobilePurchaseBody = {
  provider: 'apple' | 'google';
  signedTransactionInfo?: string;
  transactionId?: string;
  purchaseToken?: string;
};

/** POST /billing/mobile/verify — store receipt only. Does not touch Stripe. */
export function verifyMobilePurchase(body: VerifyMobilePurchaseBody) {
  return api.post<MobileVerifyResult>('/billing/mobile/verify', body);
}

/**
 * GET /users/me/usage: the V1 counters as the server enforces them, including
 * the stored CV / letter counts current plans cap and the résumé-analyses
 * counter. Live, so the billing screen and home never show the sign-in snapshot.
 */
export function useV1Usage() {
  const { firebaseUser, isInitialized } = useAuthStore();
  return useQuery({
    queryKey: ['usage', firebaseUser?.uid],
    queryFn: () => api.get<V1Usage>('/users/me/usage'),
    enabled: isInitialized && !!firebaseUser?.uid,
    staleTime: 30_000,
  });
}

/** Hides the career ledger's 80/95/100 % notices once the billing screen has shown them. */
export function useMarkUsageWarningsSeen() {
  return useMutation({
    mutationFn: (ids: string[]) => careerApi.markUsageWarningsSeen(ids),
  });
}
