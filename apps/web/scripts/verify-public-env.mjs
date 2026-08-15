#!/usr/bin/env node
/**
 * Prove that the NEXT_PUBLIC_* Firebase configuration was really INLINED into
 * the compiled client bundle.
 *
 * WHY THIS EXISTS
 * `next build` replaces `process.env.NEXT_PUBLIC_*` with string literals at
 * COMPILE time. A value that arrives later — an ECS task-definition variable, a
 * Parameter Store lookup, `docker run --env` — never reaches the browser
 * JavaScript, which was frozen minutes earlier with `undefined` in its place.
 * The failure is invisible from the outside: the image builds, the push
 * succeeds, ECS goes green, and only the browser console says
 *
 *   [firebase] NOT INITIALISED — Missing at BUILD time: …
 *
 * Checking that the ENV VARS WERE SET (which the Dockerfile does, just above the
 * build) is necessary but NOT sufficient — it cannot catch a rename in the app
 * code, a `process.env[key]` dynamic lookup that webpack cannot statically
 * replace, or a Dockerfile whose ARGs land in the wrong stage. Only reading the
 * emitted bundle proves the round trip.
 *
 * USAGE
 *   node apps/web/scripts/verify-public-env.mjs [staticDir]
 *
 * staticDir defaults to `apps/web/.next/static`, which is the correct relative
 * path from `/app` in BOTH the builder stage and the runtime image, so the same
 * invocation works in either.
 *
 * SECRECY
 * Nothing here prints an environment value. Firebase web config is not secret —
 * it ships in the bundle by design, and access is governed by Firestore/Storage
 * rules and App Check — but CI logs are widely readable and are the wrong place
 * to normalise pasting credentials, and this same script is a template for
 * checks over values that ARE secret. Output is variable NAMES and match COUNTS
 * only.
 *
 * EXIT CODES (distinct, so a CI log says which of three very different things
 * went wrong instead of one useless "verification failed")
 *   0  every required value is present in the bundle
 *   1  a required value is in the environment but NOT in any emitted file
 *      → the build args did not reach `next build`, or the app stopped reading
 *        that variable
 *   2  a required variable is empty/unset in this process's environment
 *      → nothing to search for; fix the build args, not the bundle
 *   3  the static directory does not exist
 *      → wrong path, or a Dockerfile COPY problem in the runtime stage
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * The four the browser-side guard in src/lib/firebase.ts actually gates on:
 * `isConfigured` is false without apiKey + projectId, and auth is unusable
 * without authDomain + appId. If these four are inlined, the whole
 * `firebaseConfig` object literal is — they are compiled from adjacent lines of
 * the same object.
 */
const REQUIRED = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

/**
 * Reported but not enforced. Each is genuinely used by the app, but a miss here
 * is not on its own a broken sign-in, and some are short/numeric enough that
 * insisting on them invites a confusing failure rather than a useful one.
 */
const REPORTED = [
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_SITE_URL',
];

const staticDir = process.argv[2] || 'apps/web/.next/static';

const emptyRequired = REQUIRED.filter((name) => !process.env[name]);
if (emptyRequired.length > 0) {
  console.error(
    `verify-public-env: these are empty in the build environment: ${emptyRequired.join(', ')}\n` +
      'There is nothing to look for in the bundle. Pass them as --build-arg to `docker build`;\n' +
      'setting them on the ECS task or at `docker run` time has no effect on a Next.js client bundle.',
  );
  process.exit(2);
}

if (!fs.existsSync(staticDir)) {
  console.error(
    `verify-public-env: no such directory: ${staticDir}\n` +
      'In the builder stage this must exist after `next build`; in the runtime image it is\n' +
      'produced by `COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static`.',
  );
  process.exit(3);
}

/** Every file under `dir`, recursively. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const files = walk(staticDir);

/**
 * latin1, not utf8: these chunks are minified JavaScript that can contain lone
 * surrogates and other byte sequences that are not valid UTF-8. utf8 decoding
 * replaces them with U+FFFD, which can corrupt a match. latin1 is a lossless
 * byte→char mapping, and every value being searched for is ASCII.
 *
 * `String.includes`, not a regex: these values contain `.`, `-`, `:` and `/`,
 * all of which are regex metacharacters or would need escaping. A literal
 * substring search cannot silently match the wrong thing.
 */
const contents = files.map((file) => fs.readFileSync(file, 'latin1'));

function countHits(name) {
  const needle = process.env[name];
  if (!needle) return null;
  return contents.reduce((n, text) => (text.includes(needle) ? n + 1 : n), 0);
}

console.log(`verify-public-env: scanned ${files.length} files under ${staticDir}`);

const notInlined = [];
for (const name of REQUIRED) {
  const hits = countHits(name);
  console.log(`  [${hits > 0 ? 'ok  ' : 'MISS'}] ${name}: found in ${hits} file(s)`);
  if (hits === 0) notInlined.push(name);
}
for (const name of REPORTED) {
  const hits = countHits(name);
  console.log(`  [info] ${name}: ${hits === null ? 'not set' : `found in ${hits} file(s)`}`);
}

if (notInlined.length > 0) {
  console.error(
    `\nverify-public-env: NOT inlined into the client bundle: ${notInlined.join(', ')}\n` +
      'The values were present in the environment but do not appear in any emitted chunk, so the\n' +
      'browser will log "[firebase] NOT INITIALISED" and every Firestore/Storage call will fail\n' +
      'without issuing a network request. Refusing to produce this image.',
  );
  process.exit(1);
}

console.log('verify-public-env: OK — Firebase config is inlined in the client bundle.');
