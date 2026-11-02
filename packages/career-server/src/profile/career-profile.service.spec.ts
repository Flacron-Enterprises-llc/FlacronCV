import { CATALOG_VERSION, DAILY_IMPORT_LIMIT, MAX_FACTS_PER_CANDIDATE } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { TestClock } from '../testing/billing-fixture';
import { FakeTextModel } from '../testing/fake-ai';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { CareerProfileService } from './career-profile.service';
import { RESUME_IMPORT_TEMPLATE } from './resume-import';

const RESUME = `Ada Lovelace
ada@example.test
Analyst, Babbage & Co, 2019-04 to 2022
Increased throughput by 25%.
Skills: SQL`;

const PARSED = JSON.stringify({
  contact: { fullName: 'Ada Lovelace', email: 'ada@example.test' },
  experience: [
    {
      position: 'Analyst',
      company: 'Babbage & Co',
      startDate: '2019-04',
      endDate: '2022',
      achievements: ['Increased throughput by 25%.'],
    },
  ],
  education: [{ institution: 'University of London', startDate: 'autumn 1835' }],
  skills: ['SQL'],
});

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a failure');
    },
    (error: unknown) => error,
  );
}

describe('CareerProfileService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let model: FakeTextModel;
  let profiles: CareerProfileService;

  beforeAll(async () => {
    db = await createTestDatabase('profile');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  beforeEach(() => {
    model = new FakeTextModel();
    profiles = new CareerProfileService(db.pool, model, clock);
    clock.set('2026-10-16T09:00:00Z');
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  async function ledgerRows(p: Principal): Promise<number> {
    const res = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1`,
      [p.billingAccountId],
    );
    return res.rows[0].n;
  }

  describe('manual facts', () => {
    it('creates a draft by default and records the first revision', async () => {
      const p = await person('facts-draft');
      const fact = await profiles.createFact(p, { factType: 'experience', value: { company: 'Acme' } });
      expect(fact).toMatchObject({ confirmation: 'draft', source: 'manual', revision: 1, missingFields: ['position'] });
      expect(await profiles.history(p, fact.id)).toEqual([
        expect.objectContaining({ revision: 1, change: 'created', confirmation: 'draft' }),
      ]);
      expect(await ledgerRows(p)).toBe(0);
    });

    it('takes a manual fact already confirmed only when it is complete', async () => {
      const p = await person('facts-confirmed');
      const incomplete = await failure(
        profiles.createFact(p, { factType: 'experience', value: { company: 'Acme' }, confirmation: 'confirmed' }),
      );
      expect(isBillingError(incomplete, 'validation_error')).toBe(true);
      const fact = await profiles.createFact(p, {
        factType: 'skill',
        value: { name: 'SQL' },
        confirmation: 'confirmed',
      });
      expect(fact.confirmation).toBe('confirmed');
      expect(fact.confirmedAt).not.toBeNull();
    });

    it('keeps a pasted fact as a draft and refuses import or migrated as a client source', async () => {
      const p = await person('facts-sources');
      const pasted = await failure(
        profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, source: 'paste', confirmation: 'confirmed' }),
      );
      expect(isBillingError(pasted, 'validation_error')).toBe(true);
      for (const source of ['import', 'migrated']) {
        const error = await failure(profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, source }));
        expect(isBillingError(error, 'validation_error')).toBe(true);
      }
    });

    it('edits only the fields sent, and a confirmed fact must stay complete', async () => {
      const p = await person('facts-edit');
      const fact = await profiles.createFact(p, {
        factType: 'experience',
        value: { company: 'Acme', position: 'Analyst', startDate: '2020' },
        confirmation: 'confirmed',
      });
      const edited = await profiles.updateFact(p, fact.id, { location: 'Paris' });
      expect(edited.value).toMatchObject({ company: 'Acme', position: 'Analyst', startDate: '2020', location: 'Paris' });
      expect(edited).toMatchObject({ confirmation: 'confirmed', revision: 2 });
      const cleared = await failure(profiles.updateFact(p, fact.id, { position: null }));
      expect(isBillingError(cleared, 'validation_error')).toBe(true);
      const unchanged = await profiles.updateFact(p, fact.id, { location: 'Paris' });
      expect(unchanged.revision).toBe(2);
    });

    it('refuses a malformed date instead of storing it', async () => {
      const p = await person('facts-dates');
      const error = await failure(profiles.createFact(p, { factType: 'education', value: { startDate: '09/2019' } }));
      expect(isBillingError(error, 'validation_error')).toBe(true);
      if (isBillingError(error)) expect(error.details.errors).toEqual([{ field: 'startDate', reason: 'invalid_date' }]);
    });

    it("answers permission_denied for someone else's fact and not_found for none", async () => {
      const owner = await person('facts-owner');
      const other = await person('facts-other');
      const fact = await profiles.createFact(owner, { factType: 'skill', value: { name: 'Go' } });
      const attempts: Array<() => Promise<unknown>> = [
        () => profiles.getFact(other, fact.id),
        () => profiles.updateFact(other, fact.id, { name: 'Rust' }),
        () => profiles.confirmFact(other, fact.id),
        () => profiles.deleteFact(other, fact.id),
      ];
      for (const attempt of attempts) {
        expect(isBillingError(await failure(attempt()), 'permission_denied')).toBe(true);
      }
      expect(isBillingError(await failure(profiles.getFact(other, 'not-a-uuid')), 'not_found')).toBe(true);
      expect(isBillingError(await failure(profiles.getFact(other, '00000000-0000-4000-8000-000000000000')), 'not_found')).toBe(
        true,
      );
      expect((await profiles.getFact(owner, fact.id)).value.name).toBe('Go');
      expect((await profiles.listFacts(other)).items).toEqual([]);
    });

    it('links an achievement only to a role of the same person, and unlinks it when the role goes', async () => {
      const p = await person('facts-links');
      const other = await person('facts-links-other');
      const role = await profiles.createFact(p, { factType: 'experience', value: { company: 'Acme', position: 'Lead' } });
      const foreign = await profiles.createFact(other, { factType: 'experience', value: { company: 'X', position: 'Y' } });
      const skill = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' } });
      for (const target of [foreign.id, skill.id]) {
        const error = await failure(
          profiles.createFact(p, { factType: 'achievement', value: { statement: 'Did it', experienceFactId: target } }),
        );
        expect(isBillingError(error, 'validation_error')).toBe(true);
      }
      const achievement = await profiles.createFact(p, {
        factType: 'achievement',
        value: { statement: 'Shipped v2', experienceFactId: role.id },
      });
      await profiles.deleteFact(p, role.id);
      const after = await profiles.getFact(p, achievement.id);
      expect(after.value.experienceFactId).toBeNull();
      expect(after.revision).toBe(2);
      expect(isBillingError(await failure(profiles.history(p, role.id)), 'not_found')).toBe(true);
    });

    it('moves the profile version on every change and not on a read', async () => {
      const p = await person('facts-version');
      expect((await profiles.profile(p)).version).toBe(0);
      const fact = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' } });
      await profiles.confirmFact(p, fact.id);
      await profiles.listFacts(p);
      const view = await profiles.profile(p);
      expect(view.version).toBe(2);
      expect(view.counts).toMatchObject({ confirmed: 1, draft: 0 });
    });

    it('stops at the per-person ceiling', async () => {
      const p = await person('facts-ceiling');
      await db.pool.query(
        `INSERT INTO career_facts (workspace_id, candidate_auth_user_id, fact_type, value, source, confirmation)
         SELECT $1, $2, 'skill', jsonb_build_object('name', 'S' || g), 'manual', 'draft'
           FROM generate_series(1, $3::int) AS g`,
        [p.workspaceId, p.authUserId, MAX_FACTS_PER_CANDIDATE],
      );
      const error = await failure(profiles.createFact(p, { factType: 'skill', value: { name: 'One more' } }));
      expect(isBillingError(error, 'validation_error')).toBe(true);
      if (isBillingError(error)) expect(error.details.reason).toBe('too_many_facts');
    });
  });

  describe('preferences', () => {
    it('replaces the whole object and keeps defaults for keys left out', async () => {
      const p = await person('prefs');
      await profiles.setPreferences(p, { targetRoles: ['Data analyst'], arrangements: ['remote'] });
      const view = await profiles.setPreferences(p, {
        targetRoles: ['Data engineer'],
        minimumPay: { amount: 60000, currency: 'EUR', period: 'year' },
      });
      expect(view.preferences).toMatchObject({
        targetRoles: ['Data engineer'],
        arrangements: [],
        minimumPay: { amount: 60000, currency: 'EUR', period: 'year' },
      });
      expect(view.version).toBe(2);
      const error = await failure(profiles.setPreferences(p, { seniority: 'wizard' }));
      expect(isBillingError(error, 'validation_error')).toBe(true);
    });
  });

  describe('import', () => {
    it('saves draft facts with flags, links achievements to the role, and counts one import', async () => {
      const p = await person('import-ok');
      model.once(RESUME_IMPORT_TEMPLATE, PARSED);
      const result = await profiles.importResume(p, { text: RESUME, fileName: 'ada.pdf', format: 'pdf' });

      expect(result.facts.every((f) => f.confirmation === 'draft' && f.source === 'import')).toBe(true);
      const role = result.facts.find((f) => f.factType === 'experience');
      const achievement = result.facts.find((f) => f.factType === 'achievement');
      expect(achievement?.value.experienceFactId).toBe(role?.id);
      const school = result.facts.find((f) => f.factType === 'education');
      expect(school?.uncertain).toEqual({
        institution: { reason: 'not_found_in_source' },
        startDate: { reason: 'unparsed_date', raw: 'autumn 1835' },
      });
      expect(result.missing).toEqual(['summary']);
      expect(result.importsRemaining).toBe(DAILY_IMPORT_LIMIT - 1);
      expect(result.resetsAt.toISOString()).toBe('2026-10-17T00:00:00.000Z');
      expect(await ledgerRows(p)).toBe(0);

      const stored = await db.pool.query(
        `SELECT file_name, format, char_count, provider, prompt_template_version, fact_count FROM resume_imports WHERE id = $1`,
        [result.importId],
      );
      expect(stored.rows[0]).toMatchObject({
        file_name: 'ada.pdf',
        format: 'pdf',
        char_count: RESUME.length,
        provider: 'fake',
        prompt_template_version: 'resume-import@1',
        fact_count: result.facts.length,
      });
      expect(JSON.stringify(stored.rows[0])).not.toContain('Lovelace');
    });

    it('confirming an imported fact clears its flags', async () => {
      const p = await person('import-confirm');
      model.once(RESUME_IMPORT_TEMPLATE, PARSED);
      const result = await profiles.importResume(p, { text: RESUME });
      const school = result.facts.find((f) => f.factType === 'education');
      if (!school) throw new Error('no education fact');
      const edited = await profiles.updateFact(p, school.id, { startDate: '2015' });
      expect(edited.uncertain).toEqual({ institution: { reason: 'not_found_in_source' } });
      const confirmed = await profiles.confirmFact(p, school.id);
      expect(confirmed).toMatchObject({ confirmation: 'confirmed', uncertain: {} });
      expect((await profiles.history(p, school.id)).map((r) => r.change)).toEqual(['created', 'edited', 'confirmed']);
    });

    it('does not count a failed, timed-out, or unusable import and saves nothing', async () => {
      const p = await person('import-fail');
      model.once(RESUME_IMPORT_TEMPLATE, new Error('down'));
      model.once(RESUME_IMPORT_TEMPLATE, 'not json');
      for (let i = 0; i < 2; i += 1) {
        const error = await failure(profiles.importResume(p, { text: RESUME }));
        expect(isBillingError(error, 'provider_unavailable')).toBe(true);
      }
      expect(await profiles.importAllowance(p)).toMatchObject({ used: 0, pending: 0, remaining: DAILY_IMPORT_LIMIT });
      expect((await profiles.listFacts(p)).items).toEqual([]);
    });

    it('refuses empty or oversized text without calling the model or counting', async () => {
      const p = await person('import-invalid');
      for (const input of [{ text: '   ' }, { text: 'x'.repeat(100_001) }, { text: RESUME, format: 'odt' }]) {
        expect(isBillingError(await failure(profiles.importResume(p, input)), 'validation_error')).toBe(true);
      }
      expect(model.calls).toHaveLength(0);
      expect((await profiles.importAllowance(p)).used).toBe(0);
    });

    it('stops at the daily limit with the number and the UTC reset, then opens the next UTC day', async () => {
      const p = await person('import-limit');
      model.always(RESUME_IMPORT_TEMPLATE, JSON.stringify({ skills: ['SQL'] }));
      await db.pool.query(`INSERT INTO import_daily_counts (auth_user_id, usage_date, count) VALUES ($1, '2026-10-16', $2)`, [
        p.authUserId,
        DAILY_IMPORT_LIMIT,
      ]);
      const error = await failure(profiles.importResume(p, { text: RESUME }));
      expect(isBillingError(error, 'import_daily_limit')).toBe(true);
      if (isBillingError(error)) {
        expect(error.details).toEqual({ limit: DAILY_IMPORT_LIMIT, used: DAILY_IMPORT_LIMIT, resetsAt: '2026-10-17T00:00:00.000Z' });
      }
      expect(model.calls).toHaveLength(0);

      clock.set('2026-10-17T00:00:01Z');
      const next = await profiles.importResume(p, { text: RESUME });
      expect(next.importsRemaining).toBe(DAILY_IMPORT_LIMIT - 1);
    });

    it('lets only the remaining slots through when imports arrive together', async () => {
      const p = await person('import-race');
      await db.pool.query(`INSERT INTO import_daily_counts (auth_user_id, usage_date, count) VALUES ($1, '2026-10-16', $2)`, [
        p.authUserId,
        DAILY_IMPORT_LIMIT - 2,
      ]);
      model.always(RESUME_IMPORT_TEMPLATE, JSON.stringify({ skills: ['SQL'] }));
      model.hold();
      const attempts = Array.from({ length: 5 }, () => profiles.importResume(p, { text: RESUME }).then(
        () => 'ok',
        (e: unknown) => (isBillingError(e) ? e.code : 'other'),
      ));
      const deadline = Date.now() + 5_000;
      let allowance = await profiles.importAllowance(p);
      while ((allowance.pending !== 2 || allowance.remaining !== 0) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        allowance = await profiles.importAllowance(p);
      }
      expect(allowance).toMatchObject({ pending: 2, remaining: 0 });
      model.release();
      const outcomes = await Promise.all(attempts);
      expect(outcomes.filter((o) => o === 'ok')).toHaveLength(2);
      expect(outcomes.filter((o) => o === 'import_daily_limit')).toHaveLength(3);
      expect(await profiles.importAllowance(p)).toMatchObject({ used: DAILY_IMPORT_LIMIT, pending: 0, remaining: 0 });
    });
  });
});
