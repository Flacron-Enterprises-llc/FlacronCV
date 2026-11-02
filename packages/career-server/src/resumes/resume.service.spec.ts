import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { CareerProfileService } from '../profile/career-profile.service';
import { TestClock } from '../testing/billing-fixture';
import { FakeTextModel } from '../testing/fake-ai';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { RESUME_COMPOSE_TEMPLATE } from './resume-compose';
import { ResumeStudioService } from './resume.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('ResumeStudioService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let profiles: CareerProfileService;
  let model: FakeTextModel;
  let resumes: ResumeStudioService;

  beforeAll(async () => {
    db = await createTestDatabase('resumes');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  beforeEach(() => {
    model = new FakeTextModel();
    profiles = new CareerProfileService(db.pool, model, clock);
    resumes = new ResumeStudioService(db.pool, model, new MeteringService(db.pool, clock));
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  async function states(p: Principal): Promise<string[]> {
    const res = await db.pool.query<{ state: string }>(
      `SELECT state FROM usage_ledger WHERE billing_account_id = $1 ORDER BY created_at`,
      [p.billingAccountId],
    );
    return res.rows.map((row) => row.state);
  }

  it('returns the stored revision on create, so the first save with it is not a false conflict', async () => {
    const p = await person('resume-first-save');
    const fact = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const created = await resumes.create(p, { title: 'Ada', language: 'en' });
    expect(created.revision).toBe((await resumes.get(p, created.id)).revision);
    const saved = await resumes.updateVersion(p, created.version.id, { lines: [{ factId: fact.id, text: 'SQL, edited' }], expectedRevision: created.revision });
    expect(saved.body.sections[0]?.lines[0]?.text).toBe('SQL, edited');
  });

  it('builds a version from facts, exports PDF, and refuses DOCX on Free', async () => {
    const p = await person('resume-free');
    const fact = await profiles.createFact(p, {
      factType: 'skill',
      value: { name: 'SQL' },
      confirmation: 'draft',
    });
    const created = await resumes.create(p, { title: 'Ada', language: 'en' });
    expect(created.version.body.confirmation).toBe('draft');
    expect(created.version.body.sections[0]?.lines[0]?.text).toBe('SQL');
    expect(created.version.versionNumber).toBe(1);

    const pdf = await resumes.exportVersion(p, created.version.id, 'pdf');
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.bytes.toString('latin1')).toContain('Prepared with FlacronCV');
    const docx = await resumes.exportVersion(p, created.version.id, 'docx').catch((error: unknown) => error);
    expect(isBillingError(docx, 'plan_upgrade_required')).toBe(true);
    if (isBillingError(docx)) expect(docx.details).toMatchObject({ feature: 'docxExport', minimumPlan: 'starter' });
    expect(await states(p)).toEqual([]);
    const check = await resumes.readability(p, created.version.id);
    expect(check.label).toBe('flacroncv_readability');
    expect(check.issues.some((issue) => issue.code === 'uncertain_line' && issue.factId === fact.id)).toBe(true);
    expect(JSON.stringify(check)).not.toContain('score');
    expect(await states(p)).toEqual([]);

    const edited = await resumes.updateVersion(p, created.version.id, {
      lines: [{ factId: fact.id, text: 'SQL, reviewed' }],
      confirmation: 'confirmed',
    });
    expect(edited.id).toBe(created.version.id);
    expect(edited.body.sections[0]?.lines[0]).toMatchObject({ text: 'SQL, reviewed', uncertain: false });
    expect(edited.body.confirmation).toBe('confirmed');
    expect(await states(p)).toEqual([]);

    const unclear = await resumes.generate(p, created.id, { instructions: 'shorter' }, 'gen-free').catch((error: unknown) => error);
    expect(isBillingError(unclear, 'validation_error')).toBe(true);
    if (isBillingError(unclear)) expect(unclear.details).toMatchObject({ field: 'facts', reason: 'need_experience_or_education' });
    await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    const blocked = await resumes.generate(p, created.id, { instructions: 'shorter' }, 'gen-free-room').catch((error: unknown) => error);
    expect(isBillingError(blocked, 'capacity_exceeded')).toBe(true);
    expect(await states(p)).toEqual([]);
  });

  it('spends one credit on a new version and ignores a sentence the model added', async () => {
    const p = await person('resume-paid');
    await new BillingService(db.pool, clock).startSubscription(p.billingAccountId, {
      planId: 'starter',
      interval: 'monthly',
      provider: 'stripe',
      providerSubscriptionId: `sub-${p.billingAccountId}`,
      periodStart: clock.now(),
      catalogVersion: CATALOG_VERSION,
    });
    const contact = await profiles.createFact(p, {
      factType: 'contact',
      value: { fullName: 'Ada Lovelace', email: 'ada@example.test', city: 'Montreal' },
      confirmation: 'confirmed',
    });
    const role = await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    const school = await profiles.createFact(p, {
      factType: 'education',
      value: { institution: 'McGill University', degree: 'BA', field: 'History', endDate: '2018' },
      confirmation: 'confirmed',
    });
    const fact = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const created = await resumes.create(p, { title: 'Ada', language: 'fr', templateId: 'classic' });
    model.always(RESUME_COMPOSE_TEMPLATE, JSON.stringify({ templateId: 'compact', factIds: [fact.id], blurb: 'FakeCo hired Ada' }));

    const first = await resumes.generate(p, created.id, {}, 'gen-1');
    expect(first.replayed).toBe(false);
    const payload = JSON.stringify(first.result);
    expect(payload).toContain('SQL');
    expect(payload).toContain('Ada Lovelace');
    expect(payload).toContain('Northwind Cataloguing');
    expect(payload).toContain('2019-03');
    expect(payload).toContain('McGill University');
    expect(payload).toContain(contact.id);
    expect(payload).toContain(role.id);
    expect(payload).toContain(school.id);
    expect(payload).not.toContain('FakeCo');
    expect(payload).toContain('compact');
    expect(first.usage).toMatchObject({ unit: 'document_credit', includedRemaining: 19, ledgerState: 'committed' });

    const again = await resumes.generate(p, created.id, {}, 'gen-1');
    expect(again.replayed).toBe(true);
    expect(again.result).toEqual(first.result);
    const listed = await resumes.versions(p, created.id);
    expect(listed.items).toHaveLength(2);
    expect(await states(p)).toEqual(['committed']);

    const pdf = await resumes.exportVersion(p, created.currentVersionId ?? '', 'pdf');
    expect(pdf.bytes.toString('latin1')).not.toContain('Prepared with FlacronCV');
    const docx = await resumes.exportVersion(p, listed.items[0]?.id ?? '', 'docx');
    expect(docx.bytes.subarray(0, 2).toString()).toBe('PK');
    expect(await states(p)).toEqual(['committed']);
  });

  it('releases the credit when the model is unusable, and does not tailor a missing listing', async () => {
    const p = await person('resume-fail');
    await new BillingService(db.pool, clock).startSubscription(p.billingAccountId, {
      planId: 'starter',
      interval: 'monthly',
      provider: 'stripe',
      providerSubscriptionId: `sub-${p.billingAccountId}`,
      periodStart: clock.now(),
      catalogVersion: CATALOG_VERSION,
    });
    await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const created = await resumes.create(p, { title: 'Ada', language: 'en' });
    model.once(RESUME_COMPOSE_TEMPLATE, 'not json');
    const failed = await resumes.generate(p, created.id, {}, 'gen-bad').catch((error: unknown) => error);
    expect(isBillingError(failed, 'provider_unavailable')).toBe(true);
    if (isBillingError(failed)) expect(failed.details.released).toBe(true);
    expect((await resumes.versions(p, created.id)).items).toHaveLength(1);
    expect(await states(p)).toEqual(['released']);

    const missing = await resumes
      .tailor(p, created.id, { opportunityId: '00000000-0000-4000-8000-000000000000' }, 'tailor-missing')
      .catch((error: unknown) => error);
    expect(isBillingError(missing, 'not_found')).toBe(true);
    expect(await states(p)).toEqual(['released']);

    const opportunity = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status)
       VALUES ('job', 'paste', 'ada-1', 'Analyst', 'Babbage', 'open') RETURNING id`,
    );
    const revision = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, description, status)
       VALUES ($1, 1, 'Analyst', 'Babbage', 'Must know COBOL and nothing else.', 'open') RETURNING id`,
      [opportunity.rows[0].id],
    );
    await db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [
      opportunity.rows[0].id,
      revision.rows[0].id,
    ]);
    model.always(RESUME_COMPOSE_TEMPLATE, JSON.stringify({ factIds: ['not-a-fact'], note: 'COBOL expert at Initech' }));
    const tailored = await resumes.tailor(p, created.id, { opportunityId: opportunity.rows[0].id }, 'tailor-1');
    expect(tailored.replayed).toBe(false);
    const tailoredJson = JSON.stringify(tailored.result);
    expect(tailoredJson).toContain('Northwind Cataloguing');
    expect(tailoredJson).toContain('SQL');
    expect(tailoredJson).not.toContain('Initech');
    expect(tailoredJson).not.toContain('COBOL');
  });

  it('refuses generate before reserving when the profile has no confirmed job or school', async () => {
    const p = await person('resume-skill-only');
    await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const created = await resumes.create(p, { title: 'Ada', language: 'en' });
    const refused = await resumes.generate(p, created.id, {}, 'gen-skill-only').catch((error: unknown) => error);
    expect(isBillingError(refused, 'validation_error')).toBe(true);
    if (isBillingError(refused)) expect(refused.details).toMatchObject({ field: 'facts', reason: 'need_experience_or_education' });
    expect(await states(p)).toEqual([]);
    expect(model.callsFor(RESUME_COMPOSE_TEMPLATE)).toHaveLength(0);
  });

  it('hides another person and refuses a resume with no facts to generate', async () => {
    const owner = await person('resume-owner');
    const other = await person('resume-other');
    await profiles.createFact(owner, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const created = await resumes.create(owner, { title: 'Ada', language: 'en' });
    const hidden = await resumes.get(other, created.id).catch((error: unknown) => error);
    expect(isBillingError(hidden, 'permission_denied')).toBe(true);
    const empty = await resumes.create(other, { title: 'Empty', language: 'en' });
    const refused = await resumes.generate(other, empty.id, {}, 'gen-empty').catch((error: unknown) => error);
    expect(isBillingError(refused, 'validation_error')).toBe(true);
    if (isBillingError(refused)) expect(refused.details).toMatchObject({ field: 'facts', reason: 'no_facts' });
  });
});
