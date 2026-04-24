'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  GithubAuthProvider,
  linkWithCredential,
  OAuthCredential,
} from 'firebase/auth';
import { auth, googleProvider, isConfigured } from '@/lib/firebase';

const PENDING_CRED_KEY = 'flacroncv_pending_oauth_credential';
export const GOOGLE_ERROR_KEY = 'flacroncv_google_error';

import { api } from '@/lib/api';
import { User } from '@flacroncv/shared-types';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  emailVerified: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshEmailVerified: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);

  useEffect(() => {
    if (!isConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      setEmailVerified(fbUser?.emailVerified ?? false);
      if (fbUser) {
        try {
          const userData = await api.post<User>('/auth/verify');
          setUser(userData);
        } catch (error) {
          console.error('Failed to sync user with backend:', error);
          setUser({
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || '',
            photoURL: fbUser.photoURL,
            phoneNumber: fbUser.phoneNumber,
            profile: { firstName: '', lastName: '', headline: '', bio: '', location: '', website: '', linkedin: '', github: '' },
            preferences: { language: 'en' as any, theme: 'system' as any, emailNotifications: true, marketingEmails: false, defaultCVTemplate: '' },
            subscription: { plan: 'free' as any, status: 'active' as any, stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false },
            usage: { cvsCreated: 0, coverLettersCreated: 0, aiCreditsUsed: 0, aiCreditsLimit: 10, exportsThisMonth: 0, lastExportReset: new Date() },
            role: 'user' as any,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastLoginAt: new Date(),
            isActive: true,
            deletedAt: null,
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
      throw error;
    }

    // If a Google/GitHub credential was stored (account-exists-with-different-credential),
    // link it now so the user can sign in with both methods going forward.
    const pendingCredStr = sessionStorage.getItem(PENDING_CRED_KEY);
    if (pendingCredStr) {
      try {
        const { provider, idToken, accessToken } = JSON.parse(pendingCredStr);
        const pendingCred: OAuthCredential =
          provider === 'github.com'
            ? GithubAuthProvider.credential(accessToken)
            : GoogleAuthProvider.credential(idToken, accessToken);
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
        const email: string = error.customData?.email ?? '';
        if (pendingCred) {
          sessionStorage.setItem(PENDING_CRED_KEY, JSON.stringify({
            provider: 'google.com',
            idToken: (pendingCred as any).idToken ?? null,
            accessToken: (pendingCred as any).accessToken ?? null,
          }));
        }
        const msg = `An account already exists for ${email}. Sign in with your password below and your Google account will be linked automatically.`;
        sessionStorage.setItem(GOOGLE_ERROR_KEY, msg);
        throw new Error(msg);
      } else if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        // User dismissed — silent
        return;
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('Popup was blocked by your browser. Please allow popups for this site and try again.');
      } else {
        throw error;
      }
    }
  };

  const logout = async () => {
    if (!auth) return;
    await signOut(auth);
    setUser(null);
  };

  const resetPassword = async (email: string) => {
    await api.post('/auth/reset-password', { email });
  };

  const resendVerification = async () => {
    await api.post('/auth/send-verification');
  };

  const refreshEmailVerified = async () => {
    if (!auth?.currentUser) return;
    await auth.currentUser.reload();
    setEmailVerified(auth.currentUser.emailVerified);
  };

  const refreshUser = async () => {
    try {
      const userData = await api.post<User>('/auth/verify');
      setUser(userData);
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
