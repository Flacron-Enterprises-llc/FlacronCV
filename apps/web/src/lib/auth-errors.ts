/**
 * Maps Firebase Auth / network errors to translation keys inside the `auth`
 * namespace (use with `useTranslations('auth')`). Pages translate the
 * returned key so users always see a friendly, localized message instead of
 * raw SDK output like "Firebase: Error (auth/...)".
 *
 * `auth/account-exists-with-different-credential` is intentionally not
 * handled here — it needs {email} interpolation, so pages special-case it
 * with `t('account_exists_link', { email })`.
 */
export function authErrorKey(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'errors.invalid_credentials';
    case 'auth/invalid-email':
      return 'errors.invalid_email';
    case 'auth/user-disabled':
      return 'errors.account_disabled';
    case 'auth/too-many-requests':
      return 'errors.too_many_attempts';
    case 'auth/email-already-in-use':
      return 'errors.email_in_use';
    case 'auth/weak-password':
      return 'errors.weak_password';
    case 'auth/popup-blocked':
      return 'errors.popup_blocked';
    case 'auth/network-request-failed':
      return 'errors.network';
    default:
      break;
  }

  const message = (error as Error)?.message ?? '';

  // Firebase was never initialised — `auth` is null because the NEXT_PUBLIC_*
  // config was missing at BUILD time, so every call throws before any request
  // leaves the browser. Without this branch it fell through to the generic
  // "Something went wrong", which sent people hunting through an empty network
  // tab and a clean console for a problem that is purely a build-config one.
  if (/expected auth instance|auth.*null|null.*auth|not.*initial/i.test(message)) {
    return 'errors.auth_unavailable';
  }

  // fetch() failures (API unreachable), timeouts, and other transport errors
  if (/failed to fetch|network|timed out/i.test(message)) {
    return 'errors.network';
  }
  return 'errors.generic';
}

export function isAccountExistsError(error: unknown): boolean {
  return (error as { code?: string })?.code === 'auth/account-exists-with-different-credential';
}

export function accountExistsEmail(error: unknown): string {
  return ((error as { customData?: { email?: string } })?.customData?.email) ?? '';
}
