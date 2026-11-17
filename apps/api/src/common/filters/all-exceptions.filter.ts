import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Envelope keys the filter owns; a service body can never override them. */
const ENVELOPE_KEYS = new Set(['success', 'statusCode', 'message', 'code', 'timestamp', 'path', 'error', 'stack']);

/**
 * Structured fields a service set next to an explicit `code` (for example
 * `minimumPlan` for UPGRADE_REQUIRED, `limit` for a capacity refusal), so a
 * client can act on them without parsing English. Only when the body carries
 * a code (a deliberate, documented refusal), and only plain values: strings,
 * finite numbers, booleans, null, or flat arrays of those. Nested objects,
 * stacks and anything else stay server-side.
 */
export function safeErrorDetails(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ENVELOPE_KEYS.has(key)) continue;
    if (isPlain(value) || (Array.isArray(value) && value.length <= 50 && value.every(isPlain))) out[key] = value;
  }
  return out;
}

function isPlain(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'string' && value.length <= 500) ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/**
 * Removes credential-shaped text before anything reaches the logs. Stripe's own
 * errors echo a masked key ("rk_test_****ABCD"); even masked fragments, webhook
 * secrets and bearer tokens are dropped entirely.
 */
export function redactSecrets(text: string): string {
  return text
    // Stripe masks keys as "rk_test_****ABCD" or "rk_test_...ABCD": dots and stars are part of it.
    .replace(/\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9*.]+/g, '[redacted-stripe-key]')
    .replace(/\bwhsec_[A-Za-z0-9*.]+/g, '[redacted-webhook-secret]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: string | undefined;
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
      } else {
        const body = exResponse as Record<string, unknown>;
        message = body.message?.toString() || exception.message;
        if (typeof body.code === 'string' && body.code.length > 0) {
          code = body.code;
          details = safeErrorDetails(body);
        }
      }
    } else if (exception instanceof Error) {
      // Log the real message internally but never expose raw internal errors to clients
      this.logger.error(`Internal error details: ${redactSecrets(exception.message)}`);
      message = 'Internal server error';
    }

    this.logger.error(
      redactSecrets(`${request.method} ${request.url} - ${status}: ${message}`),
      exception instanceof Error && exception.stack ? redactSecrets(exception.stack) : undefined,
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...details,
      ...(code ? { code } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
