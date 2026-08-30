import { Alert } from 'react-native';
import {
  isEmailUnverifiedRejection,
  nestErrorMessage,
  requestFailureMessage,
} from './api-errors';
import { useAuthStore } from '../store/auth-store';

const DEFAULT_UNVERIFIED_MESSAGE =
  'Verify your email to create new documents. Your existing files stay readable, editable, and exportable.';

async function handleResend(): Promise<void> {
  try {
    await useAuthStore.getState().resendVerification();
    Alert.alert('Email sent', 'Check your inbox for a verification link.');
  } catch (err) {
    Alert.alert(
      'Could not resend',
      requestFailureMessage(err, 'Could not send verification email. Please try again.'),
    );
  }
}

async function handleConfirmVerified(): Promise<void> {
  try {
    const verified = await useAuthStore.getState().confirmEmailVerified();
    if (verified) {
      Alert.alert('Email verified', 'You can create documents and use the Flacron Engine now.');
    } else {
      Alert.alert(
        'Not verified yet',
        'Open the link in your verification email, then tap I\'ve verified again.',
      );
    }
  } catch (err) {
    Alert.alert(
      'Could not check',
      requestFailureMessage(err, 'Could not refresh verification status. Please try again.'),
    );
  }
}

/**
 * Wall UI for ABUSE_EMAIL_UNVERIFIED — Resend + I’ve verified at the failure
 * site (create / duplicate / AI), not buried in settings.
 */
export function presentUnverifiedEmailAlert(message?: string): void {
  Alert.alert('Verify your email', message?.trim() || DEFAULT_UNVERIFIED_MESSAGE, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Resend email', onPress: () => void handleResend() },
    { text: "I've verified", onPress: () => void handleConfirmVerified() },
  ]);
}

/** @returns true when the error was the unverified wall and an alert was shown. */
export function alertIfUnverifiedEmail(err: unknown): boolean {
  if (!isEmailUnverifiedRejection(err)) return false;
  presentUnverifiedEmailAlert(nestErrorMessage(err) || undefined);
  return true;
}

export { handleResend as resendVerificationEmail, handleConfirmVerified as confirmVerifiedEmail };
