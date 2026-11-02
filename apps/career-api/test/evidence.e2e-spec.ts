import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

describe('career evidence vault over HTTP (CV11)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_evidence');
    // Enable the Phase 2 evidenceItems flag in the test database
    await t.db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('evidenceItems', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/evidence')).status).toBe(401);
    expect((await http().post('/api/career/v1/evidence').send({})).status).toBe(401);
  });

  it('creates, lists, updates, and deletes evidence with accurate labels and capacity limits', async () => {
    const auth = bearer('http-evidence-user');

    // 1. Create credential with attachment -> evidence_attached
    const created1 = await http()
      .post('/api/career/v1/evidence')
      .set('Authorization', auth)
      .send({
        title: 'Project Lead Certification',
        evidenceType: 'credential',
        description: 'Advanced project leadership credential',
        attachmentUrl: 'https://example.test/cert.pdf',
        attachmentName: 'cert.pdf',
        attachmentSizeBytes: 204800,
        linkedSkills: ['Leadership', 'Planning'],
      });
    expect(created1.status).toBe(201);
    expect(created1.body.evidenceLabel).toBe('evidence_attached');
    expect(created1.body.linkedSkills).toEqual(['Leadership', 'Planning']);
    expect(created1.body.attachmentName).toBe('cert.pdf');

    // 2. Create project without attachment -> self_reported
    const created2 = await http()
      .post('/api/career/v1/evidence')
      .set('Authorization', auth)
      .send({
        title: 'Microservices Architecture Redesign',
        evidenceType: 'project',
        ownershipStatement: 'Primary architect and implementer',
      });
    expect(created2.status).toBe(201);
    expect(created2.body.evidenceLabel).toBe('self_reported');

    // 3. Create 3rd item (Free limit is 3)
    const created3 = await http()
      .post('/api/career/v1/evidence')
      .set('Authorization', auth)
      .send({
        title: 'Reference from Engineering VP',
        evidenceType: 'reference',
      });
    expect(created3.status).toBe(201);
    expect(created3.body.evidenceLabel).toBe('self_reported');

    // 4. 4th item on Free plan exceeds capacity (limit: 3)
    const created4 = await http()
      .post('/api/career/v1/evidence')
      .set('Authorization', auth)
      .send({
        title: '4th Item Over Limit',
        evidenceType: 'work_sample',
      });
    expect(created4.status).toBe(409);
    expect(created4.body).toMatchObject({
      code: 'capacity_exceeded',
      field: 'evidenceItems',
      limit: 3,
    });

    // 5. List items
    const list = await http().get('/api/career/v1/evidence').set('Authorization', auth);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(3);

    // 6. Update item
    const updated = await http()
      .patch(`/api/career/v1/evidence/${created2.body.id}`)
      .set('Authorization', auth)
      .send({
        description: 'Updated architecture documentation',
        isPortfolioShared: true,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.description).toBe('Updated architecture documentation');
    expect(updated.body.isPortfolioShared).toBe(true);

    // 7. Isolation check: another user cannot access item
    const otherUser = bearer('http-evidence-other');
    const forbidden = await http()
      .get(`/api/career/v1/evidence/${created1.body.id}`)
      .set('Authorization', otherUser);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('permission_denied');

    // 8. Delete item frees capacity
    const deleted = await http()
      .delete(`/api/career/v1/evidence/${created3.body.id}`)
      .set('Authorization', auth);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ ok: true });

    // Now user can create a 3rd item again
    const createdAgain = await http()
      .post('/api/career/v1/evidence')
      .set('Authorization', auth)
      .send({
        title: 'New 3rd Item Within Capacity',
        evidenceType: 'publication',
      });
    expect(createdAgain.status).toBe(201);
  });
});
