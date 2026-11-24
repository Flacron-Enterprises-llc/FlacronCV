import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ os: 'ios', providers: ['apple.com'], signIn: vi.fn(), fetch: vi.fn() }));
vi.mock('expo-apple-authentication', () => ({ signInAsync: h.signIn }));
vi.mock('react-native', () => ({ Platform: { get OS() { return h.os; } } }));
vi.mock('./firebase', () => ({
  firebaseApp: { options: { apiKey: 'public-key' } },
  getFirebaseAuth: () => ({ currentUser: { providerData: h.providers.map((providerId) => ({ providerId })), getIdToken: async () => 'id-token' } }),
}));
vi.stubGlobal('fetch', h.fetch);
const { AppleConfirmationCancelled, revokeAppleAccess } = await import('./apple-revoke');

beforeEach(() => {
  vi.clearAllMocks();
  h.os = 'ios';
  h.providers = ['apple.com'];
  h.signIn.mockResolvedValue({ authorizationCode: 'fresh-code' });
  h.fetch.mockResolvedValue({ ok: true });
});

describe('revokeAppleAccess', () => {
  it('sends a fresh Apple code and the ID token to accounts:revokeToken', async () => {
    expect(await revokeAppleAccess()).toBe('revoked');
    const [url, init] = h.fetch.mock.calls[0]!;
    expect(url).toContain('/v2/accounts:revokeToken?key=public-key');
    expect(JSON.parse(init.body)).toEqual({ providerId: 'apple.com', tokenType: 'CODE', token: 'fresh-code', idToken: 'id-token' });
    expect(init.headers['X-Ios-Bundle-Identifier']).toBe('com.flacroncv.mobile');
  });

  it('does nothing for accounts without Apple, and cannot ask outside iOS', async () => {
    h.providers = ['password'];
    expect(await revokeAppleAccess()).toBe('not_apple');
    h.providers = ['apple.com'];
    h.os = 'android';
    expect(await revokeAppleAccess()).toBe('unavailable');
    expect(h.signIn).not.toHaveBeenCalled();
  });

  it('stops the deletion when the person cancels Apple’s sheet', async () => {
    h.signIn.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    await expect(revokeAppleAccess()).rejects.toBeInstanceOf(AppleConfirmationCancelled);
  });

  it('never traps the account: a failed revoke reports failed', async () => {
    h.fetch.mockResolvedValue({ ok: false });
    expect(await revokeAppleAccess()).toBe('failed');
    h.fetch.mockRejectedValue(new Error('offline'));
    expect(await revokeAppleAccess()).toBe('failed');
    h.signIn.mockRejectedValue(new Error('other'));
    expect(await revokeAppleAccess()).toBe('failed');
  });
});
