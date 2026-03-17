import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User as FirebaseUser,
} from '@firebase/auth';
import { create } from 'zustand';
import { getFirebaseAuth } from '../lib/firebase';
import { api } from '../lib/api';
import { secureStore } from '../lib/secure-store';
import { User } from '../types/user.types';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  emailVerified: boolean;
  error: string | null;

  // Actions
  initialize: () => () => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  syncUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
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

  initialize: () => {
    const unsubscribe = getFirebaseAuth().onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          await secureStore.setAuthToken(token);
          await secureStore.setUserId(firebaseUser.uid);

          set({
            firebaseUser,
            emailVerified: firebaseUser.emailVerified,
          });

          // Sync user profile with backend
          await get().syncUser();
        } catch {
          set({ firebaseUser: null, user: null });
        }
      } else {
        await secureStore.clearAll();
        set({
          firebaseUser: null,
          user: null,
          emailVerified: false,
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

  loginWithGoogle: async (idToken: string) => {
    set({ isLoading: true, error: null });
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(getFirebaseAuth(), credential);
      // onAuthStateChanged handles the rest
    } catch (err: unknown) {
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
      set({ firebaseUser: null, user: null, emailVerified: false });
    } catch {
      // Force cleanup even on error
      await secureStore.clearAll();
      set({ firebaseUser: null, user: null, emailVerified: false });
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
      set({ user });
    } catch {
      // Firebase auth still valid even if backend sync fails
    }
  },

  updateUser: async (data) => {
    const { user } = get();
    if (!user) return;

    const updated = await api.patch<User>(`/users/${user.uid}`, data);
    set({ user: updated });
  },

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
