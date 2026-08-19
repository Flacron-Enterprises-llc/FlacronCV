import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { BillingInterval, SubscriptionPlan } from '../types/enums';

interface CheckoutSession {
  sessionId: string;
  url: string;
}

interface PortalSession {
  url: string;
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: ({
      plan,
      interval,
    }: {
      plan: SubscriptionPlan;
      interval: BillingInterval;
    }) => api.post<CheckoutSession>('/payments/create-checkout-session', { plan, interval }),
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: () => api.post<PortalSession>('/payments/create-portal-session'),
  });
}

// Removed useSubscriptionStatus — it called GET /users/:uid/subscription, which
// does not exist. Subscription lives on GET /users/me (useCurrentUser).
