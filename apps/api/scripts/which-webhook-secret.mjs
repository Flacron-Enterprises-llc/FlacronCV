/**
 * Which STRIPE_WEBHOOK_SECRET would the API load, and from where?
 *
 * Replicates @nestjs/config's resolution exactly, without starting Nest — so it
 * touches no Firebase, no Stripe, no network. Run it from apps/api:
 *
 *     node scripts/which-webhook-secret.mjs
 *     node scripts/which-webhook-secret.mjs whsec_the_one_stripe_listen_printed
 *
 * With the second argument it also tells you whether the CLI secret matches.
 * Never prints a secret: length, first/last 6, and a SHA-256 fingerprint only.
 *
 * The two rules being modelled (both pinned by src/config/env-load-order.spec.ts):
 *   1. ConfigModule reads `.env` from process.cwd(), not from the source dir.
 *   2. It does NOT overwrite a key already present in process.env — so an
 *      OS/shell variable silently wins over the file.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const KEY = 'STRIPE_WEBHOOK_SECRET';
const fp = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);

const describe = (label, value) => {
  if (value === undefined || value === '') {
    console.log(`  ${label.padEnd(12)} NOT SET`);
    return null;
  }
  const t = value.trim();
  const dirty = t.length !== value.length ? '  <-- HAS SURROUNDING WHITESPACE' : '';
  console.log(
    `  ${label.padEnd(12)} len=${String(t.length).padEnd(3)} ` +
      `${t.slice(0, 6)}…${t.slice(-6)}  fp=${fp(t)}${dirty}`,
  );
  return fp(t);
};

const envPath = resolve(process.cwd(), '.env');
console.log(`\ncwd   : ${process.cwd()}`);
console.log(`.env  : ${envPath} ${existsSync(envPath) ? '(exists)' : '(MISSING)'}\n`);

// ── source 1: the file ────────────────────────────────────────────────────────
let fileValue;
if (existsSync(envPath)) {
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => new RegExp(`^\\s*${KEY}\\s*=`).test(l));
  if (line) {
    fileValue = line.replace(new RegExp(`^\\s*${KEY}\\s*=`), '').trim();
    const quoted = /^(["'])([\s\S]*)\1$/.exec(fileValue);
    if (quoted) fileValue = quoted[2];
  }
}

// ── source 2: the real environment ────────────────────────────────────────────
const osValue = process.env[KEY];

console.log('sources:');
const fileFp = describe('.env', fileValue);
const osFp = describe('os/shell', osValue);

// ── precedence ────────────────────────────────────────────────────────────────
const effective = osValue !== undefined && osValue !== '' ? osValue : fileValue;
const effFp = effective ? fp(effective.trim()) : null;

console.log('\nresolution:');
if (!effective) {
  console.log('  EFFECTIVE    none — validateEnv() would throw and the API would not start');
} else if (osValue) {
  console.log(
    fileValue && fileValue.trim() === osValue.trim()
      ? '  EFFECTIVE    os/shell (identical to .env, so no conflict)'
      : '  EFFECTIVE    os/shell  <-- .env IS BEING IGNORED for this key',
  );
} else {
  console.log('  EFFECTIVE    .env');
}
if (effFp) console.log(`  fingerprint  ${effFp}`);

// ── optional comparison against the Stripe CLI secret ─────────────────────────
const cliSecret = process.argv[2];
if (cliSecret) {
  const cliFp = fp(cliSecret.trim());
  console.log(`\nstripe cli   fp=${cliFp}`);
  console.log(
    cliFp === effFp
      ? '  MATCH — the API is using the same secret the CLI printed.\n' +
        '  A signature failure therefore is NOT a secret mismatch: the events\n' +
        '  are coming from a different sender (e.g. a Dashboard endpoint, which\n' +
        '  has its own signing secret), or the body is altered in transit.'
      : '  MISMATCH — this is the cause. The API is verifying with a different\n' +
        `  secret than the sender signed with (api=${effFp}, cli=${cliFp}).`,
  );
}
console.log('');
