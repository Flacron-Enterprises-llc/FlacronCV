/**
 * Fills thumbnailURL + previewImages on the ten live CV catalog docs.
 *
 * WHY THIS EXISTS: seedDefaults writes those fields on create only. The live
 * templates collection was created before the stills existed, so the docs are
 * still blank. PUT /templates/:id would work, but it needs an admin ID token.
 * This script uses the same service-account fields as the API (apps/api/.env)
 * and writes Firestore directly.
 *
 *   pnpm --filter api run backfill:template-previews
 *   pnpm --filter api run backfill:template-previews -- --apply
 *
 * DRY RUN BY DEFAULT — without --apply it only prints the plan. Cover letters
 * are not touched. Docs that already have a non-empty thumbnailURL are skipped
 * unless you pass --force.
 *
 * ⚠️ --apply writes to whichever Firebase project apps/api/.env points at — for
 * you that is PRODUCTION. It only updates thumbnailURL, previewImages, and
 * updatedAt on the ten CV ids below.
 */
import fs from 'fs';
import admin from 'firebase-admin';

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const EXPECTED_PROJECT = 'flacron-cv';
const BUCKET = 'flacron-cv.firebasestorage.app';
const CV_IDS = [
  'classic',
  'modern',
  'minimal',
  'professional',
  'creative',
  'executive',
  'compact',
  'two-column',
  'academic',
  'bold',
];

function stills(id) {
  const fileUrl = (file) =>
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`template-previews/cv/${id}/${file}`)}?alt=media`;
  return {
    thumbnailURL: fileUrl('thumb.webp'),
    previewImages: [fileUrl('page.webp')],
  };
}

/**
 * Same reader as grant-admin.mjs. FIREBASE_PRIVATE_KEY is a quoted PEM block
 * and this .env is CRLF — a naive split truncates the key.
 */
function loadEnv(url) {
  const raw = fs.readFileSync(url, 'utf8');
  const out = {};
  const re =
    /^[ \t]*([A-Za-z0-9_]+)[ \t]*=[ \t]*(?:"([\s\S]*?)"|'([\s\S]*?)'|([^\r\n]*))[ \t\r]*$/gm;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]] = (m[2] ?? m[3] ?? m[4] ?? '').replace(/\\n/g, '\n');
  }
  return out;
}

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    '\n✖ FIRESTORE_EMULATOR_HOST is set in this terminal.\n' +
      '  firebase-admin would write the emulator, not the live catalog.\n' +
      '  Unset it, then rerun:\n\n' +
      '    Remove-Item Env:FIRESTORE_EMULATOR_HOST\n',
  );
  process.exit(1);
}

const envPath = new URL('../.env', import.meta.url);
if (!fs.existsSync(envPath)) {
  console.error('\n✖ apps/api/.env not found. This script reads the API service account from there.\n');
  process.exit(1);
}

const env = loadEnv(envPath);
const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    '\n✖ apps/api/.env is missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.\n',
  );
  process.exit(1);
}

if (projectId !== EXPECTED_PROJECT) {
  console.error(
    `\n✖ Refusing to run: FIREBASE_PROJECT_ID is not ${EXPECTED_PROJECT}.\n` +
      '  This backfill is for the live catalog only.\n',
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();

console.log(`\nProject : ${EXPECTED_PROJECT}`);
console.log(`Mode    : ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);
console.log(`Force   : ${FORCE ? 'yes (overwrite existing URLs)' : 'no (skip docs that already have a thumbnailURL)'}\n`);

const missing = [];
const skipped = [];
const planned = [];

for (const id of CV_IDS) {
  const snap = await db.collection('templates').doc(id).get();
  if (!snap.exists) {
    missing.push(id);
    console.log(`MISSING  ${id}`);
    continue;
  }
  const current = snap.get('thumbnailURL') || '';
  const next = stills(id);
  if (current && !FORCE) {
    skipped.push(id);
    console.log(`SKIP     ${id}  (thumbnailURL already set)`);
    continue;
  }
  planned.push({ id, from: current, to: next.thumbnailURL, previewImages: next.previewImages });
  console.log(`${current ? 'REPLACE' : 'FILL   '}  ${id}`);
  console.log(`         ${next.thumbnailURL}`);
}

if (missing.length) {
  console.error(
    `\n✖ Missing catalog docs: ${missing.join(', ')}.\n` +
      '  Refusing to write a partial catalog. Nothing was changed.\n',
  );
  process.exit(1);
}

if (!planned.length) {
  console.log('\nNothing to do — all ten already have thumbnailURL.\n');
  process.exit(0);
}

if (!APPLY) {
  console.log(
    `\nWould update ${planned.length} doc(s), skip ${skipped.length}.` +
      '\nRe-run with --apply to write:\n' +
      '  pnpm --filter api run backfill:template-previews -- --apply\n',
  );
  process.exit(0);
}

const now = new Date();
for (const row of planned) {
  await db.collection('templates').doc(row.id).update({
    thumbnailURL: row.to,
    previewImages: row.previewImages,
    updatedAt: now,
  });
  console.log(`WROTE    ${row.id}`);
}

console.log(
  `\n✔ Updated ${planned.length} template(s).` +
    '\n  Confirm with:  curl.exe -sS "https://api.flacroncv.com/api/v1/templates?category=cv"' +
    '\n  Mobile caches this list for 10 minutes — kill and reopen the app.\n',
);
process.exit(0);
