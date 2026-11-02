import { readFileSync } from 'fs';
import { join } from 'path';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { V1Migration } from './migration.service';
import { v1Instant } from './v1-time';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fixture(): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', 'v1-ada.json'), 'utf8'));
}

function retitle(value: unknown): unknown {
  const copy: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(copy) || !Array.isArray(copy.cvs) || !isRecord(copy.cvs[0])) return copy;
  copy.cvs[0].title = 'Changed after the first apply';
  return copy;
}

describe('V1Migration', () => {
  let db: TestDatabase;
  let migration: V1Migration;

  beforeAll(async () => {
    db = await createTestDatabase('migrate-v1');
    migration = new V1Migration(db.pool);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  it('converts a Firestore timestamp without passing the object to Date', () => {
    expect(v1Instant({ seconds: 1760630400, nanoseconds: 0 })).toBe('2025-10-16T16:00:00.000Z');
    expect(v1Instant('2026-10-01')).toBe('2026-10-01');
  });

  it('dry-runs, applies once, and leaves the first rows alone', async () => {
    const source = fixture();
    const preview = await migration.dryRun(source);
    expect(preview.mode).toBe('dry-run');
    expect(preview.counts.find((row) => row.collection === 'users')).toMatchObject({ source: 2, written: 2, skipped: 0 });
    expect(preview.counts.find((row) => row.collection === 'cover_letters')).toMatchObject({ source: 1, written: 1 });
    const before = await db.pool.query(`SELECT 1 FROM users`);
    expect(before.rowCount).toBe(0);

    const applied = await migration.apply(source);
    expect(applied.counts.every((row) => row.written === row.source && row.skipped === 0)).toBe(true);
    const check = await migration.countCheck(source);
    expect(check.ok).toBe(true);

    const ada = await db.pool.query<{ locale: string; settings: { v1Language?: string; aiCreditsUsed?: number }; created_at: Date }>(
      `SELECT locale, settings, created_at FROM users WHERE auth_user_id = 'ada'`,
    );
    expect(ada.rows[0].locale).toBe('en');
    expect(ada.rows[0].settings.v1Language).toBe('es');
    expect(ada.rows[0].settings.aiCreditsUsed).toBeUndefined();
    expect(ada.rows[0].created_at.toISOString()).toBe('2025-10-16T16:00:00.000Z');
    const gone = await db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = 'gone'`);
    expect(gone.rowCount).toBe(0);

    const letter = await db.pool.query<{ document_type: string; fact_ids: string[]; body: string }>(
      `SELECT document_type, fact_ids, body FROM writing_documents`,
    );
    expect(letter.rows).toHaveLength(1);
    expect(letter.rows[0].document_type).toBe('cover_letter');
    expect(letter.rows[0].fact_ids).toEqual([]);
    expect(letter.rows[0].body).toBe('I wrote notes on the engine.');
    const ledger = await db.pool.query(`SELECT 1 FROM usage_ledger`);
    expect(ledger.rowCount).toBe(0);

    const bea = await db.pool.query<{ plan_id: string; legacy_plan: string; origin: string; provider: string; catalog_version: string; has_used_trial: boolean }>(
      `SELECT plan_id, legacy_plan, origin, provider, catalog_version, has_used_trial FROM billing_accounts WHERE auth_user_id = 'bea'`,
    );
    expect(bea.rows[0]).toMatchObject({
      plan_id: 'legacy_pro',
      legacy_plan: 'pro',
      origin: 'migrated',
      provider: 'stripe',
      catalog_version: 'legacy-v1',
      has_used_trial: true,
    });
    const adaPlan = await db.pool.query<{ plan_id: string; provider: string | null }>(
      `SELECT plan_id, provider FROM billing_accounts WHERE auth_user_id = 'ada'`,
    );
    expect(adaPlan.rows[0]).toMatchObject({ plan_id: 'free', provider: null });
    const legal = await db.pool.query<{ auth_user_id: string }>(`SELECT auth_user_id FROM legal_acceptances`);
    expect(legal.rows.map((row) => row.auth_user_id)).toEqual(['bea']);
    const application = await db.pool.query<{ status: string; notes: string }>(`SELECT status, notes FROM applications`);
    expect(application.rows[0]).toMatchObject({ status: 'offered', notes: 'V1 status: accepted' });
    const fact = await db.pool.query<{ confirmation: string; uncertain: { startDate?: { raw: string } } }>(
      `SELECT confirmation, uncertain FROM career_facts WHERE fact_type = 'experience'`,
    );
    expect(fact.rows[0].confirmation).toBe('draft');
    expect(fact.rows[0].uncertain.startDate?.raw).toBe('2020-01');

    const again = await migration.apply(retitle(source));
    expect(again.counts.every((row) => row.written === 0 && row.skipped === row.source)).toBe(true);
    const title = await db.pool.query<{ title: string }>(`SELECT title FROM resumes`);
    expect(title.rows.map((row) => row.title)).toEqual(['Ada CV']);
    const opportunities = await db.pool.query(`SELECT 1 FROM opportunities`);
    expect(opportunities.rowCount).toBe(1);

    await db.pool.query(`UPDATE applications SET letter_version_id = NULL`);
    await db.pool.query(`DELETE FROM writing_documents`);
    const mismatch = await migration.countCheck(source);
    expect(mismatch.ok).toBe(false);
    expect(mismatch.rows.find((row) => row.collection === 'cover_letters')).toMatchObject({ source: 1, destination: 0 });
  });
});
