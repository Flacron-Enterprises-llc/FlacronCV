/**
 * Grants an existing user the admin/super_admin role.
 *
 * WHY THIS EXISTS: authorization is decided by the Firebase ID-token custom
 * claim (`firebase-auth.guard.ts` reads `decodedToken.role`), NOT by the
 * Firestore `role` field. The Firebase Console cannot set custom claims from its
 * UI, so this script is the supported way to do it. It also keeps the Firestore
 * `role` field in sync so the CRM/Admin lists display correctly.
 *
 *   node scripts/grant-admin.mjs someone@example.com
 *   node scripts/grant-admin.mjs someone@example.com admin
 *
 * The role defaults to super_admin (unlocks Admin panel + CRM, including
 * /crm/settings which is super_admin-only).
 *
 * ⚠️ This writes to whichever Firebase project apps/api/.env points at — for you
 * that is PRODUCTION. It only changes the named user's role; nothing else.
 */
import fs from 'fs';
import admin from 'firebase-admin';

const VALID_ROLES = ['user', 'admin', 'super_admin'];

const email = process.argv[2];
const role = process.argv[3] || 'super_admin';

if (!email || !email.includes('@')) {
  console.error(
    '\n✖ Usage: node scripts/grant-admin.mjs <email> [user|admin|super_admin]\n' +
      '  An email is required — this script never picks a default account.\n',
  );
  process.exit(1);
}
if (!VALID_ROLES.includes(role)) {
  console.error(`\n✖ Invalid role "${role}". Use one of: ${VALID_ROLES.join(', ')}\n`);
  process.exit(1);
}

/**
 * Minimal .env reader that understands QUOTED MULTI-LINE values — required
 * because FIREBASE_PRIVATE_KEY is a PEM block. A naive line-by-line parser
 * truncates it at the first newline and firebase-admin then fails with
 * "Invalid PEM formatted message".
 */
function loadEnv(url) {
  const raw = fs.readFileSync(url, 'utf8');
  const out = {};
  // NOTE the \r in the trailing class: this .env is CRLF, and without it the
  // line never matches, silently yielding an undefined key.
  const re =
    /^[ \t]*([A-Za-z0-9_]+)[ \t]*=[ \t]*(?:"([\s\S]*?)"|'([\s\S]*?)'|([^\r\n]*))[ \t\r]*$/gm;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]] = (m[2] ?? m[3] ?? m[4] ?? '').replace(/\\n/g, '\n');
  }
  return out;
}

const env = loadEnv(new URL('../.env', import.meta.url));

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});

console.log(`\nProject : ${env.FIREBASE_PROJECT_ID}`);
console.log(`User    : ${email}`);
console.log(`Role    : ${role}\n`);

const user = await admin.auth().getUserByEmail(email);

// 1. The custom claim — this is what the API guards actually read.
await admin.auth().setCustomUserClaims(user.uid, { role });

// 2. Keep the Firestore document in sync so the Admin/CRM user lists match.
await admin.firestore().collection('users').doc(user.uid).set({ role }, { merge: true });

const refreshed = await admin.auth().getUser(user.uid);

console.log(`✔ uid           : ${user.uid}`);
console.log(`✔ custom claims : ${JSON.stringify(refreshed.customClaims)}`);
console.log(`✔ firestore role: ${role}`);
console.log(`
NEXT STEP — the claim is baked into the ID token, so it only appears after the
token is reissued:

   Sign out of the app and sign back in.

Then these unlock (same account for both panels):
   Admin : http://localhost:3000/en/admin
   CRM   : http://localhost:3000/en/crm
`);

process.exit(0);
