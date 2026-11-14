import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { openBalances, readAccount } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService, type Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { createTestDatabase, TestClock, TestDatabase } from '../testing';
import { UnconfiguredTextModel } from '../ai/text-model';
import { FakeTextModel } from '../testing/fake-ai';
import { LEARNING_PLAN_TEMPLATE } from './learning-plan-compose';
import { SkillsLearningService } from './skills-learning.service';

/** A plan for the role named in the prompt, as a model would reply. */
function planReply(request: { prompt: string }): string {
  const prompt = JSON.parse(request.prompt) as { targetRole: string };
  return JSON.stringify({
    requirements: [
      { skill: 'System Design', importance: 'critical', requiredLevel: 'advanced' },
      { skill: 'Kubernetes', importance: 'preferred', requiredLevel: 'intermediate' },
      { skill: 'Incident Response', importance: 'optional', requiredLevel: 'intermediate' },
    ],
    milestones: [
      {
        title: 'Container orchestration',
        description: `Run a small service on Kubernetes as a ${prompt.targetRole} would.`,
        targetSkill: 'Kubernetes',
        estimatedHours: 12,
        estimatedCostCents: 0,
        resources: [{ title: 'Kubernetes Basics', provider: 'kubernetes.io', type: 'documentation', isFree: true, url: 'https://invented.example' }],
      },
    ],
    projectBrief: {
      title: 'Resilient service',
      summary: 'Deploy and observe a service.',
      requirements: ['Deploy with health checks'],
      deliverables: ['Repository with a README'],
      rubrics: [
        { name: 'Deployment', description: 'Deploys cleanly.', weight: 2, evidenceType: 'project' },
        { name: 'Recovery', description: 'Recovers from a killed pod.', weight: 1, evidenceType: 'project' },
        { name: 'Write-up', description: 'Explains the choices.', weight: 1, evidenceType: 'work_sample' },
      ],
      estimatedHours: 20,
    },
  });
}

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
  let model: FakeTextModel;
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
    model = new FakeTextModel().always(LEARNING_PLAN_TEMPLATE, planReply);
    service = new SkillsLearningService(db.pool, metering, model);

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

  it('releases the credit and saves nothing when no model is available', async () => {
    const offline = new SkillsLearningService(db.pool, metering, new UnconfiguredTextModel());
    const err = await offline.create(ada, { targetRole: 'Nurse' }, 'idem-offline').catch((e) => e);
    expect(isBillingError(err, 'provider_unavailable')).toBe(true);
    if (isBillingError(err)) expect(err.details).toMatchObject({ released: true });
    const list = await service.list(ada);
    expect(list.items).toEqual([]);
    expect(list.skillReport.includedRemaining).toBe(1);
  });

  it('releases the credit when the reply is not a usable plan', async () => {
    model.once(LEARNING_PLAN_TEMPLATE, JSON.stringify({ requirements: [{ skill: 'Typing' }], milestones: [] }));
    const err = await service.create(ada, { targetRole: 'Nurse' }, 'idem-unusable').catch((e) => e);
    expect(isBillingError(err, 'provider_unavailable')).toBe(true);
    expect((await service.list(ada)).skillReport.includedRemaining).toBe(1);
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

    // The current level comes from the confirmed fact, not from the model.
    const sysDesign = report.skillGaps.find((g) => g.skill === 'System Design');
    expect(sysDesign?.currentLevel).toBe('intermediate');
    expect(report.skillGaps.find((g) => g.skill === 'Kubernetes')?.currentLevel).toBe('none');
    // The plan is for the requested role, and model links are not kept.
    expect(report.learningPlan[0].description).toContain('Staff Distributed Systems Engineer');
    expect(report.learningPlan[0].resources[0].url).toBe('');
    expect(report.projectBrief?.rubrics.reduce((sum, r) => sum + r.weight, 0)).toBe(100);
    expect(model.callsFor(LEARNING_PLAN_TEMPLATE).at(-1)?.prompt).toContain('System Design');
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
    expect(row.rows[0].linked_skills).toContain('Kubernetes');
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
