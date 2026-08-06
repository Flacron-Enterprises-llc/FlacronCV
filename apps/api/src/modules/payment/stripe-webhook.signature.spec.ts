import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import Stripe from 'stripe';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PaymentService } from './payment.service';

/**
 * Drives the real webhook route with a genuinely Stripe-signed payload.
 *
 * Signature verification depends on three things lining up — the exact bytes
 * Stripe hashed, the secret, and the header — and every one of them is settled
 * somewhere else in the app (NestFactory's rawBody option, ConfigService, the
 * body parser). Reading those files individually cannot tell you whether the
 * bytes that reach `constructEvent` are still byte-identical to what was sent.
 * This does.
 */
const SECRET = 'whsec_test_secret_do_not_use_in_production';

/** Sign a payload exactly as Stripe does, using Stripe's own helper. */
function sign(payload: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
}

describe('POST /api/v1/webhooks/stripe (raw body + signature)', () => {
  let app: INestApplication;
  const handleWebhookEvent = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    // A PaymentService stand-in whose constructEvent is the REAL Stripe
    // verification against a known secret. Everything downstream is stubbed —
    // this test is about the bytes and the signature, not about Firestore.
    const paymentStub: Partial<PaymentService> = {
      constructEvent: (rawBody: Buffer, signature: string) =>
        Stripe.webhooks.constructEvent(rawBody, signature, SECRET),
      handleWebhookEvent,
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: PaymentService, useValue: paymentStub },
        // The controller reads the secret only to report its shape in the
        // failure diagnostics; verification itself uses the stub above.
        { provide: ConfigService, useValue: { get: () => SECRET } },
      ],
    }).compile();

    // Mirror main.ts exactly — the bootstrap is part of what is under test.
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => handleWebhookEvent.mockClear());

  const EVENT = JSON.stringify({
    id: 'evt_sig_test',
    type: 'invoice.paid',
    data: { object: { id: 'in_1', subscription: null } },
  });

  it('accepts a correctly signed payload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', sign(EVENT))
      .set('content-type', 'application/json')
      .send(EVENT)
      .expect(200);

    expect(handleWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects a tampered payload', async () => {
    const signature = sign(EVENT);
    const tampered = EVENT.replace('in_1', 'in_2');

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', signature)
      .set('content-type', 'application/json')
      .send(tampered)
      .expect(400);

    expect(handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('content-type', 'application/json')
      .send(EVENT)
      .expect(400);
  });

  /**
   * The 400 body must say WHY. Stripe distinguishes a missing header from a
   * payload mismatch from an expired timestamp, and each points at a different
   * fix — but the controller used to collapse all of them into "Invalid webhook
   * signature", so the only useful information lived in a server log while the
   * Stripe Dashboard's Response tab showed nothing diagnostic.
   */
  it('reports the specific reason, not a generic message', async () => {
    const missingHeader = await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('content-type', 'application/json')
      .send(EVENT)
      .expect(400);
    expect(missingHeader.body.message).toMatch(/no stripe-signature header/i);

    const mismatch = await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', sign(EVENT))
      .set('content-type', 'application/json')
      .send(EVENT.replace('in_1', 'in_2'))
      .expect(400);
    expect(mismatch.body.message).toMatch(/no signatures found matching/i);

    // Verbatim: Stripe's message, with nothing prefixed to it.
    expect(mismatch.body.message).not.toMatch(/^Webhook signature verification failed/);
    expect(mismatch.body.message).not.toBe('Invalid webhook signature');

    // And never the secret itself.
    expect(JSON.stringify(mismatch.body)).not.toContain(SECRET);
  });

  /**
   * The regression that matters most. Stripe hashes the exact bytes it sent;
   * if anything in the pipeline hands `constructEvent` a re-serialised copy —
   * `JSON.stringify(req.body)`, or a parser that normalises whitespace — the
   * signature fails for every event, forever, while the payload still looks
   * correct in a log. Non-ASCII and unusual spacing make that substitution
   * detectable: re-encoding changes the byte length.
   */
  it('preserves the exact bytes, including non-ASCII and irregular whitespace', async () => {
    const awkward = '{"id":"evt_bytes",  "type":"invoice.paid","data":{"object":{"note":"café — naïve ✓"}}}';

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', sign(awkward))
      .set('content-type', 'application/json')
      .send(awkward)
      .expect(200);
  });
});

describe('constructEvent without a configured secret', () => {
  /**
   * A blank STRIPE_WEBHOOK_SECRET used to be passed straight to Stripe, which
   * reported it as an ordinary signature mismatch — indistinguishable from an
   * attack, and pointing the reader at the payload rather than at the missing
   * configuration.
   */
  it('says the secret is not set, rather than blaming the signature', () => {
    const svc = Object.create(PaymentService.prototype) as PaymentService;
    (svc as unknown as { configService: { get: () => undefined } }).configService = {
      get: () => undefined,
    };

    expect(() => svc.constructEvent(Buffer.from('{}'), 'sig')).toThrow(
      /STRIPE_WEBHOOK_SECRET is not set/,
    );
  });

  it('treats a whitespace-only secret as unset', () => {
    const svc = Object.create(PaymentService.prototype) as PaymentService;
    (svc as unknown as { configService: { get: () => string } }).configService = {
      get: () => '   ',
    };

    // configuration.ts trims, so a stray space in .env arrives here as ''.
    expect(() => svc.constructEvent(Buffer.from('{}'), 'sig')).toThrow(
      /STRIPE_WEBHOOK_SECRET is not set/,
    );
  });
});
