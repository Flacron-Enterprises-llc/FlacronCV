import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useT } from '../../i18n';
import type { AppleSignInResult } from '../../store/auth-store';
import { SocialButton } from './SocialButton';

/**
 * Sign in with Apple is offered on iOS only, and only when the build turns it
 * on (EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED=true, set once the Apple provider is
 * enabled in Firebase Authentication) — a button that fails would be worse
 * than none.
 */
export const APPLE_SIGN_IN_CONFIGURED =
  Platform.OS === 'ios' && process.env.EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED?.trim().toLowerCase() === 'true';

/** True once the device confirms Apple sign-in works here (iOS 13+, configured build). */
export function useAppleSignInAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!APPLE_SIGN_IN_CONFIGURED) return;
    let alive = true;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (alive) setAvailable(ok);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

/** Random nonce: the raw value goes to Firebase, its SHA-256 to Apple (replay protection). */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

export type AppleSignInHandle = { prompt: () => Promise<void> };

interface Props {
  label: string;
  onResult: (result: AppleSignInResult) => void;
  /** If set, tapping only calls this; the parent calls prompt() later (after the legal step). */
  onPressOverride?: () => void;
  disabled?: boolean;
}

export const AppleSignInButton = forwardRef<AppleSignInHandle, Props>(function AppleSignInButton(
  { label, onResult, onPressOverride, disabled },
  ref,
) {
  const t = useT('auth');
  const tc = useT('common');
  const [busy, setBusy] = useState(false);

  const prompt = useCallback(async () => {
    setBusy(true);
    try {
      const nonce = await makeNonce();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: nonce.hashed,
      });
      if (!credential.identityToken) {
        Alert.alert(t('apple.failedTitle'), t('google.noToken'));
        return;
      }
      const fullName = credential.fullName
        ? AppleAuthentication.formatFullName(credential.fullName).trim() || null
        : null;
      onResult({ identityToken: credential.identityToken, rawNonce: nonce.raw, fullName });
    } catch (err: unknown) {
      // The person closed the Apple sheet: stay silent.
      if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert(t('apple.failedTitle'), tc('pleaseTryAgain'));
    } finally {
      setBusy(false);
    }
  }, [onResult, t, tc]);

  useImperativeHandle(ref, () => ({ prompt }), [prompt]);

  return (
    <SocialButton
      provider="apple"
      label={label}
      loading={busy}
      disabled={disabled}
      onPress={() => {
        if (onPressOverride) onPressOverride();
        else void prompt();
      }}
    />
  );
});
