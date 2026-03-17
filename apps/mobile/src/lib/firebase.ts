import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, FirebaseApp } from '@firebase/app';
import { Auth, getAuth, initializeAuth } from '@firebase/auth';
// getReactNativePersistence exists in the RN build at runtime but not in the main TS typings.
// Using require() so Metro resolves it from the react-native condition at bundle time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getReactNativePersistence } = require('@firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => import('@firebase/auth').Persistence;
};

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize app at module scope (safe — synchronous, no timing issues)
export const firebaseApp: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Lazily initializes Firebase Auth with AsyncStorage persistence on first call.
 * NOT called at module scope to avoid "Component auth has not been registered yet"
 * timing errors that occur during Expo Router's synchronous route evaluation.
 */
let _auth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  try {
    _auth = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Auth already initialized (e.g. Fast Refresh) — returns the existing instance
    // which already has AsyncStorage persistence from the first initializeAuth call.
    _auth = getAuth(firebaseApp);
  }
  return _auth;
}

