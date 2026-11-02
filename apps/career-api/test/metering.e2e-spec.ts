import { randomUUID } from 'crypto';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import request from 'supertest';
import { MeteringService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { bearer } from '@flacroncv/career-server/src/testing';
import { CurrentPrincipal } from '../src/auth/auth.guard';
import { IdempotencyKey } from '../src/metering/metering.providers';
import { createTestApp, TestApp } from './support';

let providerCalls = 0;

/** A paid route shaped like the real ones, so the HTTP side of the request flow is tested once here. */
@Controller('test-metered')
class MeteredTestController {
  constructor(private readonly metering: MeteringService) {}

  @Post('document')
  @HttpCode(200)
  async document(@CurrentPrincipal() p: Principal, @IdempotencyKey() key: string | undefined, @Body() body: unknown) {
    const out = await this.metering.run({
      spender: p,
      kind: 'test.document',
      unit: 'document_credit',
      feature: 'documentCredits',
      idempotencyKey: key,
      body,
      requestId: randomUUID(),
      execute: async () => {
        providerCalls += 1;
        if ((body as { fail?: boolean } | null)?.fail) throw new Error('provider said no: secret-detail');
        return 'text';
      },
      save: async () => ({ text: 'saved' }),
    });
    return { ...out.result, jobId: out.jobId, usage: out.usage };
  }

  @Post('interview')
  @HttpCode(200)
  async interview(@CurrentPrincipal() p: Principal, @IdempotencyKey() key: string | undefined) {
    const out = await this.metering.run({
      spender: p,
      kind: 'test.interview',
      unit: 'text_interview',
      feature: 'textInterviewSessions',
      idempotencyKey: key,
      body: {},
      requestId: randomUUID(),
      execute: async () => {
        providerCalls += 1;
        return 'x';
      },
      save: async () => ({ ok: true }),
    });
    return out.result;
  }
}

describe('paid request flow over HTTP', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_metering', { controllers: [MeteredTestController] });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  beforeEach(() => {
    providerCalls = 0;
  });

  it('needs a token before anything is reserved', async () => {
    const res = await http().post('/api/career/v1/test-metered/document').set('Idempotency-Key', 'k').send({});
    expect(res.status).toBe(401);
    expect(providerCalls).toBe(0);
  });

  it('needs an Idempotency-Key', async () => {
    const res = await http().post('/api/career/v1/test-metered/document').set('Authorization', bearer('m-nokey')).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'validation_error', field: 'Idempotency-Key' });
    expect(providerCalls).toBe(0);
  });

  it('returns the result, the remaining balance, and the renewal date; a replay does not charge again', async () => {
    const send = () =>
      http().post('/api/career/v1/test-metered/document').set('Authorization', bearer('m-ok')).set('Idempotency-Key', 'doc-1').send({ a: 1 });
    const first = await send();
    expect(first.status).toBe(200);
    expect(first.body.usage).toMatchObject({ unit: 'document_credit', includedRemaining: 2, ledgerState: 'committed' });
    expect(typeof first.body.usage.renewalDate).toBe('string');
    const again = await send();
    expect(again.body.usage.includedRemaining).toBe(2);
    expect(again.body.jobId).toBe(first.body.jobId);
    expect(providerCalls).toBe(1);

    const job = await http().get(`/api/career/v1/ai-jobs/${first.body.jobId}`).set('Authorization', bearer('m-ok'));
    expect(job.body).toEqual({ id: first.body.jobId, status: 'succeeded', state: 'committed' });
    const foreign = await http().get(`/api/career/v1/ai-jobs/${first.body.jobId}`).set('Authorization', bearer('m-other'));
    expect(foreign.status).toBe(404);
  });

  it('the same key with another body is 409 idempotency_mismatch', async () => {
    const auth = bearer('m-mismatch');
    await http().post('/api/career/v1/test-metered/document').set('Authorization', auth).set('Idempotency-Key', 'k1').send({ a: 1 });
    const res = await http().post('/api/career/v1/test-metered/document').set('Authorization', auth).set('Idempotency-Key', 'k1').send({ a: 2 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 'idempotency_mismatch' });
  });

  it('a provider failure is 503 with released: true and no internal message', async () => {
    const res = await http()
      .post('/api/career/v1/test-metered/document')
      .set('Authorization', bearer('m-fail'))
      .set('Idempotency-Key', 'f1')
      .send({ fail: true });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ code: 'provider_unavailable', released: true, jobId: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toContain('secret-detail');
    const job = await http().get(`/api/career/v1/ai-jobs/${res.body.jobId}`).set('Authorization', bearer('m-fail'));
    expect(job.body).toMatchObject({ status: 'failed', state: 'released' });
  });

  it('quota exhausted is 402 with unit, remaining, and renewal date', async () => {
    const auth = bearer('m-quota');
    for (let i = 0; i < 3; i += 1) {
      await http().post('/api/career/v1/test-metered/document').set('Authorization', auth).set('Idempotency-Key', `q${i}`).send({ i });
    }
    providerCalls = 0;
    const res = await http().post('/api/career/v1/test-metered/document').set('Authorization', auth).set('Idempotency-Key', 'q4').send({ i: 4 });
    expect(res.status).toBe(402);
    expect(res.body).toEqual({ code: 'quota_exhausted', unit: 'document_credit', remaining: 0, renewalDate: expect.any(String) });
    expect(providerCalls).toBe(0);
  });

  it('a unit Free does not include is 403 plan_upgrade_required with minimumPlan', async () => {
    const res = await http().post('/api/career/v1/test-metered/interview').set('Authorization', bearer('m-free')).set('Idempotency-Key', 'i1').send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'plan_upgrade_required', feature: 'textInterviewSessions', minimumPlan: 'starter' });
    expect(providerCalls).toBe(0);
  });
});
