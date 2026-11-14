import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

describe('voice interviews over HTTP', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_voice');
    await t.db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('voiceMinutes', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/interviews/voice')).status).toBe(401);
    expect((await http().post('/api/career/v1/interviews/voice/consent')).status).toBe(401);
    expect(
      (await http().post('/api/career/v1/interviews/voice/00000000-0000-4000-8000-000000000001/transcription').send({ language: 'en' })).status,
    ).toBe(401);
  });

  it('counts 90 seconds, keeps the summary after the recording is removed, and blocks Free', async () => {
    const auth = bearer('http-voice');
    const listed = await http().get('/api/career/v1/interviews/voice').set('Authorization', auth);
    expect(listed.status).toBe(200);
    expect(listed.body.planIncludesVoice).toBe(false);
    expect(listed.body.remainingSeconds).toBe(0);

    const consent = await http().post('/api/career/v1/interviews/voice/consent').set('Authorization', auth);
    expect(consent.status).toBe(201);
    const upgrade = await http()
      .post('/api/career/v1/interviews/voice')
      .set('Authorization', auth)
      .send({ kind: 'practice', opportunityId: '00000000-0000-4000-8000-000000000001', stage: 'behavioral' });
    expect(upgrade.status).toBe(403);
    expect(upgrade.body).toMatchObject({ code: 'plan_upgrade_required', feature: 'voiceMinutes' });

    await t.db.pool.query(`UPDATE billing_accounts SET plan_id = 'professional' WHERE auth_user_id = 'http-voice'`);
    const fact = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    expect(fact.status).toBe(201);
    const pasted = await http().post('/api/career/v1/opportunities').set('Authorization', auth).send({ text: 'SQL analyst\nKeep the ledger accurate and reconcile it weekly.' });
    expect(pasted.status).toBe(201);

    const before = await http().get('/api/career/v1/interviews/voice').set('Authorization', auth);
    expect(before.body.remainingSeconds).toBe(1800);

    const created = await http()
      .post('/api/career/v1/interviews/voice')
      .set('Authorization', auth)
      .send({ kind: 'practice', opportunityId: pasted.body.id, stage: 'behavioral' });
    expect(created.status).toBe(201);
    expect(created.body.summary).toBe('No recording yet.');
    expect(created.body.prompt).toContain('SQL');

    const transcribe = await http()
      .post(`/api/career/v1/interviews/voice/${created.body.id}/transcription`)
      .set('Authorization', auth)
      .send({ language: 'en' });
    expect(transcribe.status).toBe(503);
    expect(transcribe.body).toEqual({ code: 'provider_unavailable', reason: 'transcription_not_configured' });
    expect(JSON.stringify(transcribe.body)).not.toMatch(/I used SQL/);

    const missingKey = await http()
      .post(`/api/career/v1/interviews/voice/${created.body.id}/recording`)
      .set('Authorization', auth)
      .send({ durationSeconds: 90, transcript: 'I used SQL.' });
    expect(missingKey.status).toBe(400);
    expect(missingKey.body).toEqual({ code: 'validation_error', field: 'Idempotency-Key' });

    const recorded = await http()
      .post(`/api/career/v1/interviews/voice/${created.body.id}/recording`)
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-voice-90')
      .send({ durationSeconds: 90, transcript: 'I used SQL.' });
    expect(recorded.status).toBe(201);
    expect(recorded.body.billedSeconds).toBe(90);
    expect(recorded.body.remainingSeconds).toBe(1710);
    expect(recorded.body.replayed).toBe(false);
    expect(recorded.body.session.summary).toContain('Recorded 90 seconds.');
    expect(JSON.stringify(recorded.body.session)).not.toMatch(/emotion|honesty|personality|guaranteed/i);

    const replay = await http()
      .post(`/api/career/v1/interviews/voice/${created.body.id}/recording`)
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-voice-90')
      .send({ durationSeconds: 90, transcript: 'I used SQL.' });
    expect(replay.status).toBe(201);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.remainingSeconds).toBe(1710);

    const ledger = await t.db.pool.query<{ quantity: number }>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM usage_ledger
        WHERE unit = 'voice_minute' AND state = 'committed'
          AND billing_account_id = (SELECT id FROM billing_accounts WHERE auth_user_id = 'http-voice')`,
    );
    expect(ledger.rows[0].quantity).toBe(1);

    const corrected = await http()
      .patch(`/api/career/v1/interviews/voice/${created.body.id}/transcript`)
      .set('Authorization', auth)
      .send({ transcript: 'I helped the team.' });
    expect(corrected.status).toBe(200);
    expect(corrected.body.summary).toBe(recorded.body.session.summary);
    expect(corrected.body.recording.transcript).toBe('I helped the team.');

    const removed = await http().delete(`/api/career/v1/interviews/voice/${created.body.id}/audio`).set('Authorization', auth);
    expect(removed.status).toBe(200);
    expect(removed.body.recording.audioDeleted).toBe(true);
    expect(removed.body.summary).toBe(recorded.body.session.summary);

    const ledgerAfter = await t.db.pool.query<{ quantity: number }>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM usage_ledger
        WHERE unit = 'voice_minute' AND state = 'committed'
          AND billing_account_id = (SELECT id FROM billing_accounts WHERE auth_user_id = 'http-voice')`,
    );
    expect(ledgerAfter.rows[0].quantity).toBe(1);
  });
});
