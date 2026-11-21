import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  signInWithCredential: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
  updateProfile: vi.fn(async () => undefined),
  appleCredential: vi.fn((args: unknown) => ({ provider: 'apple.com', args })),
  googleCredential: vi.fn((token: string) => ({ provider: 'google.com', token })),
}));
const store = vi.hoisted(() => ({ pending: null as string | null }));

vi.mock('@firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  getAdditionalUserInfo: firebase.getAdditionalUserInfo,
  GoogleAuthProvider: { credential: firebase.googleCredential },
  OAuthProvider: class {
    constructor(public providerId: string) {}
    credential(args: unknown) {
      return firebase.appleCredential({ providerId: this.providerId, ...(args as object) });
    }
  },
  signInWithCredential: firebase.signInWithCredential,
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  updateProfile: firebase.updateProfile,
}));
vi.mock('../lib/firebase', () => ({ getFirebaseAuth: () => ({ currentUser: null, onAuthStateChanged: vi.fn() }) }));
vi.mock('../lib/api', () => ({ api: { post: vi.fn(), get: vi.fn() } }));
vi.mock('../lib/legal-acceptance', () => ({ fetchLegalAcceptanceRecord: vi.fn(), retryPendingLegalAcceptance: vi.fn() }));
vi.mock('../lib/api-errors', () => ({ requestFailureMessage: (_e: unknown, fallback: string) => fallback }));
vi.mock('../i18n', () => ({ t: (key: string) => key }));
vi.mock('../lib/secure-store', () => ({
  secureStore: {
    getPendingLegalConsent: vi.fn(async () => store.pending),
    setPendingLegalConsent: vi.fn(async (uid: string) => {
      store.pending = uid;
    }),
    clearPendingLegalConsent: vi.fn(async () => {
      store.pending = null;
    }),
    setAuthToken: vi.fn(),
    setUserId: vi.fn(),
    clearAll: vi.fn(),
  },
}));

const { useAuthStore } = await import('./auth-store');

function signedIn(uid: string, isNewUser: boolean, displayName: string | null = null) {
  const user = { uid, displayName };
  firebase.signInWithCredential.mockResolvedValueOnce({ user });
  firebase.getAdditionalUserInfo.mockReturnValueOnce({ isNewUser });
  return user;
}

describe('auth store — Sign in with Apple', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.pending = null;
    useAuthStore.setState({ legalGate: false, error: null, isLoading: false });
    vi.spyOn(useAuthStore.getState(), 'syncUser').mockResolvedValue(undefined);
  });

  it('signs in to Firebase with the apple.com credential, the identity token and the RAW nonce', async () => {
    signedIn('u1', false, 'Dee');
    await useAuthStore.getState().loginWithApple({ identityToken: 'id-token', rawNonce: 'raw-nonce', fullName: null });
    expect(firebase.appleCredential).toHaveBeenCalledWith({ providerId: 'apple.com', idToken: 'id-token', rawNonce: 'raw-nonce' });
    expect(firebase.signInWithCredential).toHaveBeenCalledWith(expect.anything(), { provider: 'apple.com', args: expect.anything() });
  });

  it('saves the name Apple shares on first sign-in, but never overwrites an existing name', async () => {
    const fresh = signedIn('u2', true, null);
    await useAuthStore.getState().loginWithApple({ identityToken: 't', rawNonce: 'n', fullName: 'Ada Lovelace' });
    expect(firebase.updateProfile).toHaveBeenCalledWith(fresh, { displayName: 'Ada Lovelace' });

    firebase.updateProfile.mockClear();
    signedIn('u3', false, 'Existing Name');
    await useAuthStore.getState().loginWithApple({ identityToken: 't', rawNonce: 'n', fullName: 'Other' });
    expect(firebase.updateProfile).not.toHaveBeenCalled();
  });

  it('keeps a brand-new Apple account behind the legal gate (same contract as Google)', async () => {
    signedIn('new-user', true);
    const result = await useAuthStore.getState().loginWithApple({ identityToken: 't', rawNonce: 'n' }, { gateNewUser: true });
    expect(result).toEqual({ isNewUser: true, uid: 'new-user' });
    expect(useAuthStore.getState().legalGate).toBe(true);
    expect(store.pending).toBe('new-user');
  });

  it('lets an existing account with nothing owed straight through', async () => {
    signedIn('old-user', false);
    const result = await useAuthStore.getState().loginWithApple({ identityToken: 't', rawNonce: 'n' }, { gateNewUser: true });
    expect(result).toEqual({ isNewUser: false, uid: 'old-user' });
    expect(useAuthStore.getState().legalGate).toBe(false);
    expect(store.pending).toBeNull();
  });

  it('drops the gate and reports the error when Firebase refuses the credential', async () => {
    firebase.signInWithCredential.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'auth/invalid-credential' }));
    await expect(
      useAuthStore.getState().loginWithApple({ identityToken: 't', rawNonce: 'n' }, { gateNewUser: true }),
    ).rejects.toThrow();
    expect(useAuthStore.getState().legalGate).toBe(false);
    expect(useAuthStore.getState().error).toBeTruthy();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('Google still uses the shared path (Google credential from the ID token)', async () => {
    signedIn('g-user', false);
    await useAuthStore.getState().loginWithGoogle('google-id-token');
    expect(firebase.googleCredential).toHaveBeenCalledWith('google-id-token');
  });
});
