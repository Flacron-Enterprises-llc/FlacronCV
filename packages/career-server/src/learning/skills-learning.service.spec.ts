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
      { skill: 'Cloud Certification', kind: 'credential', importance: 'critical', requiredLevel: 'intermediate' },
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
      {
        title: 'Cloud certification',
        description: 'Prepare for the associate exam.',
        targetSkill: 'Cloud Certification',
        estimatedHours: 30,
        estimatedCostCents: 15000,
        costAsOf: '2026-09',
        prerequisites: ['Basic networking'],
        resources: [],
      },
    ],
    bridgeRoles: [{ title: 'Site Reliability Engineer', reason: 'Builds on operations work.' }],
    transferableSkills: ['System Design', 'Juggling'],
    projectBrief: {
      title: 'Resilient service',
      summary: 'Deploy and observe a service.',
      ownershipStatement: 'Sole author / Primary contributor',
      steps: ['Write the service', 'Deploy it'],
      tools: ['kubectl'],
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

  async function setEvidenceSwitch(enabled: boolean) {
    await db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('evidenceItems', $1)
       ON CONFLICT (feature) DO UPDATE SET enabled = $1`,
      [enabled],
    );
  }

  it('lists empty reports initially and shows remaining skill_report allowance', async () => {
    const list = await service.list(ada);
    expect(list.items).toEqual([]);
    expect(list.skillReport.includedRemaining).toBe(1);
    expect(list.skillReport.packRemaining).toBe(0);
  });

  it('reads the project-brief entitlement from the catalog (Free: no, Starter: yes)', async () => {
    const free = await identities.principal(identity('brief-free'));
    await setPlan(free, 'free');
    const allowed = (owner: Principal) => (service as unknown as { projectBriefAllowed(o: Principal): Promise<boolean> }).projectBriefAllowed(owner);
    await expect(allowed(free)).resolves.toBe(false);
    await expect(allowed(ada)).resolves.toBe(true);
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

    // A cost with no stated date is unknown, never 0; a dated cost is kept
    // even above the budget (it is not capped to look affordable).
    expect(report.learningPlan[0].estimatedCostCents).toBeNull();
    expect(report.learningPlan[0].costAsOf).toBeNull();
    expect(report.learningPlan[1]).toMatchObject({ estimatedCostCents: 15000, costAsOf: '2026-09', prerequisites: ['Basic networking'] });
    expect(report.skillGaps.find((g) => g.skill === 'Cloud Certification')).toMatchObject({ kind: 'credential', importance: 'critical' });
    expect(report.skillGaps.find((g) => g.skill === 'Kubernetes')?.kind).toBe('skill');
    expect(report.bridgeRoles).toEqual([{ title: 'Site Reliability Engineer', reason: 'Builds on operations work.' }]);
    // Only a skill a confirmed fact shows is transferable, with that fact recorded.
    expect(report.transferableSkills).toHaveLength(1);
    expect(report.transferableSkills?.[0].skill).toBe('System Design');
    expect(report.transferableSkills?.[0].factIds).toHaveLength(1);
    // The model's ownership statement is dropped: only the person writes one.
    expect(report.projectBrief).toMatchObject({
      steps: ['Write the service', 'Deploy it'],
      tools: ['kubectl'],
      ownershipStatement: null,
      origin: 'ai_assisted',
      rubricCheck: null,
    });
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

  it('refuses to record a milestone that is not marked complete', async () => {
    const report = (await service.list(ada)).items[0];
    const err = await service.convertToEvidence(ada, report.id, report.learningPlan[0].id).catch((e) => e);
    expect(isBillingError(err, 'validation_error')).toBe(true);
    if (isBillingError(err)) expect(err.details).toMatchObject({ reason: 'not_completed' });
  });

  it('refuses while the Evidence Vault switch is off, and creates nothing', async () => {
    await setEvidenceSwitch(false);
    const report = (await service.list(ada)).items[0];
    const milestoneId = report.learningPlan[0].id;
    await service.updateProgress(ada, report.id, milestoneId, true);
    const err = await service.convertToEvidence(ada, report.id, milestoneId).catch((e) => e);
    expect(isBillingError(err, 'feature_unavailable')).toBe(true);
    const rows = await db.pool.query(`SELECT 1 FROM career_evidence WHERE candidate_auth_user_id = $1`, [ada.authUserId]);
    expect(rows.rowCount).toBe(0);
    expect((await service.get(ada, report.id)).progress.evidenceByMilestone).toEqual({});
  });

  it("records a completed milestone once, in the person's own words, and never as a credential", async () => {
    await setEvidenceSwitch(true);
    const report = (await service.list(ada)).items[0];
    const milestoneId = report.learningPlan[0].id;

    const ev = await service.convertToEvidence(ada, report.id, milestoneId, { ownershipStatement: 'I built this alone.' });
    expect(ev.created).toBe(true);
    const row = await db.pool.query(
      `SELECT evidence_type, linked_skills, ownership_statement, evidence_label FROM career_evidence WHERE id = $1`,
      [ev.evidenceId],
    );
    expect(row.rows[0].evidence_type).toBe('project');
    expect(row.rows[0].linked_skills).toContain('Kubernetes');
    expect(row.rows[0].ownership_statement).toBe('I built this alone.');
    expect(row.rows[0].evidence_label).toBe('self_reported');

    // A repeat (even after untick/retick) returns the same item instead of a duplicate.
    await service.updateProgress(ada, report.id, milestoneId, false);
    await service.updateProgress(ada, report.id, milestoneId, true);
    const again = await service.convertToEvidence(ada, report.id, milestoneId);
    expect(again).toEqual({ evidenceId: ev.evidenceId, created: false });
    const count = await db.pool.query(`SELECT 1 FROM career_evidence WHERE candidate_auth_user_id = $1`, [ada.authUserId]);
    expect(count.rowCount).toBe(1);

    // Deleted from the vault: recording it again makes a new item.
    await db.pool.query(`DELETE FROM career_evidence WHERE id = $1`, [ev.evidenceId]);
    const fresh = await service.convertToEvidence(ada, report.id, milestoneId);
    expect(fresh.created).toBe(true);
    expect(fresh.evidenceId).not.toBe(ev.evidenceId);
    const blank = await db.pool.query(`SELECT ownership_statement FROM career_evidence WHERE id = $1`, [fresh.evidenceId]);
    // Nothing is written for the person when they gave no statement.
    expect(blank.rows[0].ownership_statement).toBe('');
  });

  it('respects the Evidence Vault capacity of the plan', async () => {
    const free = await identities.principal(identity('free-capacity-learning'));
    await setPlan(free, 'free');
    const report = await db.pool.query<{ id: string }>(
      `INSERT INTO skill_gap_reports (workspace_id, candidate_auth_user_id, target_role, time_budget_hours_per_week,
         financial_budget_cents, skill_gaps, learning_plan, progress)
       VALUES ($1, $2, 'Analyst', 5, 0, '[]', $3, $4) RETURNING id`,
      [
        free.workspaceId,
        free.authUserId,
        JSON.stringify([{ id: 'milestone-1', title: 'SQL', description: 'Learn SQL.', targetSkill: 'SQL', estimatedHours: 4, estimatedCostCents: null, resources: [] }]),
        JSON.stringify({ completedMilestoneIds: ['milestone-1'], percent: 100 }),
      ],
    );
    for (let i = 0; i < 3; i += 1) {
      await db.pool.query(
        `INSERT INTO career_evidence (workspace_id, candidate_auth_user_id, title, description, evidence_type,
           ownership_statement, linked_skills, evidence_label, is_portfolio_shared)
         VALUES ($1, $2, $3, '', 'project', '', '[]', 'self_reported', false)`,
        [free.workspaceId, free.authUserId, `Item ${i}`],
      );
    }
    const err = await service.convertToEvidence(free, report.rows[0].id, 'milestone-1').catch((e) => e);
    expect(isBillingError(err, 'capacity_exceeded')).toBe(true);
    expect((await service.get(free, report.rows[0].id)).progress.evidenceByMilestone).toEqual({});
  });

  it('keeps the project ownership statement as the person wrote it and adds the project to the vault once', async () => {
    const report = (await service.list(ada)).items[0];
    expect(report.projectBrief?.ownershipStatement).toBeNull();
    expect(report.projectBrief?.origin).toBe('ai_assisted');

    const refused = await service.addProjectToEvidence(ada, report.id).catch((e) => e);
    expect(isBillingError(refused, 'validation_error')).toBe(true);
    if (isBillingError(refused)) expect(refused.details).toMatchObject({ field: 'ownershipStatement', reason: 'required' });
    const empty = await service.setOwnershipStatement(ada, report.id, '   ').catch((e) => e);
    expect(isBillingError(empty, 'validation_error')).toBe(true);

    const saved = await service.setOwnershipStatement(ada, report.id, '  I wrote all the code; a friend reviewed the README. ');
    expect(saved.projectBrief?.ownershipStatement).toBe('I wrote all the code; a friend reviewed the README.');

    const first = await service.addProjectToEvidence(ada, report.id);
    const second = await service.addProjectToEvidence(ada, report.id);
    expect(first.created).toBe(true);
    expect(second).toEqual({ evidenceId: first.evidenceId, created: false });
    const row = await db.pool.query(`SELECT ownership_statement, evidence_label FROM career_evidence WHERE id = $1`, [first.evidenceId]);
    expect(row.rows[0].ownership_statement).toBe('I wrote all the code; a friend reviewed the README.');
    expect(row.rows[0].evidence_label).toBe('self_reported');
  });

  it('saves a rubric self-check that references delivered evidence, without marking it assessed', async () => {
    const report = (await service.list(ada)).items[0];
    const brief = report.projectBrief!;
    const evidenceId = brief.evidenceId!;
    const criteria = brief.rubrics.map((rubric, i) => ({ criterionId: rubric.id, met: i === 0, note: i === 0 ? 'See the README.' : '' }));

    const missingOne = await service
      .saveRubricCheck(ada, report.id, { evidenceIds: [evidenceId], criteria: criteria.slice(1) })
      .catch((e) => e);
    expect(isBillingError(missingOne, 'validation_error')).toBe(true);
    const noEvidence = await service.saveRubricCheck(ada, report.id, { evidenceIds: [], criteria }).catch((e) => e);
    expect(isBillingError(noEvidence, 'validation_error')).toBe(true);
    const otherEvidence = await db.pool.query<{ id: string }>(
      `INSERT INTO career_evidence (workspace_id, candidate_auth_user_id, title, description, evidence_type,
         ownership_statement, linked_skills, evidence_label, is_portfolio_shared)
       VALUES ($1, $2, 'Not yours', '', 'project', '', '[]', 'self_reported', false) RETURNING id`,
      [other.workspaceId, other.authUserId],
    );
    const foreign = await service
      .saveRubricCheck(ada, report.id, { evidenceIds: [otherEvidence.rows[0].id], criteria })
      .catch((e) => e);
    expect(isBillingError(foreign, 'validation_error')).toBe(true);

    const checked = await service.saveRubricCheck(ada, report.id, { evidenceIds: [evidenceId], criteria });
    expect(checked.projectBrief?.rubricCheck).toMatchObject({
      assessment: 'self_check',
      evidenceIds: [evidenceId],
      criteria: [{ criterionId: brief.rubrics[0].id, met: true, note: 'See the README.' }, expect.anything(), expect.anything()],
    });
    const label = await db.pool.query(`SELECT evidence_label FROM career_evidence WHERE id = $1`, [evidenceId]);
    expect(label.rows[0].evidence_label).toBe('self_reported');
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
    await expect(service.setOwnershipStatement(other, reportId, 'Mine now')).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(service.addProjectToEvidence(other, reportId)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(service.convertToEvidence(other, reportId, 'milestone-1')).rejects.toMatchObject({ code: 'permission_denied' });
  });
});
