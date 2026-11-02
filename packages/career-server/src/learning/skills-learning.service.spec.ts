import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { openBalances, readAccount } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService, type Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { createTestDatabase, TestClock, TestDatabase } from '../testing';
import { SkillsLearningService } from './skills-learning.service';

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

describe('CV13: SkillsLearningService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let metering: MeteringService;
  let service: SkillsLearningService;
  let ada: Principal;
  let other: Principal;

  beforeAll(async () => {
    db = await createTestDatabase('skills_learning');
    clock = new TestClock('2026-10-17T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    ada = await identities.principal(identity('ada-learning'));
    other = await identities.principal(identity('other-learning'));

    metering = new MeteringService(db.pool, clock);
    service = new SkillsLearningService(db.pool, metering);

    // Set ada to Starter plan (1 skill report / mo included)
    await setPlan(ada, 'starter');
    // Set other to Starter plan
    await setPlan(other, 'starter');

    // Seed confirmed skills for ada
    await db.pool.query(
      `INSERT INTO career_facts
         (workspace_id, candidate_auth_user_id, fact_type, value, confirmation, confirmed_at, source)
       VALUES
         ($1, $2, 'skill', '{"name": "System Design"}'::jsonb, 'confirmed', now(), 'manual')`,
      [ada.workspaceId, ada.authUserId],
    );
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function setPlan(principal: Principal, planId: 'free' | 'starter' | 'professional') {
    await db.pool.query(`UPDATE billing_accounts SET plan_id = $1 WHERE id = $2`, [
      planId,
      principal.billingAccountId,
    ]);
    const acc = await readAccount(db.pool, principal.billingAccountId);
    const snapshot = await new CatalogStore().get(db.pool, acc.catalog_version);
    await openBalances(db.pool, acc, snapshot, { regrant: true });
  }

  it('lists empty reports initially and shows remaining skill_report allowance', async () => {
    const list = await service.list(ada);
    expect(list.items).toEqual([]);
    expect(list.skillReport.includedRemaining).toBe(1);
    expect(list.skillReport.packRemaining).toBe(0);
  });

  it('requires a non-empty targetRole with validation_error', async () => {
    const err = await service.create(ada, { targetRole: '' }, 'idem-1').catch((e) => e);
    expect(isBillingError(err, 'validation_error')).toBe(true);
    if (isBillingError(err)) expect(err.details).toMatchObject({ field: 'targetRole' });
  });

  it('generates a skill gap report, debits exactly 1 skill_report unit, and includes project brief without extra debit', async () => {
    const res = await service.create(
      ada,
      {
        targetRole: 'Staff Distributed Systems Engineer',
        timeBudgetHoursPerWeek: 10,
        financialBudgetCents: 10000,
        includeProjectBrief: true,
      },
      'idem-create-1',
    );

    expect(res.replayed).toBe(false);
    expect(res.usage.unit).toBe('skill_report');
    expect(res.usage.includedRemaining).toBe(0); // 1 - 1 = 0

    const report = res.result.report;
    expect(report.targetRole).toBe('Staff Distributed Systems Engineer');
    expect(report.skillGaps.length).toBeGreaterThan(0);
    expect(report.learningPlan.length).toBeGreaterThan(0);
    expect(report.projectBrief).not.toBeNull();
    expect(report.projectBrief?.rubrics.length).toBe(3);
    expect(report.progress.percent).toBe(0);

    // Verify System Design is marked intermediate because of confirmed career fact
    const sysDesign = report.skillGaps.find((g) => g.skill === 'System Design');
    expect(sysDesign?.currentLevel).toBe('intermediate');
  });

  it('replaying the same idempotency key returns the cached report without re-debiting', async () => {
    const res = await service.create(
      ada,
      {
        targetRole: 'Staff Distributed Systems Engineer',
        timeBudgetHoursPerWeek: 10,
        financialBudgetCents: 10000,
        includeProjectBrief: true,
      },
      'idem-create-1',
    );

    expect(res.replayed).toBe(true);
    expect(res.usage.includedRemaining).toBe(0);
  });

  it('rejects reusing the same idempotency key with different payload', async () => {
    const err = await service.create(
      ada,
      {
        targetRole: 'Senior Cloud Architect',
      },
      'idem-create-1',
    ).catch((e) => e);

    expect(isBillingError(err, 'idempotency_mismatch')).toBe(true);
  });

  it('rejects generation when quota is exhausted', async () => {
    const err = await service.create(
      ada,
      {
        targetRole: 'Principal Cloud Architect',
      },
      'idem-exhausted',
    ).catch((e) => e);

    expect(isBillingError(err, 'quota_exhausted')).toBe(true);
  });

  it('updates progress in-place without debiting credits', async () => {
    const list = await service.list(ada);
    const report = list.items[0];
    const milestoneId = report.learningPlan[0].id;

    const updated = await service.updateProgress(ada, report.id, milestoneId, true);
    expect(updated.progress.completedMilestoneIds).toContain(milestoneId);
    expect(updated.progress.percent).toBeGreaterThan(0);

    // Untoggle
    const untoggled = await service.updateProgress(ada, report.id, milestoneId, false);
    expect(untoggled.progress.completedMilestoneIds).not.toContain(milestoneId);
    expect(untoggled.progress.percent).toBe(0);
  });

  it('converts a completed milestone into a career evidence vault record', async () => {
    const list = await service.list(ada);
    const report = list.items[0];
    const milestoneId = report.learningPlan[0].id;

    const ev = await service.convertToEvidence(ada, report.id, milestoneId);
    expect(ev.evidenceId).toBeDefined();

    // Verify row exists in career_evidence
    const row = await db.pool.query(
      `SELECT title, evidence_type, linked_skills FROM career_evidence WHERE id = $1`,
      [ev.evidenceId],
    );
    expect(row.rows[0].evidence_type).toBe('project');
    expect(row.rows[0].linked_skills).toContain('System Design');
  });

  it('enforces tenant and candidate isolation on get and update', async () => {
    const list = await service.list(ada);
    const reportId = list.items[0].id;

    await expect(service.get(other, reportId)).rejects.toMatchObject({
      code: 'permission_denied',
    });

    await expect(
      service.updateProgress(other, reportId, 'm-1', true),
    ).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });
});
