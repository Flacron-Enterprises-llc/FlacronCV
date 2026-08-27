import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User as FirebaseUser,
} from '@firebase/auth';
import axios from 'axios';
import { create } from 'zustand';
import { getFirebaseAuth } from '../lib/firebase';
import { api } from '../lib/api';
import {
  fetchLegalAcceptanceRecord,
  retryPendingLegalAcceptance,
} from '../lib/legal-acceptance';
import { secureStore } from '../lib/secure-store';
import { User } from '../types/user.types';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  emailVerified: boolean;
  error: string | null;
  /**
   * Set when POST /auth/verify fails. Firebase session stays; legalGate is
   * not touched. Screens must not treat a missing `user` as a new Free account.
   */
  userSyncError: string | null;
  /** True while a new signup has not ticked the legal modal (any method). */
  legalGate: boolean;

  // Actions
  initialize: () => () => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (
    idToken: string,
    opts?: { gateNewUser?: boolean },
  ) => Promise<{ isNewUser: boolean; uid: string }>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  syncUser: () => Promise<void>;
  setLegalGate: (legalGate: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  user: null,
  isLoading: false,
  isInitialized: false,
  emailVerified: false,
  error: null,
  userSyncError: null,
  legalGate: false,

  initialize: () => {
    const unsubscribe = getFirebaseAuth().onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          await secureStore.setAuthToken(token);
          await secureStore.setUserId(firebaseUser.uid);

          const consentUid = await secureStore.getPendingLegalConsent();
          let consentGate = consentUid === firebaseUser.uid;
          // Only when the device flag matches: a leftover uid on an already-
          // accepted account must not lock them out. Do not GET on every cold
          // start — { acceptance: null } is also grandfathered (L1).
          if (consentGate) {
            try {
              const mine = await fetchLegalAcceptanceRecord();
              if (mine?.acceptance != null) {
                await secureStore.clearPendingLegalConsent();
                consentGate = false;
              }
            } catch {
              // Stay gated. Modal is the forward path.
            }
          }

          set({
            firebaseUser,
            emailVerified: firebaseUser.emailVerified,
            // Spread-true only: in-memory legalGate during register() must not
            // be cleared if onAuthStateChanged wins the race before the flag write.
            ...(consentGate ? { legalGate: true } : {}),
          });

          // Sync user profile with backend
          await get().syncUser();
        } catch {
          set({ firebaseUser: null, user: null, userSyncError: null, legalGate: false });
        }
      } else {
        await secureStore.clearAll();
        set({
          firebaseUser: null,
          user: null,
          emailVerified: false,
          userSyncError: null,
          legalGate: false,
        });
      }
      set({ isInitialized: true });
    });
    return unsubscribe;
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      // onAuthStateChanged handles the rest
    } catch (err: unknown) {
      const message = getFirebaseErrorMessage(err);
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ isLoading: false });
    }
  },

  loginWithGoogle: async (idToken: string, opts) => {
    set({ isLoading: true, error: null });
    try {
      // Block dashboard redirect until we know whether this is a new user.
      // additionalUserInfo.isNewUser is only available AFTER signInWithCredential.
      if (opts?.gateNewUser) set({ legalGate: true });

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(getFirebaseAuth(), credential);
      const uid = result.user.uid;
      const info = getAdditionalUserInfo(result);
      // Fallback: if additionalUserInfo is missing, treat as new so they cannot slip through.
      const isExplicitlyExisting = info?.isNewUser === false;
      const consentUid = await secureStore.getPendingLegalConsent();
      const stillNeedsConsent = consentUid === uid;

      if (opts?.gateNewUser && isExplicitlyExisting && !stillNeedsConsent) {
        set({ legalGate: false });
        return { isNewUser: false, uid };
      }

      if (!isExplicitlyExisting || stillNeedsConsent) {
        await secureStore.setPendingLegalConsent(uid);
      }

      if (opts?.gateNewUser) {
        set({ legalGate: true });
        return { isNewUser: true, uid };
      }

      return { isNewUser: !isExplicitlyExisting, uid };
    } catch (err: unknown) {
      if (opts?.gateNewUser) set({ legalGate: false });
      const message = getFirebaseErrorMessage(err);
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      // Before any other await: a crash after Auth must still re-gate on relaunch.
      await secureStore.setPendingLegalConsent(credential.user.uid);
      set({ legalGate: true });
      await updateProfile(credential.user, { displayName });
      await sendEmailVerification(credential.user);
      const token = await credential.user.getIdToken();
      await secureStore.setAuthToken(token);

      // Sync user with backend
      await api.post('/auth/verify');
    } catch (err: unknown) {
      const message = getFirebaseErrorMessage(err);
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await signOut(getFirebaseAuth());
      await secureStore.clearAll();
      set({ firebaseUser: null, user: null, emailVerified: false, userSyncError: null, legalGate: false });
    } catch {
      // Force cleanup even on error
      await secureStore.clearAll();
      set({ firebaseUser: null, user: null, emailVerified: false, userSyncError: null, legalGate: false });
    }
  },

  resetPassword: async (email) => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/auth/reset-password', { email });
    } catch (err: unknown) {
      const message = getFirebaseErrorMessage(err);
      set({ error: message });
      throw new Error(message);
    } finally {
      set({ isLoading: false });
    }
  },

  resendVerification: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/auth/send-verification');
    } catch (err: unknown) {
      const message = (err as Error).message;
      set({ error: message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  syncUser: async () => {
    try {
      const { firebaseUser } = get();
      if (!firebaseUser) return;

      // Refresh token before syncing
      const token = await firebaseUser.getIdToken(true);
      await secureStore.setAuthToken(token);

      const user = await api.post<User>('/auth/verify');
      set({ user, userSyncError: null });
      await retryPendingLegalAcceptance();
    } catch (err) {
      // Do not rethrow: initialize() would clear firebaseUser and bounce
      // to login. Do not touch legalGate. Keep any previously synced user.
      const userSyncError =
        axios.isAxiosError(err) && !err.response
          ? 'No connection. Check your network and try again.'
          : 'Could not load your account. Please try again.';
      set({ userSyncError });
    }
  },

  setLegalGate: (legalGate) => set({ legalGate }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));

function getFirebaseErrorMessage(err: unknown): string {
  const error = err as { code?: string; message?: string };
  switch (error.code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with a different sign-in method.';
    default:
      return error.message ?? 'An unexpected error occurred.';
  }
}
