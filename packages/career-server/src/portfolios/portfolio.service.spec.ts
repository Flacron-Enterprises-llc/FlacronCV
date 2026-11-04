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
  const at = new Date('2026-10-18T10:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('PortfolioService (CV16)', () => {
  let db: TestDatabase;
  let identities: IdentityService;
  let portfolios: PortfolioService;
  let evidence: EvidenceService;

  beforeAll(async () => {
    db = await createTestDatabase('portfolios');
    const clock = new TestClock('2026-10-18T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    await db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('portfolioPages', true), ('evidenceItems', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    portfolios = new PortfolioService(db.pool, clock);
    evidence = new EvidenceService(db.pool);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string, plan?: 'starter' | 'career_pro'): Promise<Principal> {
    const principal = await identities.principal(identity(uid));
    if (plan) {
      await db.pool.query(`UPDATE billing_accounts SET plan_id = $2 WHERE id = $1`, [principal.billingAccountId, plan]);
    }
    return principal;
  }

  it('refuses a public page on the free plan', async () => {
    const free = await person('free-portfolio');
    try {
      await portfolios.create(free, { title: 'Free page' });
      throw new Error('expected plan_upgrade_required');
    } catch (error) {
      expect(isBillingError(error, 'plan_upgrade_required')).toBe(true);
    }
  });

  it('publishes, hides contact and files, and unpublishes', async () => {
    const owner = await person('starter-portfolio', 'starter');
    const other = await person('other-portfolio', 'starter');
    const item = await evidence.create(owner, {
      title: 'Compiler',
      evidenceType: 'project',
      description: 'A small compiler.',
      attachmentUrl: 'https://example.test/secret.pdf',
      attachmentName: 'secret.pdf',
      // Only evidence marked "share on portfolio" is ever public (see the public-view filter).
      isPortfolioShared: true,
    });
    const page = await portfolios.create(owner, { title: 'Ada page', displayName: 'Ada Lovelace', headline: 'Selected work' });
    const slug = page.slug;
    const linked = await portfolios.update(owner, page.id, {
      displayName: 'Ada King',
      evidenceIds: [item.id],
      contactEmail: 'ada@example.test',
      showEmail: false,
    });
    expect(linked.slug).toBe(slug);
    expect(linked.displayName).toBe('Ada King');

    try {
      await portfolios.update(other, page.id, { title: 'Taken' });
      throw new Error('expected permission_denied');
    } catch (error) {
      expect(isBillingError(error, 'permission_denied')).toBe(true);
    }

    const published = await portfolios.publish(owner, page.id, 'public');
    expect(published.visibility).toBe('public');
    const view = await portfolios.readPublic(slug);
    expect(view.displayName).toBe('Ada King');
    expect(view.contactEmail).toBeNull();
    expect(JSON.stringify(view)).not.toContain('secret.pdf');
    expect(view.items[0]?.title).toBe('Compiler');
    const again = await portfolios.readPublic(slug);
    expect(again.slug).toBe(slug);
    const refreshed = await portfolios.get(owner, page.id);
    expect(refreshed.visitCount).toBe(2);
    expect(refreshed.slug).toBe(slug);

    const qr = await portfolios.qr(owner, page.id, 'https://flacroncv.test');
    expect(qr.path).toBe(`/en/portfolio/${slug}`);
    expect(qr.path).not.toContain('Ada');
    expect(qr.svg).toContain('<svg');

    await portfolios.unpublish(owner, page.id);
    try {
      await portfolios.readPublic(slug);
      throw new Error('expected not_found');
    } catch (error) {
      expect(isBillingError(error, 'not_found')).toBe(true);
    }
  });

  it('replaces a private link and rejects the old token', async () => {
    const owner = await person('private-portfolio', 'starter');
    const page = await portfolios.create(owner, { title: 'Private page' });
    const shared = await portfolios.publish(owner, page.id, 'private');
    expect(shared.shareToken).toBeTruthy();
    const view = await portfolios.readPublic(page.slug, shared.shareToken);
    expect(view.title).toBe('Private page');
    try {
      await portfolios.readPublic(page.slug);
      throw new Error('expected not_found');
    } catch (error) {
      expect(isBillingError(error, 'not_found')).toBe(true);
    }
    const rotated = await portfolios.revoke(owner, page.id);
    expect(rotated.shareToken).not.toBe(shared.shareToken);
    try {
      await portfolios.readPublic(page.slug, shared.shareToken);
      throw new Error('expected not_found');
    } catch (error) {
      expect(isBillingError(error, 'not_found')).toBe(true);
    }
    const next = await portfolios.readPublic(page.slug, rotated.shareToken);
    expect(next.title).toBe('Private page');
  });

  it('stops at the career pro page cap', async () => {
    const owner = await person('cap-portfolio', 'career_pro');
    await portfolios.create(owner, { title: 'One' });
    await portfolios.create(owner, { title: 'Two' });
    await portfolios.create(owner, { title: 'Three' });
    try {
      await portfolios.create(owner, { title: 'Four' });
      throw new Error('expected capacity_exceeded');
    } catch (error) {
      expect(isBillingError(error, 'capacity_exceeded')).toBe(true);
    }
  });
});
