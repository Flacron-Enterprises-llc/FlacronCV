/**
 * The catalogue of actions recorded to the `audit_logs` collection — the
 * collection the admin Audit Logs page reads.
 *
 * Until now only three admin mutations wrote here, which is why that page
 * reported "No audit logs found" on a live system: nothing else was ever
 * recorded. The set below covers the activity the client asked to be able to
 * audit (sign-in/out and failed sign-ins, role changes, subscription changes,
 * template lifecycle, support-ticket updates, AI generations, exports, and
 * admin actions).
 *
 * Keep the string values stable — they are persisted on every historical row,
 * and the admin page filters on them.
 */
export const AuditAction = {
  // ── Authentication ────────────────────────────────────────────────────────
  LOGIN: 'AUTH_LOGIN',
  LOGOUT: 'AUTH_LOGOUT',
  LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  REGISTERED: 'AUTH_REGISTERED',
  PASSWORD_RESET_REQUESTED: 'AUTH_PASSWORD_RESET_REQUESTED',

  // ── User / role administration ────────────────────────────────────────────
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_REACTIVATED: 'USER_REACTIVATED',
  USER_DELETED: 'USER_DELETED',

  // ── Subscriptions & billing ───────────────────────────────────────────────
  SUBSCRIPTION_ACTIVATED: 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_CHANGED: 'SUBSCRIPTION_CHANGED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_REVOKED: 'SUBSCRIPTION_REVOKED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',

  // ── Templates ─────────────────────────────────────────────────────────────
  TEMPLATE_CREATED: 'TEMPLATE_CREATED',
  TEMPLATE_UPDATED: 'TEMPLATE_UPDATED',
  TEMPLATE_DELETED: 'TEMPLATE_DELETED',

  // ── Support ───────────────────────────────────────────────────────────────
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_CLOSED: 'TICKET_CLOSED',

  // ── Content generation & export ───────────────────────────────────────────
  AI_GENERATION: 'AI_GENERATION',
  DOCUMENT_EXPORTED: 'DOCUMENT_EXPORTED',

  // ── Admin (pre-existing values — do not rename) ───────────────────────────
  ADMIN_USER_UPDATED: 'ADMIN_USER_UPDATED',
  ADMIN_TICKET_REPLIED: 'ADMIN_TICKET_REPLIED',
  ADMIN_TICKET_UPDATED: 'ADMIN_TICKET_UPDATED',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];
