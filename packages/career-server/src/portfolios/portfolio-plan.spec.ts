import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import { EvidenceService } from '../evidence/evidence.service';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService, type Principal } from '../identity/identity.service';
import { TestClock } from '../testing/billing-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { PortfolioService } from './portfolio.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-11-14T10:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('PortfolioService: links, sections and plan limits', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let portfolios: PortfolioService;
  let evidence: EvidenceService;

  beforeAll(async () => {
    db = await createTestDatabase('portfolio_plan');
    clock = new TestClock('2026-11-14T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    await db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('portfolioPages', true), ('evidenceItems', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    portfolios = new PortfolioService(db.pool, clock);
    evidence = new EvidenceService(db.pool, undefined, undefined, { clock });
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string, plan: string): Promise<Principal> {
    const principal = await identities.principal(identity(uid));
    await db.pool.query(`UPDATE billing_accounts SET plan_id = $2 WHERE id = $1`, [principal.billingAccountId, plan]);
    return principal;
  }

  it('keeps the private link when a private page is published again; revoke replaces it', async () => {
    const owner = await person('pf-token', 'starter');
    const page = await portfolios.create(owner, { title: 'Work' });
    const first = await portfolios.publish(owner, page.id, 'private');
    const again = await portfolios.publish(owner, page.id, 'private');
    expect(again.shareToken).toBe(first.shareToken);
    const revoked = await portfolios.revoke(owner, page.id);
    expect(revoked.shareToken).not.toBe(first.shareToken);
    await expect(portfolios.readPublic(page.slug, first.shareToken)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('serves selected sections and case studies, never unredacted confidential items', async () => {
    const owner = await person('pf-sections', 'starter');
    const open = await evidence.create(owner, { title: 'Open project', evidenceType: 'project', linkedSkills: ['SQL'], isPortfolioShared: true });
    const secret = await evidence.create(owner, { title: 'Client work', evidenceType: 'work_sample', linkedSkills: ['Excel'], confidential: true });
    // Defence in depth: even a row marked shared without a redaction confirmation stays off the page.
    await db.pool.query('UPDATE career_evidence SET is_portfolio_shared = true WHERE id = $1', [secret.id]);
    const page = await portfolios.create(owner, { title: 'Work', headline: 'Analyst' });
    await portfolios.update(owner, page.id, {
      evidenceIds: [open.id, secret.id],
      caseStudies: { [open.id]: 'Cut report time in half.' },
      showEmail: true,
      contactEmail: 'me@example.test',
    });
    const outside = await portfolios.update(owner, page.id, { caseStudies: { '00000000-0000-4000-8000-000000000001': 'x' } }).catch((e: unknown) => e);
    expect(isBillingError(outside, 'validation_error')).toBe(true);
    await portfolios.publish(owner, page.id, 'public');
    const shown = await portfolios.readPublic(page.slug);
    expect(shown.items.map((item) => item.title)).toEqual(['Open project']);
    expect(shown.items[0].caseStudy).toBe('Cut report time in half.');
    expect(shown.skills).toEqual(['SQL']);
    expect(shown.contactEmail).toBe('me@example.test');

    // Re-saving the item list keeps the case study of an item that stays.
    await portfolios.update(owner, page.id, { evidenceIds: [open.id] });
    const updated = await portfolios.update(owner, page.id, { sections: { contact: false, skills: false, summary: false } });
    expect(updated.caseStudies).toEqual({ [open.id]: 'Cut report time in half.' });
    const trimmed = await portfolios.readPublic(page.slug);
    expect(trimmed).toMatchObject({ headline: '', skills: [], contactEmail: null });
    expect(trimmed.items).toHaveLength(1);
  });

  it('stops serving pages the plan no longer covers after a downgrade, without deleting them', async () => {
    const owner = await person('pf-downgrade', 'career_pro');
    const pages = [];
    for (const title of ['One', 'Two', 'Three']) {
      const page = await portfolios.create(owner, { title });
      clock.set(new Date(clock.now().getTime() + 1000).toISOString());
      pages.push(await portfolios.publish(owner, page.id, 'public'));
    }
    for (const page of pages) await expect(portfolios.readPublic(page.slug)).resolves.toMatchObject({ title: page.title });

    await db.pool.query(`UPDATE billing_accounts SET plan_id = 'starter' WHERE id = $1`, [owner.billingAccountId]);
    await expect(portfolios.readPublic(pages[0].slug)).resolves.toMatchObject({ title: 'One' });
    await expect(portfolios.readPublic(pages[1].slug)).rejects.toMatchObject({ code: 'not_found' });
    await expect(portfolios.readPublic(pages[2].slug)).rejects.toMatchObject({ code: 'not_found' });

    await db.pool.query(`UPDATE billing_accounts SET plan_id = 'free' WHERE id = $1`, [owner.billingAccountId]);
    await expect(portfolios.readPublic(pages[0].slug)).rejects.toMatchObject({ code: 'not_found' });
    const kept = await db.pool.query(`SELECT count(*)::int AS n FROM portfolios WHERE candidate_auth_user_id = 'pf-downgrade'`);
    expect(kept.rows[0].n).toBe(3);
  });
});
