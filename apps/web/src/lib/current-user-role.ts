import { auth } from '@/lib/firebase';

/**
 * The signed-in user's role, read from the Firebase ID-token claim.
 *
 * WHY NOT `user.role`: the synced profile is not available yet at the moment we
 * redirect after sign-in, and when it is missing `AuthProvider` substitutes a
 * placeholder that reports `role: 'user'` for everybody. Routing on that would
 * send a real admin to the dashboard whenever the profile sync was slow or had
 * failed. The claim is on the token the moment Firebase issues it, and it is the
 * same value the API's `FirebaseAuthGuard` authorizes against.
 *
 * Returns null when nobody is signed in or the token cannot be read — callers
 * treat that as "no special landing page", never as a grant.
 */
export async function currentUserRole(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  try {
    const { claims } = await user.getIdTokenResult();
    return typeof claims.role === 'string' ? claims.role : null;
  } catch {
    // An unreadable token is not an authorization problem here — the route
    // guards still run. Fall back to the default landing page.
    return null;
  }
}
