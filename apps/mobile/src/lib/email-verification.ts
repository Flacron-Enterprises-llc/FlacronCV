import { Alert } from 'react-native';
import {
  isEmailUnverifiedRejection,
  isTooManyRequests,
  nestErrorMessage,
  requestFailureMessage,
} from './api-errors';
import { t } from '../i18n';
import { useAuthStore } from '../store/auth-store';

async function handleResend(): Promise<void> {
  try {
    await useAuthStore.getState().resendVerification();
    Alert.alert(t('auth.emailVerification.sentTitle'), t('auth.emailVerification.sentBody'));
  } catch (err) {
    if (isTooManyRequests(err)) {
      Alert.alert(
        t('auth.emailVerification.tooManyTitle'),
        t('auth.emailVerification.tooManyBody'),
      );
      return;
    }
    Alert.alert(
      t('auth.emailVerification.resendFailedTitle'),
      requestFailureMessage(err, t('auth.emailVerification.resendFailedBody')),
    );
  }
}

async function handleConfirmVerified(): Promise<void> {
  try {
    const verified = await useAuthStore.getState().confirmEmailVerified();
    if (verified) {
      Alert.alert(t('auth.emailVerification.verifiedTitle'), t('auth.emailVerification.verifiedBody'));
    } else {
      Alert.alert(
        t('auth.emailVerification.notYetTitle'),
        t('auth.emailVerification.notYetBody'),
      );
    }
  } catch (err) {
    Alert.alert(
      t('auth.emailVerification.checkFailedTitle'),
      requestFailureMessage(err, t('auth.emailVerification.checkFailedBody')),
    );
  }
}

/**
 * Wall UI for ABUSE_EMAIL_UNVERIFIED — Resend + I’ve verified at the failure
 * site (create / duplicate / AI), not buried in settings.
 * A server-provided `message` is shown as received.
 */
export function presentUnverifiedEmailAlert(message?: string): void {
  Alert.alert(
    t('auth.emailVerification.title'),
    message?.trim() || t('auth.emailVerification.defaultMessage'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.emailVerification.resend'), onPress: () => void handleResend() },
      { text: t('auth.emailVerification.verified'), onPress: () => void handleConfirmVerified() },
    ],
  );
}

/** @returns true when the error was the unverified wall and an alert was shown. */
export function alertIfUnverifiedEmail(err: unknown): boolean {
  if (!isEmailUnverifiedRejection(err)) return false;
  presentUnverifiedEmailAlert(nestErrorMessage(err) || undefined);
  return true;
}

export { handleResend as resendVerificationEmail, handleConfirmVerified as confirmVerifiedEmail };
