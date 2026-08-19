import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import Stripe from 'stripe';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PaymentService } from './payment.service';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { LoggingInterceptor } from '../../common/interceptors/logging.interceptor';
import { CORS_ALLOWED_HEADERS } from '../../cors-allowed-headers';

/**
 * Reproduces main.ts's bootstrap EXACTLY, then posts a genuinely Stripe-signed
 * payload to the real route.
 *
 * The sibling spec (stripe-webhook.signature.spec.ts) proves the controller
 * handles raw bytes correctly, but it builds a bare app. That cannot rule out
 * the bootstrap itself: helmet, CORS, `trust proxy`, the global prefix, the
 * global ValidationPipe, AllExceptionsFilter, TransformInterceptor and
 * LoggingInterceptor all sit between the socket and `constructEvent`, and any
 * one of them consuming or re-encoding the request stream would break the HMAC
 * while leaving the payload looking correct in a log.
 *
 * Every element below is copied from main.ts. If this passes, the application
 * code is exonerated and the fault is in the environment (secret value, or
 * something re-encoding the body upstream of Node).
 */
const SECRET = 'whsec_bootstrap_probe_secret';

describe('full main.ts bootstrap — raw body survives the whole pipeline', () => {
  let app: INestApplication;
  const handleWebhookEvent = jest.fn().mockResolvedValue(undefined);

  /** What `constructEvent` actually saw, captured for byte-level assertions. */
  let seen: { body: unknown; signature: string } | null = null;

  beforeAll(async () => {
    const paymentStub: Partial<PaymentService> = {
      constructEvent: (rawBody: Buffer, signature: string) => {
        seen = { body: rawBody, signature };
        return Stripe.webhooks.constructEvent(rawBody, signature, SECRET);
      },
      handleWebhookEvent,
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: PaymentService, useValue: paymentStub },
        { provide: ConfigService, useValue: { get: () => SECRET } },
      ],
    }).compile();

    // ── main.ts, line for line ────────────────────────────────────────────
    app = moduleRef.createNestApplication({ rawBody: true });
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.use(helmet());
    app.enableCors({
      origin: (_origin: string | undefined, callback: (e: Error | null, ok?: boolean) => void) =>
        callback(null, true),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [...CORS_ALLOWED_HEADERS],
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor(), new LoggingInterceptor());
    // ──────────────────────────────────────────────────────────────────────

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    handleWebhookEvent.mockClear();
    seen = null;
  });

  const EVENT = JSON.stringify({
    id: 'evt_bootstrap',
    type: 'invoice.paid',
    data: { object: { id: 'in_boot', amount_due: 2999 } },
  });

  it('verifies a signed payload through helmet + CORS + prefix + pipe + filter + interceptors', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', Stripe.webhooks.generateTestHeaderString({ payload: EVENT, secret: SECRET }))
      .set('content-type', 'application/json')
      .send(EVENT)
      .expect(200);

    expect(handleWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it('hands constructEvent a Buffer whose bytes are identical to what was sent', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', Stripe.webhooks.generateTestHeaderString({ payload: EVENT, secret: SECRET }))
      .set('content-type', 'application/json')
      .send(EVENT)
      .expect(200);

    // Task 7 and 8: not a string, not a re-serialised object — the exact bytes.
    expect(Buffer.isBuffer(seen!.body)).toBe(true);
    expect((seen!.body as Buffer).length).toBe(Buffer.byteLength(EVENT, 'utf8'));
    expect((seen!.body as Buffer).toString('utf8')).toBe(EVENT);
  });

  it('serves the webhook ONLY under the global prefix', async () => {
    // Task 10 and 11. An un-prefixed POST must 404, proving the route Stripe
    // has to target is /api/v1/webhooks/stripe and nothing else.
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('content-type', 'application/json')
      .send(EVENT)
      .expect(404);
  });

  it('does not double-parse: an unparsed body never reaches the handler as an object', async () => {
    // Task 9. If a body parser had already consumed and re-encoded the stream,
    // the bytes above would differ; this asserts the complementary fact that
    // whitespace-significant input round-trips untouched.
    const spaced = '{"id":"evt_ws","type":"invoice.paid",   "data":{"object":{}}}';

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', Stripe.webhooks.generateTestHeaderString({ payload: spaced, secret: SECRET }))
      .set('content-type', 'application/json')
      .send(spaced)
      .expect(200);

    expect((seen!.body as Buffer).toString('utf8')).toBe(spaced);
  });

  /**
   * Task 13. The diagnostic line has to answer the question AND be safe to
   * paste into an issue — so it reports the shape of each input, never a value.
   */
  it('logs full diagnostics on failure, without ever printing the secret', async () => {
    const logged: string[] = [];
    const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation((msg) => {
      logged.push(String(msg));
    });

    try {
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/stripe')
        .set('stripe-signature', Stripe.webhooks.generateTestHeaderString({ payload: EVENT, secret: SECRET }))
        .set('content-type', 'application/json')
        .send(EVENT.replace('in_boot', 'tampered'))
        .expect(400);
    } finally {
      spy.mockRestore();
    }

    const line = logged.find((l) => l.includes('signature verification failed'));
    expect(line).toBeDefined();

    const diag = JSON.parse(line!.slice(line!.indexOf('{')));
    expect(diag.rawBodyPresent).toBe(true);
    expect(diag.isBuffer).toBe(true);
    expect(diag.rawBodyType).toBe('Buffer');
    expect(diag.bytes).toBeGreaterThan(0);
    expect(diag.signaturePresent).toBe(true);
    expect(diag.signatureScheme).toBe('v1');
    expect(diag.secretLen).toBe(SECRET.length);
    expect(diag.secretFp).toMatch(/^[0-9a-f]{8}$/);
    expect(Math.abs(diag.skewSeconds)).toBeLessThan(60);

    // The whole point: the secret's shape is reported, the secret is not.
    expect(line).not.toContain(SECRET);
  });
});
