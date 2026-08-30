import * as Google from 'expo-auth-session/providers/google';
import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { Alert, Platform, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  label: string;
  onToken: (idToken: string) => void;
  /** If set, the button does not open Google until the parent calls prompt(). */
  onPressOverride?: () => void;
}

export type GoogleSignInHandle = {
  prompt: () => Promise<unknown>;
};

/**
 * Rendered only when the platform-appropriate Google client ID env var is set.
 * Keeping the hook inside this component means it never runs unless the component mounts.
 */
export const GoogleSignInButton = forwardRef<GoogleSignInHandle, Props>(
  function GoogleSignInButton({ label, onToken, onPressOverride }, ref) {
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
        Alert.alert('Google Sign-In failed', 'No sign-in token was returned. Please try again.');
        return;
      }
      if (response.type === 'error') {
        Alert.alert('Google Sign-In failed', 'Please try again.');
      }
      // 'dismiss' / 'cancel' — user backed out; stay silent.
    }, [response, onToken]);

    return (
      <TouchableOpacity
        onPress={() => {
          if (onPressOverride) onPressOverride();
          else void promptAsync();
        }}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: '#e7e5e4',
          borderRadius: 14,
          paddingVertical: 14,
          gap: 10,
          backgroundColor: '#fff',
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#4285F4' }}>G</Text>
        </View>
        <Text style={{ color: '#1c1917', fontSize: 15, fontWeight: '600' }}>{label}</Text>
      </TouchableOpacity>
    );
  },
);

/** Returns true if Google Sign-In can be used on the current platform. */
export function isGoogleSignInAvailable(): boolean {
  if (Platform.OS === 'android') return !!process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  if (Platform.OS === 'ios') return !!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  return !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
}
