/**
 * Account settings actions shared with the website's settings page
 * (apps/web/src/app/[locale]/(dashboard)/settings/page.tsx). Wording is the
 * website's English copy (`settings.preferences.*`, `settings.account.*`).
 * Pure logic only — the screen wires in the API and the auth store.
 */

export type EmailPreferenceKey = 'emailNotifications' | 'marketingEmails';

export const EMAIL_PREFERENCES: readonly { key: EmailPreferenceKey; label: string; description: string }[] = [
  {
    key: 'emailNotifications',
    label: 'Email Notifications',
    description: 'Receive updates and tips via email',
  },
  {
    key: 'marketingEmails',
    label: 'Marketing Emails',
    description: 'Product news, tips, and special offers',
  },
];

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

export const PREFERENCES_SAVE_ERROR = 'Failed to save preferences';

export const PASSWORD_COPY = {
  rowLabel: 'Change Password',
  rowDescription: 'Change your account password',
  confirmTitle: 'Change Password',
  confirmBody:
    "We'll send you an email with a link to reset your password. Click the link in the email to create a new password.",
  confirmAction: 'Send Reset Link',
  sentTitle: 'Check your email',
  sentBody: (email: string) => `We sent a password reset link to ${email}`,
  failedTitle: 'Failed to send reset email',
} as const;

export const SIGN_OUT_EVERYWHERE_COPY = {
  rowLabel: 'Sign out of all devices',
  rowDescription:
    'Signs your account out everywhere it is currently signed in, including this device. Other devices lose access the next time their session refreshes, within one hour.',
  confirmTitle: 'Sign out of all devices?',
  confirmBody: 'You will be signed out on this device too and will need to sign in again.',
  confirmAction: 'Sign out everywhere',
  success: 'Signed out of all devices',
  errorTitle: 'Not signed out',
  error: 'Could not sign out of all devices. Please try again.',
} as const;

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
