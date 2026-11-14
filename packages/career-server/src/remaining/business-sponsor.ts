import type { Db } from '../billing/db';

/**
 * Business pooled usage (spec section "Business": "All usage is pooled").
 *
 * A person who accepted a Business candidate invitation and is still active in
 * that workspace spends from the Business account's pool, not from a pool of
 * their own: the organization pays for its candidates. Their data stays theirs
 * (own workspace, own records); only the billing account that is charged and
 * whose plan sets the limits changes.
 *
 * Applies only while the person's OWN account is on Free (no own plan, or a V1
 * plan that maps to Free). Someone who pays for their own plan keeps using it,
 * so the organization is never charged for a person who already pays, and the
 * person's purchase is never left idle. (Product decision recorded in
 * docs/V2_INTEGRATION.md; a client may prefer "always the Business pool".)
 *
 * The sponsoring account must itself be a live Business account. An archived
 * or departed candidate, a revoked/expired invitation, a cancelled Business
 * plan, or a person whose deletion has started is never sponsored.
 */
export interface BusinessSponsor {
  /** The Business account that is charged. */
  billingAccountId: string;
  /** The Business workspace (tenant) the candidacy belongs to. */
  businessWorkspaceId: string;
  candidateId: string;
}

/** Account states that still carry a Business plan's allowances (canceled/incomplete do not). */
const SPONSORING_STATUSES = ['active', 'trialing', 'past_due'];

export async function businessSponsorFor(db: Db, authUserId: string): Promise<BusinessSponsor | null> {
  const res = await db.query<{ billing_account_id: string; workspace_id: string; candidate_id: string }>(
    `SELECT ba.id AS billing_account_id, bc.workspace_id, bc.id AS candidate_id
       FROM users u
       JOIN workspaces w ON w.owner_user_id = u.id AND w.kind = 'individual'
       JOIN billing_accounts own ON own.workspace_id = w.id
       JOIN business_candidates bc ON bc.member_user_id = u.id
       JOIN billing_accounts ba ON ba.workspace_id = bc.workspace_id
      WHERE u.auth_user_id = $1
        AND u.deletion_requested_at IS NULL
        AND own.plan_id = 'free'
        AND bc.status = 'active'
        AND bc.accepted_at IS NOT NULL
        AND ba.plan_id = 'business'
        AND ba.status = ANY($2::text[])
      ORDER BY bc.accepted_at, bc.id
      LIMIT 1`,
    [authUserId, SPONSORING_STATUSES],
  );
  const row = res.rows[0];
  return row ? { billingAccountId: row.billing_account_id, businessWorkspaceId: row.workspace_id, candidateId: row.candidate_id } : null;
}

/**
 * The person as a spender against the Business pool: same identity and
 * workspace (their records stay theirs), the Business billing account.
 */
export function sponsoredSpender<T extends { billingAccountId: string }>(person: T, sponsor: BusinessSponsor | null): T {
  return sponsor ? { ...person, billingAccountId: sponsor.billingAccountId } : person;
}

/**
 * Who a ledger row is attributed to inside a pooled account: the spender when
 * they spend from an account that is not their own workspace's (a sponsored
 * candidate), else null as before. The column is cleared on erasure.
 */
export function pooledCandidate(account: { workspace_id: string }, spender: { workspaceId: string; authUserId: string }): string | null {
  return account.workspace_id === spender.workspaceId ? null : spender.authUserId;
}
