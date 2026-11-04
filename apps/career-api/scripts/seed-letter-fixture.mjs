#!/usr/bin/env node
/**
 * LOCAL INTEGRATION FIXTURE ONLY. Adds one clearly labelled, fictional saved
 * cover letter to an existing local career account, so the letter editor and
 * its exports can be checked in the browser without an AI provider.
 *
 * This is a fixture, not a generated letter: it is written straight into the
 * local career database (no credit is reserved or spent, nothing is
 * generated) and its title says so. Production paths are not changed.
 *
 * Refuses to run unless DATABASE_URL (from .env.career) points at localhost.
 * Idempotent: a second run leaves the existing fixture as it is.
 *
 *   node apps/career-api/scripts/seed-letter-fixture.mjs <career-auth-uid>
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const envFile = join(repo, '.env.career');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export const FIXTURE_TITLE = 'FIXTURE – Fictional cover letter (not AI-generated)';
const FIXTURE_BODY = [
  'Dear Hiring Team at Northwind Studio,',
  '',
  'This is a fictional letter used to test the career letter editor. It was not written by an AI model and does not describe a real person.',
  '',
  'I am applying for the Data Analyst role. In my previous position at Fictional Works I kept weekly reports, cleaned survey data and presented results to a team of eight. Accents for export checks: café, Zoë, Œuvre, naïve, São Paulo.',
  '',
  'Kind regards,',
  'Dee Example',
].join('\n');

const uid = process.argv[2]?.trim();
if (!uid || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) {
  console.error('Usage: seed-letter-fixture.mjs <career-auth-uid>');
  process.exit(2);
}
const url = process.env.DATABASE_URL ?? '';
let host = '';
try {
  host = new URL(url).hostname;
} catch {
  host = '';
}
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error('Refusing: DATABASE_URL must point at localhost (local integration database only).');
  process.exit(1);
}

const db = new Client({ connectionString: url });
await db.connect();
try {
  const owner = await db.query(
    `SELECT w.id AS workspace_id FROM users u JOIN workspaces w ON w.owner_user_id = u.id AND w.kind = 'individual'
      WHERE u.auth_user_id = $1 AND u.deletion_requested_at IS NULL`,
    [uid],
  );
  if (!owner.rows[0]) {
    console.error('No live career account for that uid. Sign in once as that demo account, then run again.');
    process.exit(1);
  }
  const existing = await db.query(`SELECT id FROM writing_documents WHERE candidate_auth_user_id = $1 AND title = $2`, [uid, FIXTURE_TITLE]);
  if (existing.rows[0]) {
    console.log(`Letter fixture already present: ${existing.rows[0].id}`);
  } else {
    const inserted = await db.query(
      `INSERT INTO writing_documents (workspace_id, candidate_auth_user_id, document_type, title, body, confirmation, template_id)
       VALUES ($1, $2, 'cover_letter', $3, $4, 'draft', 'classic') RETURNING id`,
      [owner.rows[0].workspace_id, uid, FIXTURE_TITLE, FIXTURE_BODY],
    );
    console.log(`Letter fixture created: ${inserted.rows[0].id}`);
  }
} finally {
  await db.end();
}
