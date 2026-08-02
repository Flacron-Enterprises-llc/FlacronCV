import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
// Used only by the TEMPORARY secret diagnostic below — remove with it.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

function validateEnv() {
  const required = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_STORAGE_BUCKET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * TEMPORARY DIAGNOSTIC — remove once the webhook secret is confirmed.
 *
 * Prints the SHAPE of the loaded Stripe webhook secret, never its value, and
 * which source it came from.
 *
 * `@nestjs/config` never overwrites a key that already exists in `process.env`
 * (proven in config/env-load-order.spec.ts), so an OS/shell variable silently
 * wins over `apps/api/.env` and the file being edited is not consulted for that
 * key.
 *
 * Note the source cannot be determined by snapshotting `process.env` early in
 * `bootstrap()`: `ConfigModule.forRoot()` loads the env file synchronously when
 * the `@Module` decorator on AppModule is evaluated — i.e. at `import` time,
 * before `bootstrap()` runs at all. By then both sources have already merged.
 * The only reliable discriminator is to re-read the file and compare.
 */
function describeSecret(label: string, value: string | undefined) {
  if (!value) {
    console.log(`[secret:${label}] NOT SET`);
    return null;
  }
  const trimmed = value.trim();
  const fp = createHash('sha256').update(trimmed).digest('hex').slice(0, 8);
  console.log(
    `[secret:${label}] len=${trimmed.length} first6=${trimmed.slice(0, 6)} ` +
      `last6=${trimmed.slice(-6)} sha256_8=${fp}` +
      (trimmed.length !== value.length ? ' (had surrounding whitespace!)' : ''),
  );
  return fp;
}

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // ── TEMPORARY DIAGNOSTIC — delete this block when finished ────────────────
  {
    const envPath = resolve(process.cwd(), '.env');
    const fileExists = existsSync(envPath);

    // Re-read the file and compare against what ConfigService actually returns.
    // This is the only reliable discriminator — see the note on describeSecret.
    let inFile: string | undefined;
    if (fileExists) {
      const line = readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .find((l) => /^\s*STRIPE_WEBHOOK_SECRET\s*=/.test(l));
      if (line) {
        inFile = line.replace(/^\s*STRIPE_WEBHOOK_SECRET\s*=/, '').trim();
        const quoted = /^(["'])([\s\S]*)\1$/.exec(inFile);
        if (quoted) inFile = quoted[2];
      }
    }

    const effective = app.get(ConfigService).get<string>('stripe.webhookSecret');

    console.log('──────── STRIPE WEBHOOK SECRET DIAGNOSTIC ────────');
    console.log(`[cwd]      ${process.cwd()}`);
    console.log(`[.env]     ${envPath} ${fileExists ? '(exists)' : '(MISSING)'}`);
    describeSecret('in .env  ', inFile);
    const effFp = describeSecret('EFFECTIVE', effective);

    let source: string;
    if (!effective) source = 'NOTHING LOADED — the API should not have started';
    else if (!inFile) source = 'OS/SHELL ENVIRONMENT VARIABLE (key absent from .env)';
    else if (inFile.trim() === effective.trim()) source = 'apps/api/.env';
    else source = 'OS/SHELL ENVIRONMENT VARIABLE — .env is being IGNORED for this key';
    console.log(`[source]   ${source}`);

    if (effFp) {
      console.log(
        `[compare]  node -e "console.log(require('crypto').createHash('sha256')` +
          `.update(process.argv[1]).digest('hex').slice(0,8))" whsec_YOUR_CLI_SECRET`,
      );
      console.log(`[compare]  ...must print: ${effFp}`);
    }
    console.log('──────────────────────────────────────────────────');
  }
  // ── END TEMPORARY DIAGNOSTIC ──────────────────────────────────────────────

  // Behind Render's proxy the client IP arrives in X-Forwarded-For. Without
  // trust proxy, rate limiting would key every request to the proxy's IP and
  // all users would share a single throttle bucket.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());

  // CORS configuration - dynamically validate origins
  const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
  const extraOrigins = (process.env.ADDITIONAL_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    frontendUrl,
    ...extraOrigins,
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) {
        return callback(null, true);
      }

      // Normalize origin by removing trailing slash
      const normalizedOrigin = origin.replace(/\/$/, '');

      // Check if normalized origin is in allowed list
      const isAllowed = allowedOrigins.some(
        (allowed) => allowed === normalizedOrigin || `${allowed}/` === origin
      );

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
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

  const config = new DocumentBuilder()
    .setTitle('FlacronCV API')
    .setDescription('AI-powered CV & Cover Letter Builder API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('users')
    .addTag('cvs')
    .addTag('cover-letters')
    .addTag('ai')
    .addTag('templates')
    .addTag('payments')
    .addTag('support')
    .addTag('admin')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Health check (bypasses global prefix so load balancers can reach /health)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`FlacronCV API running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
