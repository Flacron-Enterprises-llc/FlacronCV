import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { BillingError } from '@flacroncv/career-server';
import type { BillingErrorCode } from '@flacroncv/career-server';

/** Codes for framework errors that carry no contract body, by HTTP status. */
const CODE_FOR_STATUS: ReadonlyMap<number, string> = new Map([
  [HttpStatus.BAD_REQUEST, 'validation_error'],
  [HttpStatus.UNAUTHORIZED, 'unauthenticated'],
  [HttpStatus.FORBIDDEN, 'permission_denied'],
  [HttpStatus.NOT_FOUND, 'not_found'],
]);

/**
 * HTTP status for each billing code. ASSUMED: the contract names the codes
 * but not their statuses. Internal codes become `internal_error`.
 */
const BILLING_STATUS: Partial<Record<BillingErrorCode, number>> = {
  unauthenticated: HttpStatus.UNAUTHORIZED,
  validation_error: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  plan_upgrade_required: HttpStatus.FORBIDDEN,
  quota_exhausted: HttpStatus.PAYMENT_REQUIRED,
  idempotency_mismatch: HttpStatus.CONFLICT,
  channel_unavailable: HttpStatus.CONFLICT,
  not_purchasable: HttpStatus.CONFLICT,
  provider_unavailable: HttpStatus.SERVICE_UNAVAILABLE,
  permission_denied: HttpStatus.FORBIDDEN,
  feature_unavailable: HttpStatus.FORBIDDEN,
  capacity_exceeded: HttpStatus.CONFLICT,
  billing_inactive: HttpStatus.PAYMENT_REQUIRED,
  request_in_progress: HttpStatus.CONFLICT,
  reservation_closed: HttpStatus.CONFLICT,
  import_daily_limit: HttpStatus.TOO_MANY_REQUESTS,
  stale_estimate: HttpStatus.CONFLICT,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  revision_conflict: HttpStatus.CONFLICT,
  record_deleted: HttpStatus.GONE,
};

/** The extra fields API_CONTRACT names for a code. Nothing else from `details` leaves the server. */
const CONTRACT_FIELDS: Partial<Record<BillingErrorCode, readonly string[]>> = {
  quota_exhausted: ['unit', 'remaining', 'renewalDate'],
  plan_upgrade_required: ['feature', 'minimumPlan'],
  channel_unavailable: ['planId', 'interval', 'provider'],
  capacity_exceeded: ['field', 'limit'],
  feature_unavailable: ['feature', 'reason'],
  billing_inactive: ['status'],
  provider_unavailable: ['released', 'jobId', 'reason', 'claim'],
  request_in_progress: ['jobId'],
  import_daily_limit: ['limit', 'used', 'resetsAt'],
  rate_limited: ['limit', 'retryAt'],
  validation_error: ['field', 'reason', 'errors', 'limit'],
  revision_conflict: ['currentRevision'],
};

/**
 * docs/API_CONTRACT.md "Errors": a flat object with a top-level `code`.
 * Extra fields are only the ones that contract names for that code.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof BillingError) {
      const status = BILLING_STATUS[exception.code];
      if (status) {
        response.status(status).json(billingBody(exception));
        return;
      }
    }
    if (isBodyTooLarge(exception)) {
      // A body over the JSON or file-upload limit, refused by the body parser before it is buffered.
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({ code: 'validation_error', reason: 'too_large', limit: exception.limit });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isContractBody(body)) {
        response.status(status).json(contractFields(body));
        return;
      }
      const code = CODE_FOR_STATUS.get(status);
      if (code) {
        response.status(status).json({ code });
        return;
      }
    }
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'internal_error' });
  }
}

function billingBody(error: BillingError): Record<string, unknown> {
  const body: Record<string, unknown> = { code: error.code };
  for (const field of CONTRACT_FIELDS[error.code] ?? []) {
    if (field in error.details) body[field] = error.details[field];
  }
  return body;
}

function isBodyTooLarge(exception: unknown): exception is { type: 'entity.too.large'; limit: number } {
  return typeof exception === 'object' && exception !== null && (exception as { type?: unknown }).type === 'entity.too.large';
}

function isContractBody(body: unknown): body is Record<string, unknown> & { code: string } {
  return typeof body === 'object' && body !== null && typeof (body as { code?: unknown }).code === 'string';
}

function contractFields(body: Record<string, unknown> & { code: string }): Record<string, unknown> {
  const { statusCode: _statusCode, error: _error, ...rest } = body;
  return rest;
}
