import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { TestClock } from '../testing/billing-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { EvidenceService } from './evidence.service';

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

describe('EvidenceService (CV11)', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let evidenceService: EvidenceService;
  let ada: Principal;
  let charles: Principal;

  beforeAll(async () => {
    db = await createTestDatabase('evidence');
    clock = new TestClock('2026-10-17T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    ada = await identities.principal(identity('ada-evidence'));
    charles = await identities.principal(identity('charles-evidence'));
    evidenceService = new EvidenceService(db.pool);
  });

  afterAll(async () => {
    await db.drop();
  });

  it('rejects creation when feature flag is off', async () => {
    // Phase 2 feature is off by default
    await expect(
      evidenceService.create(ada, {
        title: 'Analytical Engine QA Test Suite',
        evidenceType: 'project',
      }),
    ).rejects.toMatchObject({
      code: 'feature_unavailable',
      details: { feature: 'evidenceItems' },
    });
  });

  describe('with evidenceItems feature flag enabled', () => {
    beforeAll(async () => {
      await db.pool.query(
        `INSERT INTO feature_flags (feature, enabled) VALUES ('evidenceItems', true)
         ON CONFLICT (feature) DO UPDATE SET enabled = true`,
      );
    });

    it('rejects invalid title and invalid evidence type', async () => {
      await expect(
        evidenceService.create(ada, {
          title: '',
          evidenceType: 'project',
        }),
      ).rejects.toMatchObject({
        code: 'validation_error',
        details: { field: 'title' },
      });

      await expect(
        evidenceService.create(ada, {
          title: 'Valid Title',
          evidenceType: 'invalid_type' as any,
        }),
      ).rejects.toMatchObject({
        code: 'validation_error',
        details: { field: 'evidenceType' },
      });
    });

    it('creates evidence items with truthful default labels and enforces Free capacity of 3 items', async () => {
      // 1st item: without attachment -> self_reported
      const item1 = await evidenceService.create(ada, {
        title: 'Project 1: Abacus Optimization',
        description: 'First computational model',
        evidenceType: 'project',
        ownershipStatement: 'Sole architect',
        linkedSkills: ['Math', 'Algorithms'],
      });
      expect(item1.evidenceLabel).toBe('self_reported');
      expect(item1.linkedSkills).toEqual(['Math', 'Algorithms']);

      // 2nd item: credential with attachment -> evidence_attached
      const item2 = await evidenceService.create(ada, {
        title: 'AWS Certified Solutions Architect',
        evidenceType: 'credential',
        attachmentUrl: 'https://example.test/cert.pdf',
        attachmentName: 'cert.pdf',
      });
      expect(item2.evidenceLabel).toBe('evidence_attached');

      // 3rd item: reference without attachment -> self_reported (never reference_confirmed without verification)
      const item3 = await evidenceService.create(ada, {
        title: 'Reference from Charles Babbage',
        evidenceType: 'reference',
      });
      expect(item3.evidenceLabel).toBe('self_reported');

      // Ada is on Free (capacity limit = 3 items). 4th item must fail with capacity_exceeded
      await expect(
        evidenceService.create(ada, {
          title: '4th Project Exceeding Capacity',
          evidenceType: 'project',
        }),
      ).rejects.toMatchObject({
        code: 'capacity_exceeded',
        details: { field: 'evidenceItems', limit: 3, used: 3 },
      });
    });

    it('updates an evidence item and upgrades label when attachment is added', async () => {
      const list = await evidenceService.list(ada);
      expect(list.items.length).toBe(3);
      const projectItem = list.items.find((i) => i.title.includes('Project 1'))!;
      expect(projectItem.evidenceLabel).toBe('self_reported');

      const updated = await evidenceService.update(ada, projectItem.id, {
        attachmentUrl: 'https://example.test/github-repo-archive.zip',
        attachmentName: 'repo.zip',
        ownershipStatement: 'Lead developer and author',
        isPortfolioShared: true,
      });

      expect(updated.evidenceLabel).toBe('evidence_attached');
      expect(updated.isPortfolioShared).toBe(true);
      expect(updated.ownershipStatement).toBe('Lead developer and author');
    });

    it('deletes an item and frees capacity for a new item', async () => {
      const list = await evidenceService.list(ada);
      const itemToDelete = list.items[0]!;

      await evidenceService.delete(ada, itemToDelete.id);

      const afterDelete = await evidenceService.list(ada);
      expect(afterDelete.items.length).toBe(2);

      // Ada can now create a 3rd item again
      const newItem = await evidenceService.create(ada, {
        title: 'Replacement Project within Capacity',
        evidenceType: 'project',
      });
      expect(newItem.title).toBe('Replacement Project within Capacity');
    });

    it('enforces tenant and user isolation: cannot read, update or delete another users item', async () => {
      const list = await evidenceService.list(ada);
      const adasItem = list.items[0]!;

      // Charles cannot get Ada's item
      await expect(evidenceService.get(charles, adasItem.id)).rejects.toMatchObject({
        code: 'permission_denied',
      });

      // Charles cannot update Ada's item
      await expect(
        evidenceService.update(charles, adasItem.id, { title: 'Hacked Title' }),
      ).rejects.toMatchObject({
        code: 'permission_denied',
      });

      // Charles cannot delete Ada's item
      await expect(evidenceService.delete(charles, adasItem.id)).rejects.toMatchObject({
        code: 'permission_denied',
      });
    });

    it('reading and updating evidence writes zero usage_ledger entries', async () => {
      const ledgerBefore = await db.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM usage_ledger WHERE candidate_auth_user_id = $1`,
        [ada.authUserId],
      );

      const items = await evidenceService.list(ada);
      await evidenceService.get(ada, items.items[0]!.id);
      await evidenceService.update(ada, items.items[0]!.id, { description: 'No charge edit' });

      const ledgerAfter = await db.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM usage_ledger WHERE candidate_auth_user_id = $1`,
        [ada.authUserId],
      );

      expect(ledgerAfter.rows[0]!.n).toBe(ledgerBefore.rows[0]!.n);
    });
  });
});
