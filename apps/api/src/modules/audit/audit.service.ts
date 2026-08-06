import { Injectable, Logger } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { v4 as uuidv4 } from 'uuid';
import { AuditActionValue } from './audit-actions';

export interface AuditLogEntry {
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: AuditActionValue | string;
  resource: string;
  resourceId: string;
  changes?: { before?: unknown; after?: unknown };
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/** The actor for an event with no signed-in human behind it (Stripe webhooks). */
export const SYSTEM_ACTOR = {
  actorId: 'system',
  actorEmail: 'system',
  actorRole: 'system',
} as const;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private firebaseAdmin: FirebaseAdminService) {}

  /**
   * Recursively replace `undefined` with `null`.
   *
   * Firestore REJECTS a write containing an `undefined` value anywhere in the
   * document. Because `log()` swallows its own errors (auditing must never
   * break the action it records), such a write fails silently and the row is
   * lost — the worst possible outcome for an audit trail. Callers legitimately
   * pass optionals that can be undefined (`req.ip`, a user with no `email`, a
   * metadata field that wasn't set), so normalise here rather than asking every
   * call site to remember.
   */
  private static sanitize<T>(value: T): T {
    if (value === undefined) return null as unknown as T;
    if (value === null || value instanceof Date) return value;
    if (Array.isArray(value)) return value.map((v) => AuditService.sanitize(v)) as unknown as T;
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = AuditService.sanitize(v);
      }
      return out as T;
    }
    return value;
  }

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const id = uuidv4();
      await this.firebaseAdmin.firestore
        .collection('audit_logs')
        .doc(id)
        .set(
          AuditService.sanitize({
            id,
            ...entry,
            changes: entry.changes ?? null,
            createdAt: new Date(),
          }),
        );
    } catch (error) {
      // Auditing must never break the action being audited.
      this.logger.error(`Failed to write audit log: ${(error as Error).message}`);
    }
  }

  /**
   * Record an event attributed to the acting end user rather than to an admin.
   * Used for sign-in/out, AI generations, exports and ticket activity, where
   * "who did it" is the user themselves.
   */
  async logUserAction(
    action: AuditActionValue | string,
    user: { uid: string; email?: string; role?: string },
    resource: string,
    resourceId: string,
    extra: { metadata?: Record<string, unknown>; ipAddress?: string; userAgent?: string } = {},
  ): Promise<void> {
    await this.log({
      actorId: user.uid,
      actorEmail: user.email || 'unknown',
      actorRole: user.role || 'user',
      action,
      resource,
      resourceId,
      ...extra,
    });
  }

  /** Record an event with no human actor (Stripe webhooks, scheduled jobs). */
  async logSystemAction(
    action: AuditActionValue | string,
    resource: string,
    resourceId: string,
    extra: { metadata?: Record<string, unknown>; changes?: { before?: unknown; after?: unknown } } = {},
  ): Promise<void> {
    await this.log({ ...SYSTEM_ACTOR, action, resource, resourceId, ...extra });
  }
}
