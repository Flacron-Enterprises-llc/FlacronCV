/**
 * Seeds the LOCAL Firebase emulators with a ready-to-use QA account.
 *
 * SAFETY: this script refuses to run unless BOTH emulator host variables are
 * set. firebase-admin only talks to the emulators when they are present, so the
 * guard makes it impossible for this to create a user in the live project.
 *
 *   pnpm --filter api run seed:emulator
 *
 * Override the credentials with SEED_EMAIL / SEED_PASSWORD if you like.
 */
import admin from 'firebase-admin';

// Force emulator mode BEFORE firebase-admin initialises. firebase-admin routes
// exclusively to these hosts when they are set, so this script structurally
// cannot reach the live project — and it works on Windows, where `VAR=x cmd`
// npm-script syntax does not.
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;

// Never allow a real service-account credential to be picked up here.
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

process.on('unhandledRejection', (err) => {
  console.error(
    '\n✖ Could not reach the Firebase emulators.\n' +
      '  Start them in another terminal first:  pnpm emulators\n\n' +
      `  (${err?.message ?? err})\n`,
  );
  process.exit(1);
});

const EMAIL = process.env.SEED_EMAIL || 'qa@flacroncv.test';
const PASSWORD = process.env.SEED_PASSWORD || 'Test1234!';
const DISPLAY_NAME = process.env.SEED_NAME || 'QA Tester';
// Must match the projectId the web client uses, or the emulator keeps them in
// separate project namespaces and the login will not be found.
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-flacroncv';

admin.initializeApp({ projectId: PROJECT_ID });

const auth = admin.auth();
const db = admin.firestore();

console.log(`→ Emulators: auth=${AUTH_HOST} firestore=${FIRESTORE_HOST} project=${PROJECT_ID}`);

// ── 1. Auth user (create or reuse) ──────────────────────────────────────────
let user;
try {
  user = await auth.getUserByEmail(EMAIL);
  console.log(`→ Reusing existing emulator user ${EMAIL}`);
  await auth.updateUser(user.uid, { password: PASSWORD, emailVerified: true });
} catch {
  user = await auth.createUser({
    email: EMAIL,
    password: PASSWORD,
    emailVerified: true, // skips the verification wall entirely
    displayName: DISPLAY_NAME,
  });
  console.log(`→ Created emulator user ${EMAIL}`);
}

// super_admin unlocks the Admin panel and CRM as well.
await auth.setCustomUserClaims(user.uid, { role: 'super_admin' });

// ── 2. Firestore profile — mirrors UsersService.create() exactly ────────────
const now = new Date();
const farFuture = new Date(now.getFullYear() + 10, 0, 1);

await db.collection('users').doc(user.uid).set(
  {
    uid: user.uid,
    email: EMAIL,
    displayName: DISPLAY_NAME,
    photoURL: null,
    phoneNumber: null,
    profile: {
      firstName: DISPLAY_NAME.split(' ')[0] || '',
      lastName: DISPLAY_NAME.split(' ').slice(1).join(' ') || '',
      headline: '',
      bio: '',
      location: '',
      website: '',
      linkedin: '',
      github: '',
    },
    preferences: {
      language: 'en',
      theme: 'system',
      emailNotifications: true,
      marketingEmails: false,
      defaultCVTemplate: 'modern',
    },
    subscription: {
      plan: 'enterprise', // unlimited CVs / cover letters / exports
      status: 'active', // non-delinquent, so resolveEffectivePlan keeps full access
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: farFuture,
      cancelAtPeriodEnd: false,
    },
    usage: {
      cvsCreated: 0,
      coverLettersCreated: 0,
      aiCreditsUsed: 0,
      aiCreditsLimit: 500, // Enterprise ceiling; re-run this script to top up
      exportsThisMonth: 0,
      lastExportReset: now,
    },
    role: 'super_admin',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    isActive: true,
    deletedAt: null,
  },
  { merge: true },
);

console.log(`
✔ Emulator QA account ready

    Email:    ${EMAIL}
    Password: ${PASSWORD}

    Plan:  enterprise  (unlimited CVs / cover letters / exports)
    AI:    500 credits — re-run this script to reset the counter to 0
    Role:  super_admin (Admin panel + CRM unlocked)

  Nothing here touches production.
`);

process.exit(0);
