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
import { INTERVIEW_TEMPLATE } from './interview-compose';
import { InterviewService } from './interview.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('InterviewService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let profiles: CareerProfileService;
  let model: FakeTextModel;
  let interviews: InterviewService;

  beforeAll(async () => {
    db = await createTestDatabase('interviews');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  beforeEach(() => {
    model = new FakeTextModel();
    profiles = new CareerProfileService(db.pool, model, clock);
    interviews = new InterviewService(db.pool, model, new MeteringService(db.pool, clock));
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  async function states(p: Principal): Promise<string[]> {
    const res = await db.pool.query<{ state: string }>(
      `SELECT state FROM usage_ledger WHERE billing_account_id = $1 AND unit = 'text_interview' ORDER BY created_at`,
      [p.billingAccountId],
    );
    return res.rows.map((row) => row.state);
  }

  let listingCount = 0;

  async function listing(title: string, description: string): Promise<string> {
    listingCount += 1;
    const opportunity = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status)
       VALUES ('job', 'paste', $1, $2, 'unstated', 'open') RETURNING id`,
      [`interview-${listingCount}`, title],
    );
    const revision = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, description, status)
       VALUES ($1, 1, $2, 'unstated', $3, 'open') RETURNING id`,
      [opportunity.rows[0].id, title, description],
    );
    await db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [
      opportunity.rows[0].id,
      revision.rows[0].id,
    ]);
    return opportunity.rows[0].id;
  }

  it('refuses a free plan, a missing fact, and a missing listing before a debit', async () => {
    const p = await person('interview-free');
    const empty = await interviews.start(p, { opportunityId: await listing('Empty role', 'COBOL'), stage: 'behavioral' }, 'empty').catch((error: unknown) => error);
    expect(isBillingError(empty, 'validation_error')).toBe(true);
    if (isBillingError(empty)) expect(empty.details).toMatchObject({ field: 'facts', reason: 'no_confirmed_facts' });
    await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const missing = await interviews
      .start(p, { opportunityId: '00000000-0000-4000-8000-000000000001', stage: 'behavioral' }, 'missing')
      .catch((error: unknown) => error);
    expect(isBillingError(missing, 'not_found')).toBe(true);
    const blocked = await interviews
      .start(p, { opportunityId: await listing('SQL analyst', 'Must know COBOL.'), stage: 'behavioral' }, 'free')
      .catch((error: unknown) => error);
    expect(isBillingError(blocked, 'plan_upgrade_required')).toBe(true);
    if (isBillingError(blocked)) expect(blocked.details).toMatchObject({ feature: 'textInterviewSessions', minimumPlan: 'starter' });
    expect(model.calls).toHaveLength(0);
    expect(await states(p)).toEqual([]);
  });

  it('spends one session and lets later answers and a story through without another debit', async () => {
    const p = await person('interview-ada');
    await db.pool.query(`UPDATE billing_accounts SET plan_id = 'starter' WHERE id = $1`, [p.billingAccountId]);
    const skill = await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    await profiles.createFact(p, { factType: 'experience', value: { position: 'Analyst', company: 'SecretCo' }, confirmation: 'draft' });
    const opportunityId = await listing('SQL analyst', 'Must know COBOL. Raised 50 million.');
    model.always(INTERVIEW_TEMPLATE, JSON.stringify({ factIds: [skill.id, 'not-a-fact'], question: 'raised 50 million at Initech' }));
    const created = await interviews.start(p, { opportunityId, stage: 'behavioral' }, 'session-1');
    expect(created.replayed).toBe(false);
    expect(created.usage).toMatchObject({ unit: 'text_interview', includedRemaining: 1, ledgerState: 'committed' });
    const session = created.result as { id: string; questions: Array<{ prompt: string }>; summary: string };
    expect(session.questions).toHaveLength(10);
    expect(session.questions[0]?.prompt).toContain('Confirmed line: SQL');
    expect(session.questions[0]?.prompt).toContain('SQL analyst');
    expect(session.summary).toBe('No answers yet.');
    expect(JSON.stringify(created.result)).not.toContain('50 million');
    expect(JSON.stringify(created.result)).not.toContain('SecretCo');
    expect(JSON.stringify(created.result)).not.toContain('COBOL');
    expect(JSON.stringify(created.result)).not.toContain('Initech');
    expect(JSON.stringify(created.result)).not.toContain('hiring');
    const prompt = model.callsFor(INTERVIEW_TEMPLATE)[0]?.prompt ?? '';
    expect(prompt).toContain('SQL');
    expect(prompt).not.toContain('SecretCo');
    expect(prompt).not.toContain('COBOL');
    expect(prompt).not.toContain('50 million');

    const replay = await interviews.start(p, { opportunityId, stage: 'behavioral' }, 'session-1');
    expect(replay.replayed).toBe(true);
    expect(replay.result).toEqual(created.result);

    const answered = await interviews.answer(p, session.id, { answer: 'I used SQL.' });
    expect(answered.answers).toHaveLength(1);
    expect(answered.answers[0]?.feedback.relevance).toBe('grounded');
    expect(answered.summary).toContain('1 of 10');
    expect(answered.summary).not.toContain('hiring');
    const challenged = await interviews.challenge(p, session.id, { answerId: answered.answers[0]?.id, note: 'The line was already confirmed.' });
    expect(challenged.answers[0]?.challenge).toBe('The line was already confirmed.');

    for (let n = 2; n <= 10; n += 1) {
      await interviews.answer(p, session.id, { answer: 'I used SQL.' });
    }
    const done = await interviews.answer(p, session.id, { answer: 'I used SQL.' }).catch((error: unknown) => error);
    expect(isBillingError(done, 'validation_error')).toBe(true);
    if (isBillingError(done)) expect(done.details).toMatchObject({ field: 'answer', reason: 'session_complete' });

    const second = await interviews.start(p, { opportunityId, stage: 'technical' }, 'session-2');
    expect(second.usage.includedRemaining).toBe(0);
    const third = await interviews.start(p, { opportunityId, stage: 'panel' }, 'session-3').catch((error: unknown) => error);
    expect(isBillingError(third, 'quota_exhausted')).toBe(true);

    const invented = await interviews
      .createStory(p, { situation: 'SQL', task: 'SQL', action: 'SQL', result: 'raised 50 million' })
      .catch((error: unknown) => error);
    expect(isBillingError(invented, 'validation_error')).toBe(true);
    if (isBillingError(invented)) expect(invented.details).toMatchObject({ field: 'result', reason: 'number_not_in_facts' });
    const story = await interviews.createStory(p, { situation: 'SQL', task: 'SQL', action: 'SQL', result: 'SQL' });
    expect(story.result).toBe('SQL');
    expect(story.factIds).toContain(skill.id);
    expect((await interviews.stories(p)).items).toHaveLength(1);
    expect(await states(p)).toEqual(['committed', 'committed']);

    const other = await person('interview-other');
    const hidden = await interviews.get(other, session.id).catch((error: unknown) => error);
    expect(isBillingError(hidden, 'permission_denied')).toBe(true);
    expect((await interviews.list(other)).items).toEqual([]);
    expect((await interviews.stories(other)).items).toEqual([]);
  });

  it('releases the session when the model does not return a usable fact id', async () => {
    const p = await person('interview-bad');
    await db.pool.query(`UPDATE billing_accounts SET plan_id = 'starter' WHERE id = $1`, [p.billingAccountId]);
    await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const opportunityId = await listing('SQL analyst', 'Must know COBOL.');
    model.once(INTERVIEW_TEMPLATE, JSON.stringify({ factIds: ['not-a-fact'], question: 'COBOL expert who raised 50 million' }));
    const failed = await interviews.start(p, { opportunityId, stage: 'recruiter' }, 'bad').catch((error: unknown) => error);
    expect(isBillingError(failed, 'provider_unavailable')).toBe(true);
    expect(await states(p)).toEqual(['released']);
    expect((await interviews.list(p)).items).toEqual([]);
    expect(JSON.stringify((await interviews.list(p)).items)).not.toContain('COBOL');
    expect(JSON.stringify((await interviews.list(p)).items)).not.toContain('50 million');
  });
});
