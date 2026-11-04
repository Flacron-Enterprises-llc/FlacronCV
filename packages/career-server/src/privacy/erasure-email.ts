import type { VerifiedIdentity } from '../identity/id-token';

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

/**
 * The one email normalisation for business invitations and erasure:
 * trimmed and lower-cased, as `inviteCandidate` stores it. No other
 * rewriting (dots, plus tags) — a different string is a different address.
 */
export function normalizeInviteEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? '';
  return value.includes('@') ? value : null;
}

/**
 * Only an address the person's Firebase token marks verified identifies them.
 * An unverified address could be someone else's, and erasing by it would
 * delete invitations naming that other person.
 */
export function verifiedErasureEmail(identity: Pick<VerifiedIdentity, 'email' | 'emailVerified'> | null | undefined): string | null {
  return identity?.emailVerified ? normalizeInviteEmail(identity.email) : null;
}

/**
 * Keeps `users.erasure_email` current so a later erasure without a token
 * (resumed deletion, V1 closure sweep) can still find invitations naming the
 * person. Writes only when the verified address changed and the account is
 * not being deleted. The value lives on the person's own row and goes with it.
 */
export async function rememberErasureEmail(db: Db, authUserId: string, identity: Pick<VerifiedIdentity, 'email' | 'emailVerified'> | null | undefined): Promise<void> {
  const email = verifiedErasureEmail(identity);
  if (!email) return;
  await db.query(
    `UPDATE users SET erasure_email = $2
      WHERE auth_user_id = $1 AND deletion_requested_at IS NULL AND erasure_email IS DISTINCT FROM $2`,
    [authUserId, email],
  );
}

/** The address to erase invitations by: the recorded one, else a verified token address. */
export async function erasureEmailOf(
  db: Db,
  authUserId: string,
  identity: Pick<VerifiedIdentity, 'email' | 'emailVerified'> | null | undefined,
): Promise<string | null> {
  const res = (await db.query(`SELECT erasure_email FROM users WHERE auth_user_id = $1`, [authUserId])) as {
    rows: Array<{ erasure_email: string | null }>;
  };
  return res.rows[0]?.erasure_email ?? verifiedErasureEmail(identity);
}
