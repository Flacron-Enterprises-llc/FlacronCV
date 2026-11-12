import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth-store';
import { BillingInvoice } from '../types/subscription.types';

/**
 * The signed-in account's recent invoices, read-only (`GET /payments/invoices`).
 * The API returns [] for accounts with no Stripe customer (free, or paying
 * through the App Store / Google Play), so this is safe for everyone.
 */
export function useInvoices() {
  const { firebaseUser, isInitialized } = useAuthStore();
  return useQuery({
    queryKey: ['invoices', firebaseUser?.uid],
    queryFn: () => api.get<BillingInvoice[]>('/payments/invoices'),
    enabled: isInitialized && !!firebaseUser?.uid,
    staleTime: 5 * 60 * 1000,
  });
}
