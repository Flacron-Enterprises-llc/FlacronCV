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
    service = new ActionEngineService(db.pool, metering, model, clock);
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

  it("treats another candidate's private pasted listing as missing", async () => {
    const owner = charles;
    const pasted = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status, candidate_auth_user_id)
       VALUES ('job', 'paste', 'action-private-1', 'Archivist', 'Private Co', 'open', $1) RETURNING id`,
      [owner.authUserId],
    );
    const pastedRevision = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, description, status)
       VALUES ($1, 1, 'Archivist', 'Private Co', 'Keep the archive catalogue accurate with SQL and careful records work.', 'open') RETURNING id`,
      [pasted.rows[0].id],
    );
    await db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [
      pasted.rows[0].id,
      pastedRevision.rows[0].id,
    ]);
    const privateId = pasted.rows[0].id;
    const err = await service.create(ada, { opportunityId: privateId }, 'key-private-listing').catch((e) => e);
    expect(isBillingError(err, 'not_found')).toBe(true);
    const ledger = await db.pool.query(`SELECT 1 FROM usage_ledger WHERE billing_account_id = $1`, [ada.billingAccountId]);
    expect(ledger.rowCount).toBe(0);
    // The owner gets past the listing check (and stops later on missing facts).
    const own = await service.create(charles, { opportunityId: privateId }, 'key-private-own').catch((e) => e);
    expect(isBillingError(own, 'not_found')).toBe(false);
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
    const offline = new ActionEngineService(db.pool, metering, new UnconfiguredTextModel(), clock);
    const err = await offline.create(ada, { opportunityId: oppId }, 'key-no-model').catch((e) => e);
    expect(isBillingError(err, 'provider_unavailable')).toBe(true);
    if (isBillingError(err)) expect(err.details).toMatchObject({ released: true });
    const after = await service.list(ada);
    expect(after.items).toHaveLength(before.items.length);
    expect(after.actionPack.includedRemaining).toBe(before.actionPack.includedRemaining);
  });

  describe('one reservation across retries, edits and Documents', () => {
    let seq = 0;
    async function professional(): Promise<Principal> {
      seq += 1;
      const p = await identities.principal(identity(`grace-action-${seq}`));
      await setPlan(p, 'professional');
      await profiles.createFact(p, { factType: 'contact', value: { fullName: 'Grace Hopper', email: `g${seq}@example.test` }, confirmation: 'confirmed' });
      await profiles.createFact(p, {
        factType: 'experience',
        value: { position: 'Barista', company: 'Corner Cafe', startDate: '2014-01', endDate: '2015-01' },
        confirmation: 'confirmed',
      });
      await profiles.createFact(p, {
        factType: 'experience',
        value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
        confirmation: 'confirmed',
      });
      await profiles.createFact(p, { factType: 'skill', value: { name: 'Latte art' }, confirmation: 'confirmed' });
      await profiles.createFact(p, { factType: 'skill', value: { name: 'PostgreSQL' }, confirmation: 'confirmed' });
      await profiles.createFact(p, { factType: 'skill', value: { name: 'Kubernetes' }, confirmation: 'draft' });
      return p;
    }

    async function ledger(p: Principal) {
      const res = await db.pool.query<{ unit: string; state: string }>(
        `SELECT unit, state FROM usage_ledger WHERE billing_account_id = $1 ORDER BY created_at`,
        [p.billingAccountId],
      );
      return res.rows;
    }

    const listingText = 'Catalogue records with PostgreSQL and Kubernetes; keep the cataloguing inventory accurate for the team.';

    it('tailors the résumé to the listing from confirmed facts only', async () => {
      const p = await professional();
      const oppId = await seedOpportunity('Cataloguer', 'Acme Labs', listingText);
      const pack = (await service.create(p, { opportunityId: oppId }, 'tailor-1')).result as any;
      const texts: string[] = pack.tailoredResume.lines.map((line: any) => line.text);
      expect(texts[0]).toContain('Grace Hopper');
      // The matching role comes before the unrelated one; both stay.
      expect(texts.findIndex((t) => t.includes('Northwind'))).toBeLessThan(texts.findIndex((t) => t.includes('Corner Cafe')));
      expect(texts).toContain('PostgreSQL');
      expect(texts).not.toContain('Latte art');
      expect(pack.tailoredResume.omittedFactIds).toHaveLength(1);
      // A draft fact never appears, even though the listing asks for it.
      expect(JSON.stringify(pack.tailoredResume)).not.toContain('Kubernetes');
      expect(pack.status).toBe('complete');
    });

    it('keeps a partial pack on a letter failure and retries it under the same reservation', async () => {
      const p = await professional();
      const oppId = await seedOpportunity('Cataloguer', 'Acme Labs', listingText);
      model.once(COVER_LETTER_TEMPLATE, 'not json');
      const first = await service.create(p, { opportunityId: oppId }, 'retry-1');
      const partial = first.result as any;
      expect(partial.status).toBe('partial');
      expect(partial.coverLetter).toBeNull();
      expect(partial.componentErrors.coverLetter).toBe('unusable_output');
      expect(partial.tailoredResume.lines.length).toBeGreaterThan(0);
      expect(first.usage.ledgerState).toBe('reserved');
      expect(await ledger(p)).toEqual([{ unit: 'action_pack', state: 'reserved' }]);

      // Replaying the create key returns the same partial pack, no second hold.
      const replay = await service.create(p, { opportunityId: oppId }, 'retry-1');
      expect(replay.replayed).toBe(true);
      expect((replay.result as any).id).toBe(partial.id);

      const done = await service.retry(p, partial.id, 'coverLetter');
      const pack = done.result as any;
      expect(pack.status).toBe('complete');
      expect(pack.coverLetter.body).toContain('Northwind Cataloguing');
      expect(pack.letterAttempts).toBe(2);
      expect(done.usage).toMatchObject({ ledgerState: 'committed', includedRemaining: 9 });
      // Exactly one pack credit and nothing else, across both attempts.
      expect(await ledger(p)).toEqual([{ unit: 'action_pack', state: 'committed' }]);

      const again = await service.retry(p, partial.id, 'coverLetter').catch((e) => e);
      expect(isBillingError(again, 'validation_error')).toBe(true);
      const other = await service.retry(p, partial.id, 'tailoredResume').catch((e) => e);
      expect(isBillingError(other, 'validation_error')).toBe(true);
    });

    it('releases the reservation and removes the pack when the attempts run out', async () => {
      const p = await professional();
      const oppId = await seedOpportunity('Cataloguer', 'Acme Labs', listingText);
      model.always(COVER_LETTER_TEMPLATE, 'not json');
      const partial = (await service.create(p, { opportunityId: oppId }, 'exhaust-1')).result as any;
      expect(partial.status).toBe('partial');
      expect((await service.retry(p, partial.id, 'coverLetter')).result).toMatchObject({ status: 'partial', letterAttempts: 2 });
      const final = await service.retry(p, partial.id, 'coverLetter').catch((e) => e);
      expect(isBillingError(final, 'provider_unavailable')).toBe(true);
      if (isBillingError(final)) expect(final.details).toMatchObject({ released: true });
      expect(await ledger(p)).toEqual([{ unit: 'action_pack', state: 'released' }]);
      expect((await service.list(p)).items).toHaveLength(0);
      expect((await service.list(p)).actionPack.includedRemaining).toBe(10);
    });

    it('gives the held credit back when the person cancels a partial pack', async () => {
      const p = await professional();
      const oppId = await seedOpportunity('Cataloguer', 'Acme Labs', listingText);
      model.once(COVER_LETTER_TEMPLATE, 'not json');
      const partial = (await service.create(p, { opportunityId: oppId }, 'cancel-1')).result as any;
      expect((await service.list(p)).actionPack.includedRemaining).toBe(9);
      expect(await service.cancel(p, partial.id)).toEqual({ released: true });
      expect((await service.list(p)).actionPack.includedRemaining).toBe(10);
      expect(isBillingError(await service.get(p, partial.id).catch((e) => e), 'not_found')).toBe(true);
    });

    it('lets the person edit every component without a charge or an unconfirmed fact', async () => {
      const p = await professional();
      const oppId = await seedOpportunity('Cataloguer', 'Acme Labs', listingText);
      const pack = (await service.create(p, { opportunityId: oppId }, 'edit-1')).result as any;
      const lines = pack.tailoredResume.lines.map((line: any) => ({ factId: line.factId, text: line.text }));
      const omitted = pack.tailoredResume.omittedFactIds[0];
      const edited = await service.update(p, pack.id, {
        tailoredResume: { title: 'My résumé for Acme', lines: [...lines.reverse(), { factId: omitted, text: 'Latte art (award)' }] },
        coverLetter: { body: 'My own words.' },
        fit: { reasons: ['Five years of cataloguing'], gaps: ['Kubernetes'] },
        nextSteps: ['Email the hiring manager'],
        checklist: [{ label: 'Ask Sam for a reference', done: false }],
      });
      expect(edited.tailoredResume.title).toBe('My résumé for Acme');
      expect(edited.tailoredResume.lines.at(-1)?.text).toBe('Latte art (award)');
      expect(edited.tailoredResume.omittedFactIds).toEqual([]);
      expect(edited.coverLetter?.body).toBe('My own words.');
      expect(edited.fit.reasons).toEqual(['Five years of cataloguing']);
      expect(edited.nextSteps).toEqual(['Email the hiring manager']);
      expect(edited.checklist).toHaveLength(1);
      expect(edited.editedComponents?.sort()).toEqual(['checklist', 'coverLetter', 'fit', 'nextSteps', 'tailoredResume']);

      const invented = await service
        .update(p, pack.id, { tailoredResume: { lines: [{ factId: '00000000-0000-4000-8000-000000000009', text: 'COBOL expert' }] } })
        .catch((e) => e);
      expect(isBillingError(invented, 'validation_error')).toBe(true);
      const intruder = await service.update(charles, pack.id, { nextSteps: ['x'] }).catch((e) => e);
      expect(isBillingError(intruder, 'permission_denied')).toBe(true);
      expect(await ledger(p)).toEqual([{ unit: 'action_pack', state: 'committed' }]);
    });

    it('copies the bundle into Documents once and exports PDF and DOCX for free', async () => {
      const p = await professional();
      const oppId = await seedOpportunity('Cataloguer', 'Acme Labs', listingText);
      const pack = (await service.create(p, { opportunityId: oppId }, 'docs-1')).result as any;

      const saved = await service.saveToDocuments(p, pack.id, {});
      expect(saved.savedDocuments.resumeId).toBeTruthy();
      expect(saved.savedDocuments.letterDocumentId).toBeTruthy();
      const version = await db.pool.query<{ body: any; opportunity_revision_id: string }>(
        `SELECT body, opportunity_revision_id FROM resume_versions WHERE id = $1`,
        [saved.savedDocuments.resumeVersionId],
      );
      expect(version.rows[0].opportunity_revision_id).toBe(pack.opportunityRevisionId);
      expect(JSON.stringify(version.rows[0].body)).toContain('Northwind Cataloguing');
      const letter = await db.pool.query<{ body: string; document_type: string }>(
        `SELECT body, document_type FROM writing_documents WHERE id = $1`,
        [saved.savedDocuments.letterDocumentId],
      );
      expect(letter.rows[0]).toMatchObject({ document_type: 'cover_letter', body: pack.coverLetter.body });

      // Saving unchanged content again adds nothing.
      const same = await service.saveToDocuments(p, pack.id, {});
      expect(same.savedDocuments).toEqual(saved.savedDocuments);
      // After an edit, the résumé gets a new version and the letter is updated in place.
      await service.update(p, pack.id, { coverLetter: { body: 'Edited letter.' } });
      await service.update(p, pack.id, {
        tailoredResume: { lines: pack.tailoredResume.lines.slice(0, 2).map((l: any) => ({ factId: l.factId, text: l.text })) },
      });
      const resaved = await service.saveToDocuments(p, pack.id, {});
      expect(resaved.savedDocuments.resumeId).toBe(saved.savedDocuments.resumeId);
      expect(resaved.savedDocuments.resumeVersionId).not.toBe(saved.savedDocuments.resumeVersionId);
      expect(resaved.savedDocuments.letterDocumentId).toBe(saved.savedDocuments.letterDocumentId);
      const updatedLetter = await db.pool.query<{ body: string }>(`SELECT body FROM writing_documents WHERE id = $1`, [
        saved.savedDocuments.letterDocumentId,
      ]);
      expect(updatedLetter.rows[0].body).toBe('Edited letter.');

      const pdf = await service.exportComponent(p, pack.id, 'tailoredResume', 'pdf');
      expect(pdf.contentType).toBe('application/pdf');
      expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF');
      const docx = await service.exportComponent(p, pack.id, 'coverLetter', 'docx');
      expect(docx.bytes.subarray(0, 2).toString()).toBe('PK');
      const bad = await service.exportComponent(p, pack.id, 'fit', 'pdf').catch((e) => e);
      expect(isBillingError(bad, 'validation_error')).toBe(true);

      // No document or analysis credits: still the one pack credit only.
      expect(await ledger(p)).toEqual([{ unit: 'action_pack', state: 'committed' }]);
    });

    // Last: it moves the shared clock forward.
    it('expires a partial pack whose hold ran out: the sweep released the credit', async () => {
      const p = await professional();
      const oppId = await seedOpportunity('Cataloguer', 'Acme Labs', listingText);
      model.once(COVER_LETTER_TEMPLATE, 'not json');
      const partial = (await service.create(p, { opportunityId: oppId }, 'expire-1')).result as any;
      clock.set(new Date(clock.now().getTime() + 25 * 60 * 60 * 1000).toISOString());
      expect(await metering.releaseAbandoned(60_000)).toBeGreaterThanOrEqual(1);
      const expired = await service.get(p, partial.id);
      expect(expired.status).toBe('expired');
      const retry = await service.retry(p, partial.id, 'coverLetter').catch((e) => e);
      expect(isBillingError(retry, 'provider_unavailable')).toBe(true);
      if (isBillingError(retry)) expect(retry.details).toMatchObject({ released: true, reason: 'pack_expired' });
      expect(await service.cancel(p, partial.id)).toEqual({ released: true });
      expect(await ledger(p)).toEqual([{ unit: 'action_pack', state: 'released' }]);
    });
  });
});
