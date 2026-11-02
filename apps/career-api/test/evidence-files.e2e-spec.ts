import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

/** Evidence file routes over HTTP. Storage is the in-memory store (OBJECT_STORAGE=memory), not S3. */
describe('private evidence files over HTTP (CV11)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

  beforeAll(async () => {
    t = await createTestApp('api_evidence_files');
    await t.db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('evidenceItems', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  async function createItem(auth: string): Promise<string> {
    const created = await http().post('/api/career/v1/evidence').set('Authorization', auth).send({ title: 'Certificate', evidenceType: 'credential' });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  it('needs a token for every file route', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await http().put(`/api/career/v1/evidence/${id}/attachment`).set('Content-Type', 'application/pdf').send(PDF)).status).toBe(401);
    expect((await http().get(`/api/career/v1/evidence/${id}/attachment`)).status).toBe(401);
    expect((await http().delete(`/api/career/v1/evidence/${id}/attachment`)).status).toBe(401);
  });

  it('uploads, links, and removes the owner’s file and refuses everyone else', async () => {
    const ada = bearer('http-files-ada');
    const charles = bearer('http-files-charles');
    const id = await createItem(ada);

    const uploaded = await http()
      .put(`/api/career/v1/evidence/${id}/attachment`)
      .set('Authorization', ada)
      .set('Content-Type', 'application/pdf')
      .set('X-File-Name', encodeURIComponent('Certificat été.pdf'))
      .send(PDF);
    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toMatchObject({
      attachmentStored: true,
      attachmentContentType: 'application/pdf',
      attachmentName: 'Certificat été.pdf',
      attachmentSizeBytes: PDF.length,
      evidenceLabel: 'evidence_attached',
    });
    expect(JSON.stringify(uploaded.body)).not.toContain('evidence/');

    const link = await http().get(`/api/career/v1/evidence/${id}/attachment`).set('Authorization', ada);
    expect(link.status).toBe(200);
    expect(typeof link.body.url).toBe('string');
    expect(Date.parse(link.body.expiresAt)).toBeGreaterThan(Date.now());

    expect((await http().get(`/api/career/v1/evidence/${id}/attachment`).set('Authorization', charles)).status).toBe(403);
    expect(
      (await http().put(`/api/career/v1/evidence/${id}/attachment`).set('Authorization', charles).set('Content-Type', 'application/pdf').send(PDF)).status,
    ).toBe(403);
    expect((await http().delete(`/api/career/v1/evidence/${id}/attachment`).set('Authorization', charles)).status).toBe(403);

    const removed = await http().delete(`/api/career/v1/evidence/${id}/attachment`).set('Authorization', ada);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ attachmentStored: false, attachmentName: null });
    const gone = await http().get(`/api/career/v1/evidence/${id}/attachment`).set('Authorization', ada);
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual({ code: 'not_found' });
  });

  it('refuses unsupported types, mismatched content, and oversized bodies', async () => {
    const auth = bearer('http-files-dora');
    const id = await createItem(auth);
    const put = () => http().put(`/api/career/v1/evidence/${id}/attachment`).set('Authorization', auth);

    const text = await put().set('Content-Type', 'text/plain').send('hello');
    expect(text.status).toBe(400);
    expect(text.body).toEqual({ code: 'validation_error', field: 'file', reason: 'unsupported_type' });

    const mismatch = await put().set('Content-Type', 'application/pdf').send(PNG);
    expect(mismatch.status).toBe(400);
    expect(mismatch.body).toEqual({ code: 'validation_error', field: 'file', reason: 'type_mismatch' });

    const tooLarge = await put()
      .set('Content-Type', 'application/pdf')
      .send(Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toEqual({ code: 'validation_error', reason: 'too_large', limit: 10 * 1024 * 1024 });

    const after = await http().get(`/api/career/v1/evidence/${id}`).set('Authorization', auth);
    expect(after.body.attachmentStored).toBe(false);
  });
});
