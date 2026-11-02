import request from 'supertest';
import { OpportunityService } from '@flacroncv/career-server';
import { bearer } from '@flacroncv/career-server/src/testing';
import { ADMIN_UIDS } from '../src/admin/admin.controller';
import { createTestApp, TestApp } from './support';

describe('opportunity trust signals and moderation over HTTP (CV15)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_opportunity_trust', {
      customize: (builder) => builder.overrideProvider(ADMIN_UIDS).useValue(new Set(['http-admin'])),
    });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().post('/api/career/v1/opportunities/11111111-1111-1111-1111-111111111111/report').send({})).status).toBe(401);
    expect((await http().get('/api/career/v1/opportunities/11111111-1111-1111-1111-111111111111/trust')).status).toBe(401);
    expect((await http().get('/api/career/v1/admin/moderation/opportunities')).status).toBe(401);
    expect((await http().post('/api/career/v1/admin/moderation/opportunities/11111111-1111-1111-1111-111111111111/action').send({})).status).toBe(401);
  });

  it('runs reporting, trust signals, and admin moderation lifecycle', async () => {
    const candidateAuth = bearer('cand-reporter-1');
    const secondCandidateAuth = bearer('cand-reporter-2');
    const adminAuth = bearer('http-admin');

    // Initialize accounts
    await http().get('/api/career/v1/me').set('Authorization', candidateAuth);
    await http().get('/api/career/v1/me').set('Authorization', secondCandidateAuth);
    await http().get('/api/career/v1/me').set('Authorization', adminAuth);

    // 1. A shared feed listing with an upfront-fee description. Pastes stay private to one person.
    const ingested = await t.app.get(OpportunityService).ingest(null, [{
      provider: 'adzuna',
      sourceId: 'trust-e2e-fee',
      title: 'Executive Assistant Role',
      organization: 'Example Org',
      description: 'Executive Assistant Role\nRequires $200 wire transfer for background verification fee before onboarding.',
      locations: ['London'],
      sourceUrl: 'https://example.test/jobs/trust-e2e-fee',
      deadline: null,
      compensation: { minimum: null, maximum: null, currency: null, period: null },
      category: 'job',
      status: 'open',
    }]);
    expect(ingested.inserted).toBe(1);
    const searchRes = await http()
      .get('/api/career/v1/opportunities')
      .query({ q: 'Executive Assistant Role' })
      .set('Authorization', candidateAuth);
    expect(searchRes.status).toBe(200);
    const opportunityId = searchRes.body.items.find((item: { title: string }) => item.title === 'Executive Assistant Role')?.id;
    expect(opportunityId).toBeTruthy();

    // 2. Candidate fetches trust signals
    const trustRes1 = await http()
      .get(`/api/career/v1/opportunities/${opportunityId}/trust`)
      .set('Authorization', candidateAuth);
    expect(trustRes1.status).toBe(200);
    expect(trustRes1.body.moderationStatus).toBe('unflagged');
    expect(trustRes1.body.reportCount).toBe(0);
    expect(trustRes1.body.signals.some((s: { key: string }) => s.key === 'suspicious_fee')).toBe(true);

    // 3. First candidate reports listing
    const report1 = await http()
      .post(`/api/career/v1/opportunities/${opportunityId}/report`)
      .set('Authorization', candidateAuth)
      .send({
        reason: 'suspicious_fee',
        notes: 'They asked for a wire transfer.',
      });
    expect(report1.status).toBe(201);
    expect(report1.body.status).toBe('reported');
    expect(report1.body.reviewStatus).toBe('pending');

    const repeat = await http()
      .post(`/api/career/v1/opportunities/${opportunityId}/report`)
      .set('Authorization', candidateAuth)
      .send({ reason: 'misleading', notes: 'Updated: still an upfront fee.' });
    expect(repeat.status).toBe(201);
    const stillOne = await http()
      .get(`/api/career/v1/opportunities/${opportunityId}/trust`)
      .set('Authorization', candidateAuth);
    expect(stillOne.body.reportCount).toBe(1);
    expect(stillOne.body.viewerReport.reason).toBe('misleading');
    expect(stillOne.body.viewerReport.status).toBe('pending');

    // 4. Second candidate reports listing -> auto-flags
    const report2 = await http()
      .post(`/api/career/v1/opportunities/${opportunityId}/report`)
      .set('Authorization', secondCandidateAuth)
      .send({
        reason: 'scam',
        notes: 'Phishing scam detected.',
      });
    expect(report2.status).toBe(201);

    // 5. Check opportunity detail has flagged status and updated trust signals
    const oppRes = await http()
      .get(`/api/career/v1/opportunities/${opportunityId}`)
      .set('Authorization', candidateAuth);
    expect(oppRes.status).toBe(200);
    expect(oppRes.body.moderationStatus).toBe('flagged');
    expect(oppRes.body.trustSignals.reportCount).toBe(2);

    // 6. Non-admin fails to access moderation queue
    const nonAdminQueue = await http()
      .get('/api/career/v1/admin/moderation/opportunities')
      .set('Authorization', candidateAuth);
    expect(nonAdminQueue.status).toBe(403);

    // 7. Admin views moderation queue
    const adminQueue = await http()
      .get('/api/career/v1/admin/moderation/opportunities')
      .set('Authorization', adminAuth);
    expect(adminQueue.status).toBe(200);
    expect(adminQueue.body.items.length).toBeGreaterThan(0);
    const itemInQueue = adminQueue.body.items.find((i: { opportunityId: string }) => i.opportunityId === opportunityId);
    expect(itemInQueue).toBeDefined();
    expect(itemInQueue.reportCount).toBe(2);
    expect(itemInQueue.moderationStatus).toBe('flagged');

    // 8. Admin suppresses the listing
    const suppressRes = await http()
      .post(`/api/career/v1/admin/moderation/opportunities/${opportunityId}/action`)
      .set('Authorization', adminAuth)
      .send({
        action: 'suppress',
        notes: 'Confirmed upfront fee scam. Suppressed listing.',
      });
    expect(suppressRes.status).toBe(201);
    expect(suppressRes.body.moderationStatus).toBe('suppressed');

    const afterSuppress = await http()
      .get(`/api/career/v1/opportunities/${opportunityId}`)
      .set('Authorization', candidateAuth);
    expect(afterSuppress.status).toBe(200);
    expect(afterSuppress.body.moderationStatus).toBe('suppressed');
    expect(afterSuppress.body.trustSignals.viewerReport.status).toBe('reviewed');
    expect(afterSuppress.body.trustSignals.viewerReport.reviewAction).toBe('suppress');
    expect(JSON.stringify(afterSuppress.body.trustSignals)).not.toMatch(/fraud|guaranteed/i);

    const outsiderAuth = bearer('cand-outsider');
    await http().get('/api/career/v1/me').set('Authorization', outsiderAuth);
    const hidden = await http()
      .get('/api/career/v1/opportunities')
      .query({ q: 'Executive Assistant Role' })
      .set('Authorization', outsiderAuth);
    expect(hidden.body.items.some((item: { id: string }) => item.id === opportunityId)).toBe(false);
    const direct = await http()
      .get(`/api/career/v1/opportunities/${opportunityId}`)
      .set('Authorization', outsiderAuth);
    expect(direct.status).toBe(200);
    expect(direct.body.moderationStatus).toBe('suppressed');
    expect(direct.body.trustSignals.isSuppressed).toBe(true);

    // 9. Admin verifies audit log entry
    const auditRes = await http()
      .get('/api/career/v1/admin/audit')
      .set('Authorization', adminAuth);
    expect(auditRes.status).toBe(200);
    const auditMatch = auditRes.body.items.find(
      (a: { action: string; target: string }) =>
        a.action === 'opportunity.moderate' && a.target === `${opportunityId}:suppress`,
    );
    expect(auditMatch).toBeDefined();

    // 10. Admin can unflag/dismiss or verify
    const verifyRes = await http()
      .post(`/api/career/v1/admin/moderation/opportunities/${opportunityId}/action`)
      .set('Authorization', adminAuth)
      .send({
        action: 'verify',
        notes: 'Re-reviewed after employer verification.',
      });
    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.moderationStatus).toBe('verified');
  });
});
