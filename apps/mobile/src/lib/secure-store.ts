import * as SecureStore from 'expo-secure-store';

const KEYS = {
  AUTH_TOKEN: 'flacroncv_auth_token',
  REFRESH_TOKEN: 'flacroncv_refresh_token',
  USER_ID: 'flacroncv_user_id',
  PENDING_TEMPLATE: 'flacroncv_pending_template',
  // Survives logout on purpose — clearAll() must never delete this. A new
  // token on every sign-out would make the device identifier useless.
  DEVICE_TOKEN: 'flacroncv_device_token',
  // L1 — not in clearAll. POST-retry uid (Auth succeeded, write failed).
  PENDING_LEGAL_POST: 'flacroncv_pending_legal_post',
  // Q5 — not in clearAll. Consent not yet given (new signup, any method).
  // Kept across logout so Cancel on the legal modal still re-prompts the same
  // uid. An accepted user with a leftover flag is ungated by GET
  // /legal/acceptances/me in auth initialize — not by deleting this on sign-out.
  PENDING_LEGAL_CONSENT: 'flacroncv_pending_legal_consent',
} as const;

const DEVICE_TOKEN_RE = /^[0-9a-f]{32}$/i;

function randomDeviceToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const secureStore = {
  async setAuthToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.AUTH_TOKEN, token);
  },

  async getAuthToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.AUTH_TOKEN);
  },

  async deleteAuthToken(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.AUTH_TOKEN);
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token);
  },

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
  },

  async deleteRefreshToken(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
  },

  async setUserId(uid: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.USER_ID, uid);
  },

  async getUserId(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.USER_ID);
  },

  async deleteUserId(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.USER_ID);
  },

  /** Unused; web-only hand-off. */
  async setPendingTemplate(templateId: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.PENDING_TEMPLATE, templateId);
  },

  /** Unused; web-only hand-off. */
  async getPendingTemplate(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.PENDING_TEMPLATE);
  },

  /** Unused; web-only hand-off. */
  async deletePendingTemplate(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.PENDING_TEMPLATE);
  },

  async setPendingLegalPost(uid: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.PENDING_LEGAL_POST, uid);
  },

  async getPendingLegalPost(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.PENDING_LEGAL_POST);
  },

  async clearPendingLegalPost(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.PENDING_LEGAL_POST);
  },

  async setPendingLegalConsent(uid: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.PENDING_LEGAL_CONSENT, uid);
  },

  async getPendingLegalConsent(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.PENDING_LEGAL_CONSENT);
  },

  async clearPendingLegalConsent(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.PENDING_LEGAL_CONSENT);
  },

  async getOrCreateDeviceToken(): Promise<string | null> {
    try {
      const existing = await SecureStore.getItemAsync(KEYS.DEVICE_TOKEN);
      if (existing && DEVICE_TOKEN_RE.test(existing)) return existing.toLowerCase();
      const token = randomDeviceToken();
      await SecureStore.setItemAsync(KEYS.DEVICE_TOKEN, token);
      return token;
    } catch {
      return null;
    }
  },

  async clearAll(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.AUTH_TOKEN),
      SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
      SecureStore.deleteItemAsync(KEYS.USER_ID),
    ]);
  },
};
