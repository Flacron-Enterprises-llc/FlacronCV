import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { firebaseApp, getFirebaseAuth } from './firebase';

/** The person closed Apple's sheet: keep the account and say so. */
export class AppleConfirmationCancelled extends Error {
  constructor() {
    super('apple_confirmation_cancelled');
    this.name = 'AppleConfirmationCancelled';
  }
}

/**
 * App Store guideline 5.1.1(v): deleting an account that uses Sign in with
 * Apple must also cancel Apple's tokens. Apple needs a fresh authorization
 * code, so the person confirms with Apple once; Firebase exchanges and revokes
 * it (accounts:revokeToken, as its iOS SDK does; needs the Apple key in
 * Firebase's Apple provider). A failed revoke never traps someone in their
 * account: deletion goes on and 'failed' is returned.
 */
export async function revokeAppleAccess(): Promise<'not_apple' | 'unavailable' | 'revoked' | 'failed'> {
  const user = getFirebaseAuth().currentUser;
  if (!user?.providerData.some((p) => p.providerId === 'apple.com')) return 'not_apple';
  if (Platform.OS !== 'ios') return 'unavailable';
  let code: string | null = null;
  try {
    code = (await AppleAuthentication.signInAsync()).authorizationCode;
  } catch (err) {
    if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') throw new AppleConfirmationCancelled();
    return 'failed';
  }
  if (!code) return 'failed';
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${encodeURIComponent(firebaseApp.options.apiKey ?? '')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ios-Bundle-Identifier': 'com.flacroncv.mobile' },
        body: JSON.stringify({ providerId: 'apple.com', tokenType: 'CODE', token: code, idToken: await user.getIdToken() }),
      },
    );
    return response.ok ? 'revoked' : 'failed';
  } catch {
    return 'failed';
  }
}
