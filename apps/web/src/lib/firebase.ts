import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  connectAuthEmulator,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  Auth,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (isConfigured) {
  const isNewApp = getApps().length === 0;
  app = isNewApp ? initializeApp(firebaseConfig) : getApps()[0];

  // This is a pnpm workspace where apps/mobile pulls in
  // @react-native-async-storage/async-storage, which pnpm links as an optional
  // peer of firebase/auth. A bare getAuth() can then load React-Native-flavoured
  // persistence / popup-resolver code in the browser build, which breaks
  // signInWithPopup with "INTERNAL ASSERTION FAILED: Pending promise was never
  // set". Initialising auth explicitly pins it to the browser code path and the
  // browser popup resolver. Falls back to getAuth() on HMR re-imports.
  if (isNewApp) {
    try {
      auth = initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch {
      auth = getAuth(app);
    }
  } else {
    auth = getAuth(app);
  }

  db = getFirestore(app);
  storage = getStorage(app);

  // ── Local emulators (opt-in, never on by default) ─────────────────────────
  // Set NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true to point the client at the local
  // Firebase emulators instead of the live project, so test accounts and data
  // never touch production. Guarded by `isNewApp` because reconnecting an
  // already-initialised instance (HMR re-import) throws.
  if (isNewApp && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
    // 127.0.0.1 rather than localhost — on Windows the latter can resolve to
    // ::1 while the emulator binds IPv4 only.
    const authUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
    const [fsHost, fsPort] = (
      process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
    ).split(':');
    try {
      if (auth) connectAuthEmulator(auth, authUrl, { disableWarnings: true });
      if (db) connectFirestoreEmulator(db, fsHost, Number(fsPort) || 8080);
      // eslint-disable-next-line no-console
      console.info('[firebase] Using LOCAL emulators — production data is not touched.');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[firebase] Emulator connection failed; falling back to live config.', err);
    }
  }
}

export const googleProvider = new GoogleAuthProvider();

export { app, auth, db, storage };
export default app;
