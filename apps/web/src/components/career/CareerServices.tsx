'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createApiClient, type ApiClient, type CareerAccessView } from '@flacroncv/career-api-client';
import { useAuth } from '@/providers/AuthProvider';
import type { SignedInUser } from '@/lib/career/auth-gateway';

/**
 * Build-time switch for the whole career integration. Off (the default), the
 * V1 app behaves exactly as before: no career navigation, no calls to the
 * career service, account deletion unchanged.
 */
export function isCareerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CAREER_ENABLED?.trim() === 'true';
}

/**
 * Origin of the career service (former V2 API). Separate from V1's
 * `NEXT_PUBLIC_API_URL`; its routes live under `/api/career/v1`.
 */
export function careerApiOrigin(): string {
  return process.env.NEXT_PUBLIC_CAREER_API_URL?.trim() || 'http://localhost:4101';
}

/**
 * The V1 session as the career screens expect it. The same Firebase user V1
 * signed in, so there is one identity; the token is fetched per request.
 */
export function useCareerUser(): { ready: boolean; user: SignedInUser | null } {
  const { firebaseUser, loading } = useAuth();
  return useMemo(
    () => ({
      ready: !loading,
      user: firebaseUser
        ? {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            emailVerified: firebaseUser.emailVerified,
            getIdToken: () => firebaseUser.getIdToken(),
          }
        : null,
    }),
    [firebaseUser, loading],
  );
}

export function useCareerApi(): ApiClient {
  const { firebaseUser } = useAuth();
  return useMemo(
    () =>
      createApiClient({
        baseUrl: careerApiOrigin(),
        getToken: async () => (firebaseUser ? firebaseUser.getIdToken() : null),
      }),
    [firebaseUser],
  );
}

export const CAREER_ACCESS_QUERY_KEY = ['career-access'] as const;

/**
 * Whether the signed-in person may use the career area. Decided server-side
 * from their V1 plan; this only drives navigation and the gate message.
 * An unreachable career service counts as "not available", never as access.
 */
export function useCareerAccess() {
  const api = useCareerApi();
  const { firebaseUser } = useAuth();
  return useQuery<CareerAccessView>({
    queryKey: [...CAREER_ACCESS_QUERY_KEY, firebaseUser?.uid ?? 'signed-out'],
    queryFn: () => api.access(),
    enabled: Boolean(firebaseUser) && isCareerEnabled(),
    staleTime: 30_000,
    retry: false,
  });
}
