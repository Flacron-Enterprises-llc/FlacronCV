/** The signed-in person, without a Firebase type leaking into the screens. */
export interface SignedInUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  getIdToken: () => Promise<string>;
}

/**
 * Email and password sign-in. Screens depend on this, not on Firebase.
 * Tests pass a fake. The Firebase implementation is `firebase-gateway.ts`.
 */
export interface AuthGateway {
  /** False when no emulator or production config is available. The form then shows the issuer-down state. */
  readonly available: boolean;
  current(): SignedInUser | null;
  subscribe(listener: (user: SignedInUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<SignedInUser>;
  signUp(email: string, password: string): Promise<SignedInUser>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  sendEmailVerification(): Promise<void>;
}

export function unavailableGateway(): AuthGateway {
  const refuse = () => Promise.reject(Object.assign(new Error('auth/not-configured'), { code: 'auth/not-configured' }));
  return {
    available: false,
    current: () => null,
    subscribe(listener) {
      listener(null);
      return () => undefined;
    },
    signIn: refuse,
    signUp: refuse,
    signOut: async () => undefined,
    sendPasswordReset: refuse,
    sendEmailVerification: refuse,
  };
}
