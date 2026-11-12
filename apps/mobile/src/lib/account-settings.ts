/**
 * Account settings actions shared with the website's settings page
 * (apps/web/src/app/[locale]/(dashboard)/settings/page.tsx). The wording is in
 * the `settings` message namespace (src/i18n/locales/<locale>/settings.json:
 * `preferences.*`, `password.*`, `signOutEverywhere.*`).
 * Pure logic only — the screen wires in the API and the auth store.
 */

export type EmailPreferenceKey = 'emailNotifications' | 'marketingEmails';

/** The two email toggles, in the website's order. */
export const EMAIL_PREFERENCE_KEYS: readonly EmailPreferenceKey[] = ['emailNotifications', 'marketingEmails'];

/** Website defaults when the stored preference is missing: notifications on, marketing off. */
export function emailPreferenceValue(
  preferences: { emailNotifications?: boolean; marketingEmails?: boolean } | null | undefined,
  key: EmailPreferenceKey,
): boolean {
  const stored = preferences?.[key];
  if (typeof stored === 'boolean') return stored;
  return key === 'emailNotifications';
}

/**
 * Body of `PATCH /users/me/preferences` for one toggle. Only the changed key is
 * sent — the API merges per key, so this cannot overwrite `pushNotifications`,
 * language or theme.
 */
export function emailPreferencePatch(key: EmailPreferenceKey, value: boolean): Partial<Record<EmailPreferenceKey, boolean>> {
  return { [key]: value };
}

/**
 * "Change password" from Settings, as on the website: a reset link to the
 * signed-in address (never a typed one). Throws when the account has no email.
 */
export async function sendPasswordResetToSelf(
  email: string | null | undefined,
  resetPassword: (email: string) => Promise<void>,
): Promise<string> {
  const address = email?.trim();
  if (!address) throw new Error('This account has no email address.');
  await resetPassword(address);
  return address;
}

/**
 * Sign out on every device, as on the website: revoke every refresh token on
 * the server, then sign this device out locally. A failed revoke leaves the
 * local session alone (the user is told and can retry); a failed local
 * sign-out after a successful revoke is ignored — the session is dead anyway.
 */
export async function signOutEverywhere(deps: {
  revokeAllSessions: () => Promise<unknown>;
  signOutLocally: () => Promise<void>;
}): Promise<void> {
  await deps.revokeAllSessions();
  try {
    await deps.signOutLocally();
  } catch {
    /* the server already revoked this session; nothing left to clear */
  }
}
