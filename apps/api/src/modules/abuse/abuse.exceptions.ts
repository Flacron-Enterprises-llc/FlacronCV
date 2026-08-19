import { HttpException, HttpStatus } from '@nestjs/common';

export const ABUSE_CODE = {
  GRANT_BLOCKED: 'ABUSE_GRANT_BLOCKED',
  STEP_UP: 'ABUSE_STEP_UP',
  EMAIL_UNVERIFIED: 'ABUSE_EMAIL_UNVERIFIED',
  NETWORK_CREATE_CAP: 'ABUSE_NETWORK_CREATE_CAP',
  UID_RATE_LIMIT: 'ABUSE_UID_RATE_LIMIT',
  IDEMPOTENCY_CONFLICT: 'ABUSE_IDEMPOTENCY_CONFLICT',
} as const;

export type AbuseCode = (typeof ABUSE_CODE)[keyof typeof ABUSE_CODE];

const MESSAGES: Record<AbuseCode, string> = {
  [ABUSE_CODE.GRANT_BLOCKED]:
    'The Free allowance is not available on this account. You can upgrade, contact support, or wait for a review.',
  [ABUSE_CODE.STEP_UP]:
    'Please wait before using the Free allowance, or upgrade. Your account stays open.',
  [ABUSE_CODE.EMAIL_UNVERIFIED]:
    'Verify your email to create new documents. Your existing files stay readable, editable, and exportable.',
  [ABUSE_CODE.NETWORK_CREATE_CAP]:
    'Too many new accounts from this network right now. Please try again later.',
  [ABUSE_CODE.UID_RATE_LIMIT]: 'Too many requests. Please wait a few minutes and try again.',
  [ABUSE_CODE.IDEMPOTENCY_CONFLICT]:
    'This request is already in progress. Please wait and try again.',
};

export function throwAbuse(code: AbuseCode, status?: number): never {
  const httpStatus =
    status ??
    (code === ABUSE_CODE.NETWORK_CREATE_CAP || code === ABUSE_CODE.UID_RATE_LIMIT
      ? HttpStatus.TOO_MANY_REQUESTS
      : code === ABUSE_CODE.IDEMPOTENCY_CONFLICT
        ? HttpStatus.CONFLICT
        : HttpStatus.FORBIDDEN);
  throw new HttpException({ statusCode: httpStatus, code, message: MESSAGES[code] }, httpStatus);
}
