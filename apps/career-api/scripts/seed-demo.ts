import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { LEGAL_VERSIONS } from '@flacroncv/career-shared';
import { BillingService, findRepoRoot, isLocalDatabaseUrl, loadRepoEnv } from '@flacroncv/career-server';

/**
 * Prepares the fictional client-demo account on the LOCAL stack only: the Auth emulator, the
 * local V2 database and the running local API (http://127.0.0.1:4001). Everything goes through
 * the real API except two steps that have no user-facing path without a live provider:
 *   - Starter is opened with BillingService.startSubscription, the same call a verified payment
 *     makes (it regrants the period's credits; plan_id is never edited directly);
 *   - one cover letter is inserted, titled as demonstration data, because letters are otherwise
 *     written only by the AI provider. It is never presented as AI output.
 * The email and a generated password are kept in the ignored `.data/demo-account.txt`.
 * Re-running reuses the account and skips anything that already exists.
 */

const API = process.env.DEMO_API_URL ?? 'http://127.0.0.1:4001/api/v1';
const EMAIL = 'ada.review.demo@example.test';
const LETTER_TITLE = 'Cover letter — Harbourfront Learning Room (sample, demonstration data)';

function refuse(message: string): never {
  console.error(`seed-demo refused: ${message}`);
  process.exit(1);
}

function credentials(root: string): { email: string; password: string; file: string } {
  const dir = join(root, '.data');
  const file = join(dir, 'demo-account.txt');
  if (existsSync(file)) {
    const text = readFileSync(file, 'utf8');
    const password = /^password: (.+)$/m.exec(text)?.[1]?.trim();
    if (password) return { email: EMAIL, password, file };
  }
  mkdirSync(dir, { recursive: true });
  const password = `Demo-${randomBytes(9).toString('base64url')}1`;
  writeFileSync(
    file,
    [
      'FlacronCV V2 local client-demo account (Auth emulator only; fictional; not a real customer).',
      'Do not commit, share publicly or reuse this password anywhere else.',
      `email: ${EMAIL}`,
      `password: ${password}`,
      'sign in: http://localhost:3001/en/sign-in',
      '',
    ].join('\n'),
  );
  return { email: EMAIL, password, file };
}

async function emulator(path: string, body: unknown): Promise<any> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST!;
  const res = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/${path}?key=demo-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function signIn(email: string, password: string): Promise<{ idToken: string; localId: string }> {
  let out = await emulator('accounts:signInWithPassword', { email, password, returnSecureToken: true });
  if (!out.idToken) out = await emulator('accounts:signUp', { email, password, returnSecureToken: true });
  if (!out.idToken) refuse(`emulator sign-in failed (${out.error?.message ?? 'unknown'})`);
  return out;
}

function client(token: string) {
  return async (method: string, path: string, body?: unknown): Promise<any> => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : null;
    if (!res.ok) refuse(`${method} ${path} returned ${res.status} ${parsed?.code ?? ''} ${parsed?.reason ?? ''}`);
    return parsed;
  };
}

const FACTS: Array<{ factType: string; value: Record<string, unknown> }> = [
  {
    factType: 'contact',
    value: {
      fullName: 'Ada Review',
      headline: 'Library programme coordinator (fictional demo profile)',
      email: EMAIL,
      phone: '+1 514 555 0142',
      city: 'Montréal',
      country: 'Canada',
    },
  },
  {
    factType: 'summary',
    value: {
      text: 'Library programme coordinator with five years of community learning programmes, cataloguing and bilingual (English/French) public service. Fictional profile prepared for a product demonstration.',
    },
  },
  {
    factType: 'experience',
    value: {
      position: 'Programme coordinator',
      company: 'Northbridge Civic Library',
      location: 'Montréal, QC',
      startDate: '2021-01',
      endDate: '2024-06',
      current: false,
      responsibilities:
        'Coordinated weekly reading and digital-skills workshops for adults and teens.\nCatalogued new French and English acquisitions and kept records accurate.\nTrained six volunteers on the circulation desk.',
    },
  },
  {
    factType: 'experience',
    value: {
      position: 'Library assistant',
      company: 'Rivermount Public Library',
      location: 'Laval, QC',
      startDate: '2018-09',
      endDate: '2020-12',
      current: false,
      responsibilities: 'Helped visitors find resources, processed returns and prepared displays.',
    },
  },
  {
    factType: 'education',
    value: {
      institution: 'Université de Montréal',
      degree: 'Master of Information Science',
      field: 'Library and information science',
      location: 'Montréal, QC',
      startDate: '2016-09',
      endDate: '2018-06',
    },
  },
  { factType: 'skill', value: { name: 'Cataloguing', category: 'Library' } },
  { factType: 'skill', value: { name: 'Workshop facilitation', category: 'Programmes' } },
  { factType: 'skill', value: { name: 'Volunteer training', category: 'Programmes' } },
  { factType: 'language', value: { name: 'French', proficiency: 'Native' } },
  { factType: 'language', value: { name: 'English', proficiency: 'Fluent' } },
];

const LISTING = [
  'Learning Room Coordinator — Harbourfront Learning Room (fictional sample listing for a demo)',
  'Location: Montréal, QC. Full time.',
  'Harbourfront Learning Room runs free reading and digital-skills sessions for adults.',
  'You will plan weekly workshops, keep the catalogue tidy and train volunteers.',
  'Bilingual English/French service is required. Library or community programme experience is an asset.',
].join('\n');

const LETTER = [
  'Dear Harbourfront Learning Room hiring team,',
  '',
  'I am applying for the Learning Room Coordinator role. From 2021 to 2024 I was the programme coordinator at Northbridge Civic Library, where I ran weekly reading and digital-skills workshops for adults and teens, catalogued new French and English acquisitions, and trained six volunteers on the circulation desk.',
  '',
  'Your sessions for adult learners match the work I enjoyed most at Northbridge. I would bring the same planning habits, careful cataloguing and bilingual service to Harbourfront, and I would be glad to help your volunteers feel confident from their first shift.',
  '',
  'Thank you for considering my application. I would welcome a conversation about the role.',
  '',
  'Sincerely,',
  'Ada Review',
].join('\n');

async function main(): Promise<void> {
  loadRepoEnv(__dirname);
  const root = findRepoRoot(__dirname) ?? refuse('repository root not found');
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  if (process.env.NODE_ENV === 'production') refuse('NODE_ENV is production');
  if (!isLocalDatabaseUrl(databaseUrl)) refuse('DATABASE_URL host must be localhost or 127.0.0.1');
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) refuse('FIREBASE_AUTH_EMULATOR_HOST is not set (Auth emulator only)');
  if (!process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')) refuse('FIREBASE_PROJECT_ID must be a demo-* emulator project');
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API)) refuse('the API must be the local one');

  const creds = credentials(root);
  const user = await signIn(creds.email, creds.password);
  const call = client(user.idToken);
  await call('POST', '/session', { idToken: user.idToken, locale: 'en' });
  await call('POST', '/legal-acceptances', {
    termsAccepted: true,
    privacyAccepted: true,
    disclaimerAccepted: true,
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    disclaimerVersion: LEGAL_VERSIONS.disclaimer,
  });

  const existing: any[] = (await call('GET', '/facts')).items ?? [];
  const key = (type: string, value: Record<string, unknown>) =>
    `${type}:${value.fullName ?? value.company ?? value.institution ?? value.name ?? 'summary'}`;
  const have = new Set(existing.map((fact) => key(fact.factType, fact.value)));
  for (const fact of FACTS) {
    if (have.has(key(fact.factType, fact.value))) continue;
    const created = await call('POST', '/facts', fact);
    await call('POST', `/facts/${created.id}/confirm`);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const account = await pool.query<{ id: string; plan_id: string; catalog_version: string }>(
      `SELECT id, plan_id, catalog_version FROM billing_accounts WHERE auth_user_id = $1`,
      [user.localId],
    );
    const row = account.rows[0] ?? refuse('billing account was not created by the session');
    if (row.plan_id === 'free') {
      // The path a verified Stripe payment takes; providerSubscriptionId marks it as a local demo grant.
      await new BillingService(pool).startSubscription(row.id, {
        planId: 'starter',
        interval: 'monthly',
        provider: 'stripe',
        providerSubscriptionId: 'local-demo-no-payment',
        periodStart: new Date(),
        catalogVersion: row.catalog_version,
      });
    }

    const resumes: any[] = (await call('GET', '/resumes')).items ?? [];
    let resume = resumes.find((item) => item.title === 'Ada Review — Harbourfront (fictional)');
    if (!resume) {
      resume = await call('POST', '/resumes', {
        title: 'Ada Review — Harbourfront (fictional)',
        language: 'en',
        templateId: 'professional',
      });
    }
    const opened = await call('GET', `/resumes/${resume.id}`);

    const listings: any[] = (await call('GET', '/opportunities')).items ?? [];
    let listing = listings.find((item) => String(item.title ?? '').includes('Harbourfront'));
    if (!listing) listing = await call('POST', '/opportunities', { text: LISTING });

    const owner = await pool.query<{ workspace_id: string }>(
      `SELECT workspace_id FROM billing_accounts WHERE auth_user_id = $1`,
      [user.localId],
    );
    const facts: any[] = (await call('GET', '/facts')).items ?? [];
    const letterFactIds = facts
      .filter((fact) => ['contact', 'experience', 'skill'].includes(fact.factType) && fact.confirmation === 'confirmed')
      .map((fact) => fact.id);
    let letter = (
      await pool.query<{ id: string }>(
        `SELECT id FROM writing_documents WHERE candidate_auth_user_id = $1 AND title = $2`,
        [user.localId, LETTER_TITLE],
      )
    ).rows[0];
    if (!letter) {
      letter = (
        await pool.query<{ id: string }>(
          `INSERT INTO writing_documents
             (workspace_id, candidate_auth_user_id, document_type, title, body, fact_ids, linked_resume_id, template_id)
           VALUES ($1, $2, 'cover_letter', $3, $4, $5::uuid[], $6, 'classic')
           RETURNING id`,
          [owner.rows[0].workspace_id, user.localId, LETTER_TITLE, LETTER, letterFactIds, resume.id],
        )
      ).rows[0];
    }

    const applications: any[] = (await call('GET', '/applications')).items ?? [];
    if (!applications.some((item) => item.opportunityId === listing.id)) {
      const application = await call('POST', '/applications', {
        opportunityId: listing.id,
        resumeVersionId: opened.version.id,
      });
      await call('PATCH', `/applications/${application.id}`, {
        status: 'applied',
        letterId: letter.id,
        notes: 'Demonstration data: fictional listing and application. Nothing was sent to an employer.',
        dates: { applied: '2026-10-20', deadline: '2026-11-15' },
        checklist: [
          { label: 'Tailor CV to the listing', done: true },
          { label: 'Attach cover letter', done: true },
          { label: 'Prepare workshop example for interview', done: false },
        ],
      });
    }
  } finally {
    await pool.end();
  }

  console.log(`seed-demo: ready. Sign-in details are in ${creds.file} (not printed).`);
}

main().catch((error) => {
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
  console.error(`seed-demo failed: ${error instanceof Error ? error.message : String(error)}${cause}`);
  process.exit(1);
});
