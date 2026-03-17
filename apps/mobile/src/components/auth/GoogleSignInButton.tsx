import * as Google from 'expo-auth-session/providers/google';
import React, { useEffect } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  label: string;
  onToken: (idToken: string) => void;
}

/**
 * Rendered only when the platform-appropriate Google client ID env var is set.
 * Keeping the hook inside this component means it never runs unless the component mounts.
 */
export function GoogleSignInButton({ label, onToken }: Props) {
  const [, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      onToken(id_token);
    }
  }, [response]);

  return (
    <TouchableOpacity
      onPress={() => promptAsync()}
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
}

/** Returns true if Google Sign-In can be used on the current platform. */
export function isGoogleSignInAvailable(): boolean {
  if (Platform.OS === 'android') return !!process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  if (Platform.OS === 'ios') return !!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  return !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
}
