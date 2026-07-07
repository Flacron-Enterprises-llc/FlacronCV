import { vi } from 'vitest';

export const mockAuth = {
  currentUser: null,
  onAuthStateChanged: vi.fn(),
};

export const getAuth = vi.fn(() => mockAuth);
export const GoogleAuthProvider = vi.fn(() => ({}));
export const GithubAuthProvider = vi.fn(() => ({}));
export const onAuthStateChanged = vi.fn();
export const signInWithEmailAndPassword = vi.fn();
export const createUserWithEmailAndPassword = vi.fn();
export const signInWithPopup = vi.fn();
export const signOut = vi.fn();
export const updateProfile = vi.fn();
export const sendPasswordResetEmail = vi.fn();
export const sendEmailVerification = vi.fn();
