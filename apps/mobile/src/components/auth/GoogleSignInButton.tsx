import * as Google from 'expo-auth-session/providers/google';
import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { Alert, Platform } from 'react-native';
import { useT } from '../../i18n';
import { SocialButton } from './SocialButton';

interface Props {
  label: string;
  onToken: (idToken: string) => void;
  /** If set, the button does not open Google until the parent calls prompt(). */
  onPressOverride?: () => void;
  disabled?: boolean;
}

export type GoogleSignInHandle = {
  prompt: () => Promise<unknown>;
};

/**
 * Rendered only when the platform-appropriate Google client ID env var is set.
 * Keeping the hook inside this component means it never runs unless the component mounts.
 */
export const GoogleSignInButton = forwardRef<GoogleSignInHandle, Props>(
  function GoogleSignInButton({ label, onToken, onPressOverride, disabled }, ref) {
    const t = useT('auth');
    const tc = useT('common');
    const [, response, promptAsync] = Google.useIdTokenAuthRequest({
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    });

    useImperativeHandle(ref, () => ({
      prompt: () => promptAsync(),
    }));

    useEffect(() => {
      if (!response) return;
      if (response.type === 'success') {
        const idToken = response.params?.id_token;
        if (typeof idToken === 'string' && idToken.length > 0) {
          onToken(idToken);
          return;
        }
        Alert.alert(t('google.failedTitle'), t('google.noToken'));
        return;
      }
      if (response.type === 'error') {
        Alert.alert(t('google.failedTitle'), tc('pleaseTryAgain'));
      }
      // 'dismiss' / 'cancel' — user backed out; stay silent.
      // t/tc are deliberately not deps: a language change must not re-show the alert.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [response, onToken]);

    return (
      <SocialButton
        provider="google"
        label={label}
        disabled={disabled}
        onPress={() => {
          if (onPressOverride) onPressOverride();
          else void promptAsync();
        }}
      />
    );
  },
);

/** Returns true if Google Sign-In can be used on the current platform. */
export function isGoogleSignInAvailable(): boolean {
  if (Platform.OS === 'android') return !!process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  if (Platform.OS === 'ios') return !!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  return !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
}
