import { BadRequestException, NestApplicationOptions, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { EVIDENCE_FILE_CONTENT_TYPES, evidenceUploadMaxBytes } from '@flacroncv/career-server';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { AppConfig } from './config/env';

/** Creation options for `NestFactory.create` and the e2e tests. The Stripe signature covers the raw body. */
/** Path prefix of every career route. */
export const CAREER_API_PREFIX = 'api/career/v1';

export const APP_OPTIONS: NestApplicationOptions = { rawBody: true };

/** Room for an imported resume's text (100,000 characters, some of them multi-byte). */
export const JSON_BODY_LIMIT = '512kb';

/** Shared by `main.ts` and the e2e tests so both serve the same routes. */
export function configureApp(app: NestExpressApplication, config: Pick<AppConfig, 'corsOrigins'>): void {
  // Beside V1's `/api/v1`, so one load balancer can route both without overlap.
  app.setGlobalPrefix(CAREER_API_PREFIX);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  // Evidence file uploads only. A larger body is refused with 413 before it is buffered.
  app.useBodyParser('raw', { type: [...EVIDENCE_FILE_CONTENT_TYPES], limit: evidenceUploadMaxBytes(process.env) });
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: () => new BadRequestException({ code: 'validation_error' }),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
