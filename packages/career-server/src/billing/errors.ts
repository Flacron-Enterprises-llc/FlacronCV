/**
 * Codes from docs/API_CONTRACT.md "Errors", plus internal codes the API
 * maps to its own responses (`not_found`, `reservation_closed`,
 * `catalog_conflict`, `billing_inactive`, `request_in_progress`).
 *
 * The class keeps its first name; every server module throws it for any
 * contract error, not only billing ones.
 */
export type BillingErrorCode =
  | 'quota_exhausted'
  | 'plan_upgrade_required'
  | 'idempotency_mismatch'
  | 'validation_error'
  | 'not_purchasable'
  | 'billing_inactive'
  | 'not_found'
  | 'reservation_closed'
  | 'catalog_conflict'
  | 'channel_unavailable'
  | 'unauthenticated'
  | 'provider_unavailable'
  | 'permission_denied'
  | 'feature_unavailable'
  | 'capacity_exceeded'
  | 'request_in_progress'
  | 'import_daily_limit'
  | 'stale_estimate'
  | 'rate_limited'
  | 'revision_conflict'
  | 'record_deleted';

export class BillingError extends Error {
  constructor(
    readonly code: BillingErrorCode,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'BillingError';
  }
}

export function isBillingError(error: unknown, code?: BillingErrorCode): error is BillingError {
  return error instanceof BillingError && (code === undefined || error.code === code);
}
