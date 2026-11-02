import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { ApplicationService } from './application.service';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { OpportunityService } from '../opportunities/opportunity.service';
import { ResumeStudioService } from '../resumes/resume.service';
import { TestClock } from '../testing/billing-fixture';
import { FakeTextModel } from '../testing/fake-ai';
import { createTestDatabase, TestDatabase } from '../testing/test-database';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('ApplicationService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let opportunities: OpportunityService;
  let resumes: ResumeStudioService;
  let applications: ApplicationService;

  beforeAll(async () => {
    db = await createTestDatabase('applications');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  beforeEach(() => {
    const model = new FakeTextModel();
    opportunities = new OpportunityService(db.pool, clock);
    resumes = new ResumeStudioService(db.pool, model, new MeteringService(db.pool, clock));
    applications = new ApplicationService(db.pool, clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  it('copies the listing once, moves the stage without a ledger row, and writes a calendar file', async () => {
    const p = await person('app-ada');
    const other = await person('app-other');
    const resume = await resumes.create(p, { title: 'Ada', language: 'en' });
    const listing = await opportunities.paste(p, {
      text: 'SQL analyst\nKeep the ledger. Pay was not written.',
      sourceUrl: 'https://example.test/sql',
    });
    const created = await applications.create(p, { opportunityId: listing.id, resumeVersionId: resume.version.id });
    expect(created.status).toBe('saved');
    expect(created.snapshot.title).toBe('SQL analyst');
    expect(created.snapshot.description).toContain('not written');
    expect(created.snapshot.organization).toBeNull();
    expect(created.resumeVersionId).toBe(resume.version.id);

    const again = await applications.create(p, { opportunityId: listing.id, resumeVersionId: resume.version.id });
    expect(again.id).toBe(created.id);
    expect((await applications.list(p)).items).toHaveLength(1);

    const moved = await applications.update(p, created.id, {
      status: 'applied',
      notes: 'Sent on Tuesday',
      contacts: [{ name: 'Ada Lovelace', email: 'ada@example.test', phone: null }],
      dates: { applied: '2026-10-17' },
      checklist: [{ label: 'Portfolio', done: false }],
    });
    expect(moved.id).toBe(created.id);
    expect(moved.status).toBe('applied');
    expect(moved.notes).toBe('Sent on Tuesday');
    expect(moved.checklist).toEqual([{ label: 'Portfolio', done: false }]);
    expect(moved.snapshot.description).toContain('not written');

    const badDay = await applications.update(p, created.id, { dates: { applied: '2026-02-31' } }).catch((error: unknown) => error);
    expect(isBillingError(badDay, 'validation_error')).toBe(true);
    if (isBillingError(badDay)) expect(badDay.details).toMatchObject({ field: 'applied', reason: 'invalid' });

    const past = await applications.remind(p, created.id, { remindAt: '2020-01-01T00:00:00Z' }).catch((error: unknown) => error);
    expect(isBillingError(past, 'validation_error')).toBe(true);
    const reminder = await applications.remind(p, created.id, { remindAt: '2026-10-20T09:00:00Z' });
    const file = await applications.calendar(p, created.id);
    expect(file.body).toContain('BEGIN:VCALENDAR');
    expect(file.body).toContain('SUMMARY:SQL analyst');
    expect(file.body).toContain(reminder.id);
    expect(file.body).not.toContain('hiring');

    const denied = await applications.get(other, created.id).catch((error: unknown) => error);
    expect(isBillingError(denied, 'permission_denied')).toBe(true);
    const ledger = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1`,
      [p.billingAccountId],
    );
    expect(ledger.rows[0]?.n).toBe(0);
  });

  it('stops at the Free application cap and leaves the saved ones', async () => {
    const p = await person('app-full');
    const resume = await resumes.create(p, { title: 'Full', language: 'en' });
    let lastId = '';
    for (let index = 0; index < 25; index += 1) {
      const listing = await opportunities.paste(p, { text: `Role ${index}\nA vacancy.` });
      const saved = await applications.create(p, { opportunityId: listing.id, resumeVersionId: resume.version.id });
      lastId = saved.id;
    }
    const extra = await opportunities.paste(p, { text: 'Role overflow\nA vacancy.' });
    const refused = await applications
      .create(p, { opportunityId: extra.id, resumeVersionId: resume.version.id })
      .catch((error: unknown) => error);
    expect(isBillingError(refused, 'capacity_exceeded')).toBe(true);
    if (isBillingError(refused)) expect(refused.details).toMatchObject({ field: 'trackedApplications', limit: 25 });
    expect((await applications.list(p)).items).toHaveLength(25);
    const moved = await applications.update(p, lastId, { status: 'withdrawn' });
    expect(moved.status).toBe('withdrawn');
  });
});
