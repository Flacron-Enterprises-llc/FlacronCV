import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { openBalances, readAccount } from '../billing/accounts';
import { BillingService } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { CareerProfileService } from '../profile/career-profile.service';
import { TestClock } from '../testing/billing-fixture';
import { UnconfiguredTextModel } from '../ai/text-model';
import { FakeTextModel } from '../testing/fake-ai';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { COVER_LETTER_TEMPLATE } from '../writing/writing-compose';
import { ActionEngineService } from './action-engine.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-17T10:00:00Z');
  return {
    uid,
    email: `${uid}@example.test`,
    emailVerified: true,
    authTime: at,
    issuedAt: at,
    signInProvider: 'password',
  };
}

describe('ActionEngineService (CV12)', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let profiles: CareerProfileService;
  let model: FakeTextModel;
  let metering: MeteringService;
  let service: ActionEngineService;
  let ada: Principal;
  let charles: Principal;

  beforeAll(async () => {
    db = await createTestDatabase('action_engine');
    clock = new TestClock('2026-10-17T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    ada = await identities.principal(identity('ada-action'));
    charles = await identities.principal(identity('charles-action'));
  });

  beforeEach(() => {
    model = new FakeTextModel();
    profiles = new CareerProfileService(db.pool, model, clock);
    metering = new MeteringService(db.pool, clock);
    service = new ActionEngineService(db.pool, metering, model);
    // A grounded letter: it names only the confirmed employer and the listing's
    // own organization, which the prompt carries.
    model.always(COVER_LETTER_TEMPLATE, (request) => {
      const prompt = JSON.parse(request.prompt) as { requiredFactIds: string[]; listing: { organization: string | null } | null };
      const target = prompt.listing?.organization;
      return JSON.stringify({
        opening: target
          ? `I am writing to apply to ${target} and to share the work I did at Northwind Cataloguing.`
          : 'I am writing to apply and to share the work I did at Northwind Cataloguing.',
        body: 'At Northwind Cataloguing I worked as a cataloguer from 2019-03 to 2024-06 and used TypeScript every week to keep the inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: prompt.requiredFactIds,
      });
    });
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  let oppCount = 0;
  async function seedOpportunity(
    title = 'Staff Engineer',
    org = 'Acme Labs',
    description = 'TypeScript, PostgreSQL, and distributed systems required for our records platform.',
  ): Promise<string> {
    oppCount += 1;
    const opp = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status)
       VALUES ('job', 'paste', $1, $2, $3, 'open') RETURNING id`,
      [`action-opp-${oppCount}`, title, org],
    );
    const rev = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, description, status)
       VALUES ($1, 1, $2, $3, $4, 'open') RETURNING id`,
      [opp.rows[0].id, title, org, description],
    );
    await db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [
      opp.rows[0].id,
      rev.rows[0].id,
    ]);
    return opp.rows[0].id;
  }

  async function setPlan(principal: Principal, planId: 'starter' | 'professional') {
    await db.pool.query(`UPDATE billing_accounts SET plan_id = $1 WHERE id = $2`, [planId, principal.billingAccountId]);
    const acc = await readAccount(db.pool, principal.billingAccountId);
    const snapshot = await new CatalogStore().get(db.pool, acc.catalog_version);
    await openBalances(db.pool, acc, snapshot, { regrant: true });
  }

  it('rejects invalid opportunity id with validation_error', async () => {
    const err = await service.create(ada, { opportunityId: 'not-a-uuid' }, 'key-invalid-uuid').catch((e) => e);
    expect(isBillingError(err, 'validation_error')).toBe(true);
    if (isBillingError(err)) expect(err.details).toMatchObject({ field: 'opportunityId' });
  });

  it('rejects when candidate has no confirmed career facts', async () => {
    const oppId = await seedOpportunity();
    const err = await service.create(ada, { opportunityId: oppId }, 'key-no-facts').catch((e) => e);
    expect(isBillingError(err, 'validation_error')).toBe(true);
    if (isBillingError(err)) expect(err.details).toMatchObject({ field: 'facts', reason: 'no_confirmed_facts' });
  });

  it('requires plan upgrade on Free plan (actionPacks allowance is null)', async () => {
    const oppId = await seedOpportunity();
    await profiles.createFact(ada, { factType: 'contact', value: { fullName: 'Ada Lovelace', email: 'ada@example.test' }, confirmation: 'confirmed' });
    await profiles.createFact(ada, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    await profiles.createFact(ada, { factType: 'skill', value: { name: 'TypeScript' }, confirmation: 'confirmed' });

    const err = await service.create(ada, { opportunityId: oppId }, 'key-free-upgrade').catch((e) => e);
    expect(isBillingError(err, 'plan_upgrade_required')).toBe(true);
    if (isBillingError(err)) expect(err.details).toMatchObject({ feature: 'actionPacks', minimumPlan: 'professional' });
  });

  it('requires plan upgrade on Starter plan', async () => {
    const oppId = await seedOpportunity();
    await setPlan(ada, 'starter');

    const err = await service.create(ada, { opportunityId: oppId }, 'key-starter-upgrade').catch((e) => e);
    expect(isBillingError(err, 'plan_upgrade_required')).toBe(true);
    if (isBillingError(err)) expect(err.details).toMatchObject({ feature: 'actionPacks', minimumPlan: 'professional' });
  });

  it('atomically reserves, executes and commits 1 action_pack unit on Professional plan', async () => {
    const oppId = await seedOpportunity('Distributed Systems Architect', 'Acme Systems');
    await setPlan(ada, 'professional');

    // Initial action pack allowance is 10 for Professional
    const listBefore = await service.list(ada);
    expect(listBefore.actionPack.includedRemaining).toBe(10);
    expect(listBefore.items).toHaveLength(0);

    const result = await service.create(ada, { opportunityId: oppId }, 'key-pack-1');
    expect(result.replayed).toBe(false);
    expect(result.usage).toMatchObject({
      unit: 'action_pack',
      includedRemaining: 9,
      ledgerState: 'committed',
    });

    const pack = result.result as any;
    expect(pack.id).toBeDefined();
    expect(pack.opportunityId).toBe(oppId);
    expect(pack.vacancySnapshot.title).toBe('Distributed Systems Architect');
    expect(pack.vacancySnapshot.organization).toBe('Acme Systems');
    expect(pack.profileSnapshot.length).toBeGreaterThan(0);
    expect(pack.fit).toBeDefined();
    expect(pack.tailoredResume).toBeDefined();
    expect(pack.coverLetter).toBeDefined();
    expect(pack.coverLetter.body).toContain('Acme Systems');
    // Signed with the confirmed contact name, never a placeholder.
    expect(pack.coverLetter.body.trim().endsWith('Ada Lovelace')).toBe(true);
    expect(pack.coverLetter.body).not.toContain('Candidate');
    // The confirmed skill is a reason, read from the fact text rather than its JSON keys.
    expect(pack.fit.reasonTokens).toContain('typescript');
    expect(pack.fit.gapTokens).not.toContain('name');
    expect(pack.checklist).toHaveLength(5);
    expect(pack.nextSteps.length).toBeGreaterThan(0);

    // Verify exactly 1 ledger entry exists for action_pack, and 0 for document_credit or resume_analysis
    const ledgerRows = await db.pool.query<{ unit: string; state: string }>(
      `SELECT unit, state FROM usage_ledger WHERE billing_account_id = $1`,
      [ada.billingAccountId],
    );
    expect(ledgerRows.rows).toHaveLength(1);
    expect(ledgerRows.rows[0].unit).toBe('action_pack');
    expect(ledgerRows.rows[0].state).toBe('committed');

    // List and get are free (0 credits debited)
    const listAfter = await service.list(ada);
    expect(listAfter.items).toHaveLength(1);
    expect(listAfter.actionPack.includedRemaining).toBe(9);

    const single = await service.get(ada, pack.id);
    expect(single.id).toBe(pack.id);
  });

  it('idempotently returns cached action pack on replayed key without double debiting', async () => {
    const oppId = await seedOpportunity('Backend Lead', 'DataCorp');
    const res1 = await service.create(ada, { opportunityId: oppId }, 'key-replayed-pack');
    expect(res1.replayed).toBe(false);

    const res2 = await service.create(ada, { opportunityId: oppId }, 'key-replayed-pack');
    expect(res2.replayed).toBe(true);
    expect(res2.usage.includedRemaining).toBe(res1.usage.includedRemaining);
    expect((res2.result as any).id).toBe((res1.result as any).id);
  });

  it('allows checklist toggling without consuming any credits', async () => {
    const oppId = await seedOpportunity('Security Engineer', 'SecureNet');
    const created = await service.create(ada, { opportunityId: oppId }, 'key-checklist-test');
    const pack = created.result as any;

    const checklistItemId = pack.checklist[0].id;
    const updated = await service.updateChecklist(ada, pack.id, checklistItemId, true);
    expect(updated.checklist.find((c: any) => c.id === checklistItemId)?.done).toBe(true);

    const list = await service.list(ada);
    // Included units remain at current balance
    expect(list.actionPack.includedRemaining).toBe((created.usage as any).includedRemaining);
  });

  it('enforces tenant and user isolation: another user cannot access action pack', async () => {
    const list = await service.list(ada);
    const pack = list.items[0];

    const err = await service.get(charles, pack.id).catch((e) => e);
    expect(isBillingError(err, 'permission_denied')).toBe(true);

    const updateErr = await service.updateChecklist(charles, pack.id, pack.checklist[0].id, true).catch((e) => e);
    expect(isBillingError(updateErr, 'permission_denied')).toBe(true);
  });

  it('refuses a listing too short to act on before charging', async () => {
    const oppId = await seedOpportunity('abc', 'unstated', 'abc');
    const before = (await service.list(ada)).actionPack.includedRemaining;
    const err = await service.create(ada, { opportunityId: oppId }, 'key-short-listing').catch((e) => e);
    expect(isBillingError(err, 'validation_error')).toBe(true);
    if (isBillingError(err)) expect(err.details).toMatchObject({ field: 'opportunityId', reason: 'listing_too_short' });
    expect((await service.list(ada)).actionPack.includedRemaining).toBe(before);
  });

  it('never writes the unstated marker and leaves the employer out instead', async () => {
    const oppId = await seedOpportunity('Records Analyst', 'unstated');
    const created = await service.create(ada, { opportunityId: oppId }, 'key-unstated-org');
    const pack = created.result as any;
    expect(pack.vacancySnapshot.organization).toBeNull();
    const text = JSON.stringify([pack.coverLetter, pack.checklist]);
    expect(text).not.toMatch(/unstated/i);
    expect(pack.checklist[0].label).toBe('Review the tailored resume for Records Analyst');
  });

  it('releases the credit and saves nothing when no model is available', async () => {
    const oppId = await seedOpportunity('Platform Engineer', 'Initech');
    const before = await service.list(ada);
    const offline = new ActionEngineService(db.pool, metering, new UnconfiguredTextModel());
    const err = await offline.create(ada, { opportunityId: oppId }, 'key-no-model').catch((e) => e);
    expect(isBillingError(err, 'provider_unavailable')).toBe(true);
    if (isBillingError(err)) expect(err.details).toMatchObject({ released: true });
    const after = await service.list(ada);
    expect(after.items).toHaveLength(before.items.length);
    expect(after.actionPack.includedRemaining).toBe(before.actionPack.includedRemaining);
  });
});
