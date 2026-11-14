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
import { UnconfiguredTextModel } from '../ai/text-model';
import { COVER_LETTER_TEMPLATE, WRITING_PROSE_TEMPLATE } from './writing-compose';
import { WritingService } from './writing.service';

function letterJson(factIds: string[], company = 'Northwind Cataloguing') {
  return JSON.stringify({
    opening: `I am writing to apply and to share the work I did at ${company}.`,
    body: `At ${company} I worked as a cataloguer from 2019-03 to 2024-06 and used SQL every week to keep the inventory records accurate for the team. That confirmed experience is the evidence I can offer.`,
    closing: 'Thank you for your time and consideration.',
    factIds,
  });
}

const SQL_BIO =
  'Ada is a records specialist who uses SQL every week to keep inventory data accurate. ' +
  'She cares about careful, well documented work and clear handovers to the people who rely on it.';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('WritingService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let profiles: CareerProfileService;
  let model: FakeTextModel;
  let writing: WritingService;

  beforeAll(async () => {
    db = await createTestDatabase('writing');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  beforeEach(() => {
    model = new FakeTextModel();
    profiles = new CareerProfileService(db.pool, model, clock);
    writing = new WritingService(db.pool, model, new MeteringService(db.pool, clock));
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

  it('spends one credit on real prose and releases it when the prose invents a claim', async () => {
    const p = await person('writing-facts');
    const skill = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Analyst', company: 'SecretCo' },
      confirmation: 'draft',
    });
    model.once(
      WRITING_PROSE_TEMPLATE,
      JSON.stringify({ body: `${SQL_BIO} She raised 50 million at Initech.`, factIds: [skill.id] }),
    );
    const invented = await writing.create(p, { type: 'bio', opportunityId: null }, 'bio-0').catch((error: unknown) => error);
    expect(isBillingError(invented, 'provider_unavailable')).toBe(true);
    if (isBillingError(invented)) expect(invented.details).toMatchObject({ released: true });
    expect(await states(p)).toEqual(['released']);

    model.once(WRITING_PROSE_TEMPLATE, JSON.stringify({ body: SQL_BIO, factIds: [skill.id, 'not-a-fact'] }));
    const created = await writing.create(p, { type: 'bio', opportunityId: null }, 'bio-1');
    expect(created.replayed).toBe(false);
    expect(created.usage).toMatchObject({ unit: 'document_credit', includedRemaining: 2, ledgerState: 'committed' });
    const document = created.result as { id: string; body: string; title: string; factIds: string[] };
    expect(document.title).toBe('Bio');
    expect(document.body).toBe(SQL_BIO);
    expect(document.factIds).toEqual([skill.id]);
    expect(JSON.stringify(created.result)).not.toContain('SecretCo');
    expect(model.callsFor(WRITING_PROSE_TEMPLATE)[0]?.prompt).not.toContain('SecretCo');
    expect(await states(p)).toEqual(['released', 'committed']);

    const replay = await writing.create(p, { type: 'bio', opportunityId: null }, 'bio-1');
    expect(replay.replayed).toBe(true);
    expect(replay.result).toEqual(created.result);
    expect((await writing.list(p)).items).toHaveLength(1);

    const edited = await writing.update(p, document.id, { body: 'SQL, as I would tell it' });
    expect(edited.id).toBe(document.id);
    expect(edited.body).toBe('SQL, as I would tell it');
    expect((await writing.list(p)).documentCredit.includedRemaining).toBe(2);
    expect(await states(p)).toEqual(['released', 'committed']);
  });

  it('refuses every type without reserving when no text model is configured', async () => {
    const p = await person('writing-no-ai');
    await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    const offline = new WritingService(db.pool, new UnconfiguredTextModel(), new MeteringService(db.pool, clock));
    expect((await offline.list(p)).textModelConfigured).toBe(false);
    expect((await writing.list(p)).textModelConfigured).toBe(true);
    for (const type of ['cover_letter', 'bio', 'linkedin', 'outreach', 'referral_request', 'thank_you']) {
      const refused = await offline
        .create(p, { type, context: { organization: 'Babbage' } }, `no-ai-${type}`)
        .catch((error: unknown) => error);
      expect(isBillingError(refused, 'provider_unavailable')).toBe(true);
      if (isBillingError(refused)) expect(refused.details).toMatchObject({ reason: 'ai_not_configured' });
    }
    expect(await states(p)).toEqual([]);
  });

  it('writes a referral request and a thank-you note from typed context without a saved listing', async () => {
    const p = await person('writing-referral');
    const role = await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    const missing = await writing.create(p, { type: 'referral_request' }, 'ref-0').catch((error: unknown) => error);
    expect(isBillingError(missing, 'validation_error')).toBe(true);
    if (isBillingError(missing)) expect(missing.details).toMatchObject({ field: 'context', reason: 'missing_target' });
    const badContext = await writing
      .create(p, { type: 'thank_you', context: { organization: 'Babbage', interviewDate: 'last tuesday' } }, 'ty-0')
      .catch((error: unknown) => error);
    expect(isBillingError(badContext, 'validation_error')).toBe(true);
    expect(await states(p)).toEqual([]);

    const context = { organization: 'Babbage', role: 'Records Analyst', contactName: 'Grace Hopper', contactRole: 'Engineering lead' };
    model.once(
      WRITING_PROSE_TEMPLATE,
      JSON.stringify({
        body:
          'Dear Grace, I am applying for the Records Analyst role at Babbage and would be grateful for a referral. ' +
          'At Northwind Cataloguing I worked as a cataloguer and kept inventory records accurate for the team. ' +
          'If you are comfortable, could you pass my application to the hiring team? Thank you for considering it.',
        factIds: [role.id],
      }),
    );
    const referral = await writing.create(p, { type: 'referral_request', context }, 'ref-1');
    const referralDoc = referral.result as { title: string; body: string; type: string; opportunityRevisionId: string | null };
    expect(referralDoc).toMatchObject({ type: 'referral_request', title: 'Referral request for Babbage', opportunityRevisionId: null });
    const prompt = JSON.parse(model.callsFor(WRITING_PROSE_TEMPLATE)[0]!.prompt) as { target: Record<string, unknown> };
    expect(prompt.target).toMatchObject({ organization: 'Babbage', role: 'Records Analyst', contactName: 'Grace Hopper', interviewDate: null });

    // A thank-you note that names a person the user never mentioned is refused and released.
    const note =
      'Dear Grace Hopper, thank you for speaking with me on 12 November 2026 about the Records Analyst role at Babbage. ' +
      'I enjoyed learning how the team keeps its records accurate, and I remain very interested in the role.';
    model.once(WRITING_PROSE_TEMPLATE, JSON.stringify({ body: note.replace('Grace Hopper', 'Margaret Hamilton'), factIds: [] }));
    const wrongName = await writing
      .create(p, { type: 'thank_you', context: { ...context, interviewDate: '2026-11-12' } }, 'ty-1')
      .catch((error: unknown) => error);
    expect(isBillingError(wrongName, 'provider_unavailable')).toBe(true);
    if (isBillingError(wrongName)) expect(wrongName.details).toMatchObject({ reason: 'unsupported_contact', released: true });

    model.once(WRITING_PROSE_TEMPLATE, JSON.stringify({ body: note, factIds: [] }));
    const thanks = await writing.create(p, { type: 'thank_you', context: { ...context, interviewDate: '2026-11-12' } }, 'ty-2');
    expect(thanks.result).toMatchObject({ type: 'thank_you', title: 'Thank-you note to Babbage', body: note });
    expect(await states(p)).toEqual(['committed', 'released', 'committed']);
  });

  it('releases the credit when an ended role is described as current', async () => {
    const p = await person('writing-current');
    const role = await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northbridge Civic Library', startDate: '2021-01', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    const skill = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    model.once(
      COVER_LETTER_TEMPLATE,
      JSON.stringify({
        opening: 'I am writing to apply and to share my cataloguing work with your team.',
        body: 'Currently I work at Northbridge Civic Library as a cataloguer and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [role.id, skill.id],
      }),
    );
    const failed = await writing.create(p, { type: 'cover_letter' }, 'letter-current').catch((error: unknown) => error);
    expect(isBillingError(failed, 'provider_unavailable')).toBe(true);
    if (isBillingError(failed)) {
      expect(failed.details).toMatchObject({ released: true, reason: 'current_role_unsupported' });
    }
    expect(await states(p)).toEqual(['released']);
    expect((await writing.list(p)).items).toEqual([]);
    expect(model.callsFor(COVER_LETTER_TEMPLATE)[0]?.prompt).toContain('"tenure":"ended"');
    expect(model.callsFor(COVER_LETTER_TEMPLATE)[0]?.prompt).toContain('"current":false');
  });

  it('keeps a saved letter when a later unusable draft is released', async () => {
    const p = await person('writing-keep');
    const role = await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    const skill = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    model.once(COVER_LETTER_TEMPLATE, letterJson([role.id, skill.id]));
    const created = await writing.create(p, { type: 'cover_letter' }, 'letter-keep-1');
    const saved = created.result as { id: string; body: string };
    model.once(
      COVER_LETTER_TEMPLATE,
      JSON.stringify({
        opening: 'I am writing to apply and to share the work I did at Northwind Cataloguing.',
        body: 'At Acme Partners I worked as a cataloguer and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [role.id, skill.id],
      }),
    );
    const failed = await writing.create(p, { type: 'cover_letter' }, 'letter-keep-2').catch((error: unknown) => error);
    expect(isBillingError(failed, 'provider_unavailable')).toBe(true);
    if (isBillingError(failed)) {
      expect(failed.details).toMatchObject({ released: true, reason: 'unsupported_employer', claim: 'Acme Partners' });
    }
    const listed = await writing.list(p);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.id).toBe(saved.id);
    expect(listed.items[0]?.body).toBe(saved.body);
    expect(listed.items[0]?.body).not.toContain('Acme Partners');
    expect(await states(p)).toEqual(['committed', 'released']);
  });

  it('releases the credit when the cover letter is incomplete', async () => {
    const p = await person('writing-bad');
    const role = await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    model.once(
      COVER_LETTER_TEMPLATE,
      JSON.stringify({ opening: 'Hello', body: 'SQL', closing: 'Thanks', factIds: [role.id], blurb: 'COBOL expert' }),
    );
    const failed = await writing.create(p, { type: 'cover_letter' }, 'letter-bad').catch((error: unknown) => error);
    expect(isBillingError(failed, 'provider_unavailable')).toBe(true);
    if (isBillingError(failed)) expect(failed.details.released).toBe(true);
    expect(await states(p)).toEqual(['released']);
    expect((await writing.list(p)).items).toEqual([]);
    expect(JSON.stringify((await writing.list(p)).items)).not.toContain('COBOL');
  });

  it('refuses a cover letter before reserving when there is no confirmed job or school', async () => {
    const p = await person('writing-skill-only');
    await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const refused = await writing.create(p, { type: 'cover_letter' }, 'letter-skill').catch((error: unknown) => error);
    expect(isBillingError(refused, 'validation_error')).toBe(true);
    if (isBillingError(refused)) expect(refused.details).toMatchObject({ field: 'facts', reason: 'need_experience_or_education' });
    expect(await states(p)).toEqual([]);
    expect(model.callsFor(COVER_LETTER_TEMPLATE)).toHaveLength(0);
  });

  it('refuses before reserving when nothing is confirmed or the listing is missing', async () => {
    const p = await person('writing-empty');
    await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'draft' });
    const refused = await writing.create(p, { type: 'outreach' }, 'out-1').catch((error: unknown) => error);
    expect(isBillingError(refused, 'validation_error')).toBe(true);
    if (isBillingError(refused)) expect(refused.details).toMatchObject({ field: 'facts', reason: 'no_confirmed_facts' });
    const missing = await writing
      .create(p, { type: 'cover_letter', opportunityId: '00000000-0000-4000-8000-000000000001' }, 'out-2')
      .catch((error: unknown) => error);
    expect(isBillingError(missing, 'not_found')).toBe(true);
    expect(await states(p)).toEqual([]);
  });

  it("refuses another candidate's private pasted listing as not_found before reserving", async () => {
    const owner = await person('writing-private-owner');
    const intruder = await person('writing-private-intruder');
    const pasted = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status, candidate_auth_user_id)
       VALUES ('job', 'paste', 'writing-private-1', 'Archivist', 'Private Co', 'open', $1) RETURNING id`,
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
    for (const p of [owner, intruder]) {
      await profiles.createFact(p, {
        factType: 'experience',
        value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
        confirmation: 'confirmed',
      });
    }
    const refused = await writing
      .create(intruder, { type: 'cover_letter', opportunityId: privateId }, 'private-letter-1')
      .catch((error: unknown) => error);
    expect(isBillingError(refused, 'not_found')).toBe(true);
    expect(await states(intruder)).toEqual([]);
    expect(model.callsFor(COVER_LETTER_TEMPLATE)).toHaveLength(0);
  });

  it('names the listing in the title and does not copy the listing into the body', async () => {
    const p = await person('writing-job');
    const role = await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    const skill = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const opportunity = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status)
       VALUES ('job', 'paste', 'writing-1', 'Analyst', 'Babbage', 'open') RETURNING id`,
    );
    const revision = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, description, status)
       VALUES ($1, 1, 'Analyst', 'Babbage', 'Must know COBOL.', 'open') RETURNING id`,
      [opportunity.rows[0].id],
    );
    await db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [
      opportunity.rows[0].id,
      revision.rows[0].id,
    ]);
    model.always(COVER_LETTER_TEMPLATE, letterJson([role.id, skill.id]));
    const created = await writing.create(p, { type: 'cover_letter', opportunityId: opportunity.rows[0].id }, 'letter-1');
    const document = created.result as { title: string; body: string };
    expect(document.title).toBe('Cover letter for Babbage');
    expect(document.body.split('\n\n')).toHaveLength(3);
    expect(document.body).toContain('Northwind Cataloguing');
    expect(document.body).toContain('SQL');
    expect(document.body.length).toBeGreaterThan(200);
    expect(document.body).not.toContain('COBOL');
    expect(model.callsFor(COVER_LETTER_TEMPLATE)[0]?.prompt).toContain('COBOL');
  });

  it('uses a pasted listing target organization without making it confirmed employment', async () => {
    const p = await person('writing-paste-target');
    const role = await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northbridge Civic Library', startDate: '2021-01', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    const skill = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const opportunity = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status)
       VALUES ('job', 'paste', 'writing-paste-1', 'Cataloguing Coordinator', 'unstated', 'open') RETURNING id`,
    );
    const revision = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, description, status)
       VALUES ($1, 1, 'Cataloguing Coordinator', 'unstated', $2, 'open') RETURNING id`,
      [
        opportunity.rows[0].id,
        'Cataloguing Coordinator\nHarbourfront Learning Room\nMontreal, QC\nKeep records accurate. COBOL is not required.',
      ],
    );
    await db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [
      opportunity.rows[0].id,
      revision.rows[0].id,
    ]);
    model.once(
      COVER_LETTER_TEMPLATE,
      JSON.stringify({
        opening: 'I am writing to apply to Harbourfront Learning Room and to share cataloguing work from Northbridge Civic Library.',
        body: 'At Northbridge Civic Library I worked as a cataloguer from 2021-01 to 2024-06 and used SQL every week to keep inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [role.id, skill.id],
      }),
    );
    const created = await writing.create(p, { type: 'cover_letter', opportunityId: opportunity.rows[0].id }, 'letter-paste-target');
    const document = created.result as { title: string; body: string };
    expect(document.title).toBe('Cover letter for Harbourfront Learning Room');
    expect(document.body).toContain('Harbourfront Learning Room');
    expect(document.body).toContain('Northbridge Civic Library');
    expect(document.body).not.toContain('COBOL');
    expect(model.callsFor(COVER_LETTER_TEMPLATE)[0]?.prompt).toContain('"organization":"Harbourfront Learning Room"');
    expect(await states(p)).toEqual(['committed']);
  });

  it('stops at the free document-credit grant and hides another person', async () => {
    const owner = await person('writing-owner');
    const other = await person('writing-other');
    const skill = await profiles.createFact(owner, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    model.always(
      WRITING_PROSE_TEMPLATE,
      JSON.stringify({
        body:
          'I keep inventory and catalogue records accurate with SQL, and I enjoy turning messy data into something a team can trust. ' +
          'I document what I change so the people after me can pick it up quickly. I am open to conversations about records and data roles.',
        factIds: [skill.id],
      }),
    );
    const first = await writing.create(owner, { type: 'linkedin' }, 'li-1');
    await writing.create(owner, { type: 'linkedin' }, 'li-2');
    await writing.create(owner, { type: 'linkedin' }, 'li-3');
    const blocked = await writing.create(owner, { type: 'linkedin' }, 'li-4').catch((error: unknown) => error);
    expect(isBillingError(blocked, 'quota_exhausted')).toBe(true);
    expect((await writing.list(owner)).items).toHaveLength(3);
    expect(await states(owner)).toEqual(['committed', 'committed', 'committed']);
    const hidden = await writing.get(other, (first.result as { id: string }).id).catch((error: unknown) => error);
    expect(isBillingError(hidden, 'permission_denied')).toBe(true);
    expect((await writing.list(other)).items).toEqual([]);
  });

  it('persists a cover-letter template, keeps the body, and exports PDF without another credit', async () => {
    const p = await person('writing-template');
    const role = await profiles.createFact(p, {
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
    });
    const skill = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    model.always(COVER_LETTER_TEMPLATE, letterJson([role.id, skill.id]));
    const created = await writing.create(p, { type: 'cover_letter', templateId: 'creative' }, 'letter-template-1');
    const document = created.result as { id: string; body: string; templateId: string };
    expect(document.templateId).toBe('creative');
    expect(document.body).toContain('Northwind Cataloguing');
    const switched = await writing.update(p, document.id, { templateId: 'modern' });
    expect(switched.templateId).toBe('modern');
    expect(switched.body).toBe(document.body);
    const pdf = await writing.exportDocument(p, document.id, 'pdf');
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.bytes.toString('latin1')).toContain('Northwind Cataloguing');
    expect(pdf.bytes.toString('latin1')).toContain('/Helvetica-Bold');
    expect((await writing.list(p)).documentCredit.includedRemaining).toBe(2);
    const txt = await writing.exportDocument(p, document.id, 'txt');
    expect(txt.bytes.toString('utf8')).toBe(document.body);
    const docx = await writing.exportDocument(p, document.id, 'docx').catch((error: unknown) => error);
    expect(isBillingError(docx, 'plan_upgrade_required')).toBe(true);
  });
});
