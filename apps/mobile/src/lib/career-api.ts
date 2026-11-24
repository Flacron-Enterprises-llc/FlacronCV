import { createApiClient, type ApiClient } from '../../../../packages/career-api-client/src/client';
import { CAREER_API_URL } from '../config/career';
import { AI_CONSENT_DECLINED, ensureAiConsent, isCareerAiRequest } from './ai-consent';
import { getFirebaseAuth } from './firebase';
import { secureStore } from './secure-store';

/**
 * Client for the career API, shared with the web app (packages/career-api-client).
 * Same identity as the V1 API: the signed-in Firebase user's ID token, fetched
 * per request (Firebase refreshes it), falling back to the token the app
 * already keeps in SecureStore. Nothing new is persisted here.
 */
export const careerApi: ApiClient = createApiClient({
  baseUrl: CAREER_API_URL,
  getToken: async () => {
    const current = getFirebaseAuth().currentUser;
    if (current) return current.getIdToken();
    return secureStore.getAuthToken();
  },
  fetch: async (url, init) => {
    // Refused locally, as an API answer the screens already know how to show: nothing is sent.
    if (isCareerAiRequest(init.method, url) && !(await ensureAiConsent())) {
      return new Response(JSON.stringify({ code: AI_CONSENT_DECLINED }), { status: 403 });
    }
    return fetch(url, init);
  },
});

/** A fresh token for the career service's recent-sign-in check before erasure. */
export async function freshIdToken(): Promise<string> {
  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error('signed out');
  return current.getIdToken(true);
}
