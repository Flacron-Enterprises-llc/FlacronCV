import request from 'supertest';
import { randomUUID } from 'crypto';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';
import { openBalances, readAccount } from '@flacroncv/career-server/src/billing/accounts';
import { CatalogStore } from '@flacroncv/career-server/src/billing/catalog';

describe('skills and learning over HTTP (CV13)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_learning');
    // Ensure the Phase 2 skillReports flags are enabled
    await t.db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('skillReports', true), ('projectBriefInSkillReport', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/learning/skill-reports')).status).toBe(401);
    expect((await http().post('/api/career/v1/learning/skill-reports').send({})).status).toBe(401);
  });

  it('runs the full skills gap and learning plan workflow over HTTP', async () => {
    const auth = bearer('http-learning-user');

    // 1. Initial profile call creates user & account on Free
    const meRes = await http().get('/api/career/v1/me').set('Authorization', auth);
    expect(meRes.status).toBe(200);

    // 2. Add confirmed fact to profile
    const factRes = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({
        factType: 'skill',
        value: { name: 'Distributed Systems & PostgreSQL' },
      });
    expect(factRes.status).toBe(201);
    const confirmRes = await http()
      .post(`/api/career/v1/facts/${factRes.body.id}/confirm`)
      .set('Authorization', auth);
    expect(confirmRes.status).toBe(200);

    // 3. Upgrade account to Starter so skillReports is included (1 report/mo)
    const billingAccountRes = await t.db.pool.query<{ id: string }>(
      `SELECT id FROM billing_accounts WHERE workspace_id = $1`,
      [meRes.body.workspaceId],
    );
    const billingAccountId = billingAccountRes.rows[0].id;

    await t.db.pool.query(
      `UPDATE billing_accounts SET plan_id = 'starter' WHERE id = $1`,
      [billingAccountId],
    );
    const acc = await readAccount(t.db.pool, billingAccountId);
    const snapshot = await new CatalogStore().get(t.db.pool, acc.catalog_version);
    await openBalances(t.db.pool, acc, snapshot, { regrant: true });

    // 4. Check initial list
    const initialList = await http()
      .get('/api/career/v1/learning/skill-reports')
      .set('Authorization', auth);
    expect(initialList.status).toBe(200);
    expect(initialList.body.items).toHaveLength(0);
    expect(initialList.body.skillReport.includedRemaining).toBe(1);

    // 5. Generate a skill gap report
    const key = randomUUID();
    const createRes = await http()
      .post('/api/career/v1/learning/skill-reports')
      .set('Authorization', auth)
      .set('Idempotency-Key', key)
      .send({
        targetRole: 'Staff Distributed Systems Engineer',
        timeBudgetHoursPerWeek: 10,
        financialBudgetCents: 5000,
        includeProjectBrief: true,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.replayed).toBe(false);
    expect(createRes.body.usage.unit).toBe('skill_report');
    expect(createRes.body.usage.includedRemaining).toBe(0);

    const report = createRes.body.report;
    expect(report.id).toBeDefined();
    expect(report.targetRole).toBe('Staff Distributed Systems Engineer');
    expect(report.skillGaps.length).toBeGreaterThan(0);
    expect(report.learningPlan.length).toBeGreaterThan(0);
    expect(report.projectBrief).not.toBeNull();
    expect(report.projectBrief.rubrics.length).toBe(3);
    expect(report.progress.percent).toBe(0);

    const milestoneId = report.learningPlan[0].id;

    // 6. Toggle milestone completion
    const patchRes = await http()
      .patch(`/api/career/v1/learning/skill-reports/${report.id}/milestones/${milestoneId}`)
      .set('Authorization', auth)
      .send({ completed: true });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.progress.completedMilestoneIds).toContain(milestoneId);
    expect(patchRes.body.progress.percent).toBeGreaterThan(0);

    // 7. Convert completed milestone to Career Evidence
    const evRes = await http()
      .post(`/api/career/v1/learning/skill-reports/${report.id}/milestones/${milestoneId}/evidence`)
      .set('Authorization', auth);

    expect(evRes.status).toBe(201);
    expect(evRes.body.evidenceId).toBeDefined();

    // Verify evidence exists in Evidence Vault
    const evidenceListRes = await http()
      .get('/api/career/v1/evidence')
      .set('Authorization', auth);
    expect(evidenceListRes.status).toBe(200);
    expect(evidenceListRes.body.items.some((e: any) => e.id === evRes.body.evidenceId)).toBe(true);

    // 8. Replay with same idempotency key returns identical report
    const replayRes = await http()
      .post('/api/career/v1/learning/skill-reports')
      .set('Authorization', auth)
      .set('Idempotency-Key', key)
      .send({
        targetRole: 'Staff Distributed Systems Engineer',
        timeBudgetHoursPerWeek: 10,
        financialBudgetCents: 5000,
        includeProjectBrief: true,
      });

    expect(replayRes.status).toBe(201);
    expect(replayRes.body.replayed).toBe(true);
    expect(replayRes.body.report.id).toBe(report.id);
  });
});
