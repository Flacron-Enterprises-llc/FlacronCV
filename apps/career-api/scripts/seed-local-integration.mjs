#!/usr/bin/env node
/**
 * LOCAL INTEGRATION DEMO ONLY. Creates fictional accounts in the Firebase
 * emulators (V1 identity, users/{uid}, a few V1 Jobs-tracker entries) and a
 * little career data through the running career API.
 *
 * Refuses to run unless every target is local:
 *   - FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST are set,
 *   - FIREBASE_PROJECT_ID starts with demo-,
 *   - DATABASE_URL (from .env.career) points at localhost / 127.0.0.1.
 *
 * Passwords are generated per run and written only to SEED_CREDENTIALS_FILE
 * (must be outside the repository). Nothing is printed except emails and uids.
 *
 *   node apps/career-api/scripts/seed-local-integration.mjs
 */
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const { Client } = require('pg');

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');

// .env.career supplies DATABASE_URL, emulator hosts and the project id; the shell wins.
const envFile = join(repo, '.env.career');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

function refuse(message) {
  console.error(`Refusing to seed: ${message}`);
  process.exit(1);
}

const project = process.env.FIREBASE_PROJECT_ID ?? '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const databaseUrl = process.env.DATABASE_URL ?? '';
const careerApi = process.env.SEED_CAREER_API ?? 'http://127.0.0.1:4101/api/career/v1';
const credentialsFile = process.env.SEED_CREDENTIALS_FILE ?? '';

if (!authHost || !firestoreHost) refuse('both Firebase emulator hosts must be set');
if (!project.startsWith('demo-')) refuse('FIREBASE_PROJECT_ID must start with demo-');
try {
  if (!['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) refuse('DATABASE_URL must be local');
} catch {
  refuse('DATABASE_URL is missing or invalid');
}
if (!credentialsFile) refuse('set SEED_CREDENTIALS_FILE to a path outside the repository');
if (resolve(credentialsFile).toLowerCase().startsWith(repo.toLowerCase())) refuse('SEED_CREDENTIALS_FILE must be outside the repository');
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

admin.initializeApp({ projectId: project });
const auth = admin.auth();
const db = admin.firestore();

/**
 * careerFixture: a career entitlement GRANTED BY THIS SEED for the local demo
 * (users/{uid}.careerSubscription with source 'local_fixture'). It is not a
 * purchase and is labelled as such everywhere it is shown.
 */
const ACCOUNTS = [
  { key: 'pro', email: 'demo.pro@example.test', name: 'Ada Example', plan: 'pro', role: 'user', careerFixture: null, note: 'existing V1 Pro customer, no career plan' },
  { key: 'career', email: 'demo.career@example.test', name: 'Dee Example', plan: 'pro', role: 'user', careerFixture: 'professional', note: 'V1 Pro + LOCAL FIXTURE career Professional entitlement' },
  { key: 'free', email: 'demo.free@example.test', name: 'Bo Example', plan: 'free', role: 'user', careerFixture: null, note: 'V1 Free' },
  { key: 'admin', email: 'demo.admin@example.test', name: 'Cy Example', plan: 'enterprise', role: 'super_admin', careerFixture: null, note: 'V1 Enterprise + super_admin (career operator via allowlist)' },
  { key: 'del1', email: 'demo.delete1@example.test', name: 'Eli Example', plan: 'pro', role: 'user', careerFixture: 'professional', note: 'DISPOSABLE: for account-deletion tests' },
  { key: 'del2', email: 'demo.delete2@example.test', name: 'Fay Example', plan: 'free', role: 'user', careerFixture: null, note: 'DISPOSABLE: for account-deletion tests' },
];

const now = new Date();
const periodEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
const credentials = [];

for (const account of ACCOUNTS) {
  const password = `Demo-${randomBytes(9).toString('base64url')}`;
  let user;
  try {
    user = await auth.getUserByEmail(account.email);
    await auth.updateUser(user.uid, { password, emailVerified: true });
  } catch {
    user = await auth.createUser({ email: account.email, password, emailVerified: true, displayName: account.name });
  }
  await auth.setCustomUserClaims(user.uid, { role: account.role });
  const [first, ...rest] = account.name.split(' ');
  await db.collection('users').doc(user.uid).set(
    {
      uid: user.uid,
      email: account.email,
      displayName: account.name,
      photoURL: null,
      phoneNumber: null,
      profile: { firstName: first, lastName: rest.join(' '), headline: '', bio: '', location: '', website: '', linkedin: '', github: '' },
      preferences: { language: 'en', theme: 'system', emailNotifications: false, marketingEmails: false, defaultCVTemplate: 'modern' },
      subscription:
        account.plan === 'free'
          ? { plan: 'free', status: 'active', stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }
          : { plan: account.plan, status: 'active', stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
      usage: { cvsCreated: 0, coverLettersCreated: 0, aiCreditsUsed: 0, aiCreditsLimit: account.plan === 'free' ? 5 : 100, exportsThisMonth: 0, lastExportReset: now },
      role: account.role,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      isActive: true,
      deletedAt: null,
      careerSubscription: account.careerFixture
        ? {
            plan: account.careerFixture,
            interval: 'month',
            status: 'active',
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
            source: 'local_fixture',
            note: 'LOCAL DEMO FIXTURE granted by seed-local-integration.mjs - not a purchase',
          }
        : admin.firestore.FieldValue.delete(),
    },
    { merge: true },
  );
  account.uid = user.uid;
  account.password = password;
  credentials.push(`${account.key.padEnd(6)} ${account.email}  password: ${password}  (${account.note}; uid ${user.uid})`);
}

// V1 Jobs tracker entries and career data for the career-entitled demo account (fictional companies).
const pro = ACCOUNTS.find((account) => account.key === 'career');
const jobs = [
  ['Fictional Analytics Co', 'Data Analyst', 'applied'],
  ['Example Retail Group', 'Reporting Analyst', 'interviewing'],
  ['Sample Health Network', 'Junior Data Analyst', 'rejected'],
  ['Placeholder Logistics', 'BI Analyst', 'offer'],
  ['Demo Bank', 'Data Analyst II', 'wishlist'],
];
for (const [i, [company, position, status]] of jobs.entries()) {
  const id = `demo-job-${i + 1}`;
  await db.collection('job_applications').doc(id).set({
    id, userId: pro.uid, company, position, jobUrl: '', location: 'Montreal, QC', status,
    appliedDate: status === 'wishlist' ? null : '2026-10-1' + i, notes: 'Fictional demo entry.',
    linkedCVId: null, linkedCoverLetterId: null, salaryRange: '', contactName: '', contactEmail: '',
    interviewDate: null, followUpDate: null, archived: false, createdAt: now, updatedAt: now, deletedAt: null,
  });
}

// Career feature switches for the local demo only (V2 phases 2-4 are off without a row).
const pg = new Client({ connectionString: databaseUrl });
await pg.connect();
const flags = [
  'actionPacks', 'skillReports', 'evidenceItems', 'portfolioPages', 'portfolioAnalytics', 'projectBriefInSkillReport',
  'specialistModes', 'voiceMinutes', 'scenarioReports', 'applicationAnalytics', 'assistedForms', 'mapSessions',
  'staffSeats', 'activeCandidates',
];
for (const feature of flags) {
  await pg.query(
    `INSERT INTO feature_flags (feature, enabled, updated_by) VALUES ($1, true, 'local-integration-seed')
     ON CONFLICT (feature) DO UPDATE SET enabled = true, updated_by = 'local-integration-seed', updated_at = now()`,
    [feature],
  );
}
await pg.end();

// A little career data for the Pro account, through the career API with its own token.
async function idToken(email, password) {
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`emulator sign-in failed (${res.status})`);
  return (await res.json()).idToken;
}

const token = await idToken(pro.email, pro.password);
async function call(method, path, body) {
  const res = await fetch(`${careerApi}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const existing = await call('GET', '/facts');
if (existing.items.length === 0) {
  const facts = [
    ['contact', { fullName: 'Ada Example', headline: 'Data analyst', email: 'demo.pro@example.test', city: 'Montreal', country: 'Canada' }],
    ['summary', { text: 'Data analyst with three years of reporting and SQL work in fictional retail and health settings.' }],
    ['experience', { position: 'Reporting Analyst', company: 'Fictional Retail Co', location: 'Montreal, QC', startDate: '2023-02', current: true, responsibilities: 'Built weekly sales dashboards. Wrote SQL for the finance team.' }],
    ['experience', { position: 'Junior Analyst', company: 'Example Clinic Group', startDate: '2021-06', endDate: '2023-01', responsibilities: 'Cleaned appointment data and prepared monthly reports.' }],
    ['education', { institution: 'Sample University', degree: 'BSc', field: 'Statistics', startDate: '2017-09', endDate: '2021-05' }],
    ['skill', { name: 'SQL', category: 'Data' }],
    ['skill', { name: 'Power BI', category: 'Reporting' }],
    ['language', { name: 'French', proficiency: 'Professional' }],
  ];
  for (const [factType, value] of facts) {
    const fact = await call('POST', '/facts', { factType, value });
    await call('POST', `/facts/${fact.id}/confirm`);
  }
  await call('POST', '/opportunities', {
    text: 'Data Analyst - Fictional Analytics Co (Montreal, hybrid)\nWe are looking for a data analyst with SQL and Power BI experience to build reporting for our operations team. Bachelor degree in a quantitative field. French and English.',
  });
}

writeFileSync(
  credentialsFile,
  [
    '# FlacronCV local integration demo accounts (Firebase Auth EMULATOR only, fictional people).',
    `# Generated ${now.toISOString()}. Re-running the seed rotates these passwords.`,
    ...credentials,
    '',
  ].join('\n'),
);

console.log('Seeded local demo accounts:');
for (const account of ACCOUNTS) console.log(`  ${account.email}  uid ${account.uid}  (V1 plan ${account.plan})`);
console.log(`Credentials written to ${credentialsFile}`);
process.exit(0);
