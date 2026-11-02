import { createApiClient, type ApiClient } from '../../../../packages/career-api-client/src/client';
import { CAREER_API_URL } from '../config/career';
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
  fetch: (url, init) => fetch(url, init),
});

/** A fresh token for the career service's recent-sign-in check before erasure. */
export async function freshIdToken(): Promise<string> {
  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error('signed out');
  return current.getIdToken(true);
}
