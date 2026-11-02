import { createHash } from 'crypto';
import type { Db } from '../billing/db';
import { BillingError } from '../billing/errors';

/**
 * Inside a transaction: locks the person's `users` row `FOR SHARE` and says
 * whether they still exist and are not being deleted. Account deletion sets
 * `deletion_requested_at` with an UPDATE (which waits for these locks) and
 * removes the row at the end, so a writer that checks here cannot save data
 * after deletion has started.
 */
export async function isLivePerson(db: Db, authUserId: string): Promise<boolean> {
  const res = await db.query<{ deletion_requested_at: Date | null }>(
    `SELECT deletion_requested_at FROM users WHERE auth_user_id = $1 FOR SHARE`,
    [authUserId],
  );
  const row = res.rows[0];
  return Boolean(row) && row!.deletion_requested_at === null;
}

/** `isLivePerson`, or `permission_denied` with `reason: account_deleted`. */
export async function requireLivePerson(db: Db, authUserId: string): Promise<void> {
  if (!(await isLivePerson(db, authUserId))) {
    throw new BillingError('permission_denied', { reason: 'account_deleted' });
  }
}

/** SQL condition for a one-statement insert: the person at `$n` still exists and is not being deleted. */
export function livePersonCondition(param: number): string {
  return `EXISTS (SELECT 1 FROM users WHERE auth_user_id = $${param} AND deletion_requested_at IS NULL)`;
}

/** A stable, non-reversible id for keys and storage paths, so the raw sign-in id is not written into them. */
export function personKey(authUserId: string): string {
  return createHash('sha256').update(authUserId).digest('hex').slice(0, 32);
}

/**
 * For a metered save: the spender is live when their `users` row exists and
 * is not being deleted. With no `users` row, the account is live only while
 * its billing account still names a sign-in id (deletion clears it), so
 * accounts created without an identity row keep working.
 */
export async function isLiveSpender(db: Db, spender: { authUserId: string; billingAccountId: string }): Promise<boolean> {
  const user = await db.query<{ deletion_requested_at: Date | null }>(
    `SELECT deletion_requested_at FROM users WHERE auth_user_id = $1 FOR SHARE`,
    [spender.authUserId],
  );
  if (user.rows[0]) return user.rows[0].deletion_requested_at === null;
  const account = await db.query<{ auth_user_id: string | null }>(
    `SELECT auth_user_id FROM billing_accounts WHERE id = $1`,
    [spender.billingAccountId],
  );
  return Boolean(account.rows[0]?.auth_user_id);
}
