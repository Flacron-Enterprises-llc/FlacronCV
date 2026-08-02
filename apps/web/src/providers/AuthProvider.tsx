'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  linkWithCredential,
  OAuthCredential,
} from 'firebase/auth';
import { auth, googleProvider, isConfigured } from '@/lib/firebase';

const PENDING_CRED_KEY = 'flacroncv_pending_oauth_credential';
// sessionStorage payload: JSON { key: 'auth.account_exists_link', email }
// Pages translate the key at display time so the message is localized.
export const GOOGLE_ERROR_KEY = 'flacroncv_google_error';

import { api } from '@/lib/api';
import { User } from '@flacroncv/shared-types';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  emailVerified: boolean;
  /**
   * True when the signed-in user's account data could not be synced from the
   * API. The `user` object is then a minimal placeholder — consumers must not
   * present its plan/usage values as real (no stats, no upgrade prompts).
   */
  degraded: boolean;
  /**
   * True while `user` is the stand-in from `buildPlaceholderUser` — i.e. the
   * account has NEVER synced, so every field on it is a default rather than a
   * fact. Authorization guards MUST check this before acting on `user.role`:
   * the placeholder says `role: 'user'`, which would otherwise bounce a real
   * admin out of /admin and /crm on any transient API failure.
   */
  placeholderAccount: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  /** Re-reads the Firebase user and resolves to the FRESH verified state, so
   *  callers can tell "checked, still unverified" from "checked, now verified". */
  refreshEmailVerified: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Backoff for retrying the account sync. A failed sync must self-heal — without
 * this the user is stuck on placeholder data (shown as the "free" plan) until
 * they manually refresh, which is how a paying customer briefly appeared to be
 * on Free whenever the API blipped.
 */
const SYNC_RETRY_DELAYS_MS = [2000, 5000, 10000, 30000, 30000, 30000];

/**
 * Minimal stand-in so authenticated layouts can still render when the account
 * sync fails. Always paired with `degraded: true` — its plan/usage values are
 * NOT real and must never be presented as account data (a paying customer is
 * not on "free").
 */
function buildPlaceholderUser(fbUser: FirebaseUser): User {
  return {
    uid: fbUser.uid,
    email: fbUser.email || '',
    displayName: fbUser.displayName || '',
    photoURL: fbUser.photoURL,
    phoneNumber: fbUser.phoneNumber,
    profile: { firstName: '', lastName: '', headline: '', bio: '', location: '', website: '', linkedin: '', github: '' },
    preferences: { language: 'en' as any, theme: 'system' as any, emailNotifications: true, marketingEmails: false, defaultCVTemplate: '' },
    subscription: { plan: 'free' as any, status: 'active' as any, stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false },
    usage: { cvsCreated: 0, coverLettersCreated: 0, aiCreditsUsed: 0, aiCreditsLimit: 5, exportsThisMonth: 0, lastExportReset: new Date() },
    role: 'user' as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
    isActive: true,
    deletedAt: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [placeholderAccount, setPlaceholderAccount] = useState(false);

  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempt = useRef(0);
  // Whether a real account has ever synced for the CURRENT firebase user. Kept
  // in a ref (not derived from `user`) so the placeholder decision is made once,
  // deterministically, rather than inside a setState updater that may re-run.
  const hasRealAccount = useRef(false);
  // Lets the retry timer call the latest syncUser without a circular dependency.
  const syncRef = useRef<((fb: FirebaseUser) => Promise<void>) | null>(null);

  const clearRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  const syncUser = useCallback(
    async (fbUser: FirebaseUser): Promise<void> => {
      try {
        const userData = await api.post<User>('/auth/verify');
        setUser(userData);
        setDegraded(false);
        hasRealAccount.current = true;
        setPlaceholderAccount(false);
        retryAttempt.current = 0;
        clearRetry();
      } catch (error) {
        console.error('Failed to sync user with backend:', error);
        setDegraded(true);
        // Never overwrite real account data we already hold with the fake
        // "free" placeholder — a transient blip must not downgrade the plan
        // the user is looking at. The placeholder is only for a cold start.
        setUser((prev) => prev ?? buildPlaceholderUser(fbUser));
        if (!hasRealAccount.current) setPlaceholderAccount(true);

        clearRetry();
        const attempt = retryAttempt.current;
        if (attempt < SYNC_RETRY_DELAYS_MS.length) {
          retryAttempt.current = attempt + 1;
          retryTimer.current = setTimeout(() => {
            void syncRef.current?.(fbUser);
          }, SYNC_RETRY_DELAYS_MS[attempt]);
        }
      }
    },
    [clearRetry],
  );

  useEffect(() => {
    syncRef.current = syncUser;
  }, [syncUser]);

  useEffect(() => {
    if (!isConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      setEmailVerified(fbUser?.emailVerified ?? false);
      retryAttempt.current = 0;
      clearRetry();
      // A different (or absent) identity invalidates anything synced earlier.
      hasRealAccount.current = false;

      if (fbUser) {
        await syncUser(fbUser);
      } else {
        setUser(null);
        setDegraded(false);
        setPlaceholderAccount(false);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      clearRetry();
    };
  }, [syncUser, clearRetry]);

  // Recover immediately when the tab regains focus or the network returns,
  // rather than waiting out the backoff.
  useEffect(() => {
    if (!degraded || !firebaseUser) return;
    const retryNow = () => {
      retryAttempt.current = 0;
      void syncUser(firebaseUser);
    };
    window.addEventListener('focus', retryNow);
    window.addEventListener('online', retryNow);
    return () => {
      window.removeEventListener('focus', retryNow);
      window.removeEventListener('online', retryNow);
    };
  }, [degraded, firebaseUser, syncUser]);

  const login = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not configured');
    // Set loading=true immediately so the dashboard guard sees a loading state
    // and doesn't redirect back to /login before onAuthStateChanged fires.
    setLoading(true);
    let result;
    try {
      result = await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setLoading(false);
      // Firebase rejects bad credentials entirely in the browser, so the API
      // never sees the attempt unless we report it — without this the audit
      // trail could only ever show successful sign-ins. Fire-and-forget: a
      // reporting failure must not change what the user sees. Only the address
      // and the Firebase error code are sent, never the password.
      void api
        .post('/auth/failed-login', { email, reason: (error as { code?: string })?.code })
        .catch(() => {});
      throw error;
    }

    // If a Google credential was stored (account-exists-with-different-credential),
    // link it now so the user can sign in with both methods going forward.
    const pendingCredStr = sessionStorage.getItem(PENDING_CRED_KEY);
    if (pendingCredStr) {
      try {
        const { idToken, accessToken } = JSON.parse(pendingCredStr);
        const pendingCred: OAuthCredential = GoogleAuthProvider.credential(idToken, accessToken);
        await linkWithCredential(result.user, pendingCred);
      } catch (linkErr) {
        console.error('Failed to link OAuth account:', linkErr);
      } finally {
        sessionStorage.removeItem(PENDING_CRED_KEY);
      }
    }
    // onAuthStateChanged will call setLoading(false) after syncing user state.
  };

  const register = async (email: string, password: string, name: string) => {
    if (!auth) throw new Error('Firebase not configured');
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });
    // The first /auth/verify (fired by onAuthStateChanged) may have raced
    // ahead of updateProfile and stored a placeholder name. Re-sync now that
    // the Auth record carries the real name so the backend can heal it.
    try {
      const userData = await api.post<User>('/auth/verify');
      setUser(userData);
      setDegraded(false);
      hasRealAccount.current = true;
      setPlaceholderAccount(false);
    } catch {
      // Non-fatal: the next sync heals the name via displayNamePending.
    }
  };

  const loginWithGoogle = async () => {
    if (!auth) throw new Error('Firebase not configured');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged will call setLoading(false) after syncing user state.
    } catch (error: any) {
      setLoading(false);
      if (error.code === 'auth/account-exists-with-different-credential') {
        const pendingCred = GoogleAuthProvider.credentialFromError(error);
        if (pendingCred) {
          sessionStorage.setItem(PENDING_CRED_KEY, JSON.stringify({
            provider: 'google.com',
            idToken: (pendingCred as any).idToken ?? null,
            accessToken: (pendingCred as any).accessToken ?? null,
          }));
        }
        // Re-throw with the code intact so pages can map it to a localized
        // message; the raw message is never shown to users.
        throw error;
      } else if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        // User dismissed — silent
        return;
      } else {
        throw error;
      }
    }
  };

  const logout = async () => {
    if (!auth) return;
    // Record the sign-out BEFORE signing out — afterwards there is no ID token
    // left to authenticate the call. Awaited but non-fatal: sign-out must
    // proceed even if the audit write fails.
    await api.post('/auth/logout').catch(() => {});
    await signOut(auth);
    setUser(null);
  };

  const resetPassword = async (email: string) => {
    await api.post('/auth/reset-password', { email });
  };

  const resendVerification = async () => {
    await api.post('/auth/send-verification');
  };

  const refreshEmailVerified = async (): Promise<boolean> => {
    if (!auth?.currentUser) return false;
    await auth.currentUser.reload();
    const verified = auth.currentUser.emailVerified;
    setEmailVerified(verified);
    return verified;
  };

  const refreshUser = async () => {
    try {
      const userData = await api.post<User>('/auth/verify');
      setUser(userData);
      setDegraded(false);
      hasRealAccount.current = true;
      setPlaceholderAccount(false);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        loading,
        emailVerified,
        degraded,
        placeholderAccount,
        login,
        register,
        loginWithGoogle,
        logout,
        resetPassword,
        resendVerification,
        refreshEmailVerified,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
