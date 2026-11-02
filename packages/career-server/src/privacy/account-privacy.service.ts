import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { Clock } from '../billing/billing.service';
import { withTransaction } from '../billing/db';
import type { Db } from '../billing/db';
import { BillingError, isBillingError } from '../billing/errors';
import { isFreshSignIn } from '../identity/id-token';
import type { IdTokenVerifier, VerifiedIdentity } from '../identity/id-token';
import type { Principal } from '../identity/identity.service';
import { UnconfiguredSignInDeleter } from '../identity/sign-in-deleter';
import type { SignInDeleter } from '../identity/sign-in-deleter';
import type { ObjectStorage } from '../storage/object-storage';
import { personKey, requireLivePerson } from './live-person';
import { personalExport } from './personal-export';

/** A download link lasts one hour. The account is not deleted by an export. */
export const EXPORT_LINK_TTL_MS = 60 * 60 * 1000;

const APPLE_CANCEL_URL = 'https://apps.apple.com/account/subscriptions';
const GOOGLE_CANCEL_URL = 'https://play.google.com/store/account/subscriptions';
const systemClock: Clock = { now: () => new Date() };

/** A Stripe subscription in these states still charges; it must be set to cancel before the account goes. */
const CHARGING_STATES = ['active', 'trialing', 'past_due'];

/** An erase interrupted after the sign-in was deleted is finished by the sweep once the request is surely over. */
export const INTERRUPTED_DELETION_AFTER_MS = 15 * 60_000;
/** ID tokens last an hour; a deleted uid is remembered a little longer so an old token cannot open a new account. */
export const DELETED_SIGN_IN_MEMORY_MS = 2 * 60 * 60_000;
/** V1 integration: how often each career user is re-checked for a closed V1 account. */
export const V1_CLOSURE_RECHECK_MS = 24 * 60 * 60_000;

/** What `deleteAccount` keeps, by table: accounting rows with the sign-in id cleared (OPEN_DECISIONS 21). */
export const RETAINED_AFTER_DELETION = [
  'billing_accounts (sign-in id cleared; provider customer id kept for refunds and disputes)',
  'usage_ledger, usage_balances (candidate id cleared; the ledger is append-only)',
  'purchases, packs, billing_events, checkout_sessions, usage_warnings, organization_entitlements, voice_meter_remainders',
  'workspaces (name and owner cleared; billing rows reference it)',
  'admin_audit (actor replaced with "deleted-account" when the person was an operator)',
  'migration_keys (V1 document ids only; V2 has no V1 import, so normally empty)',
  'deleted_sign_ins (the random sign-in id only, for two hours, so a token issued before deletion cannot open a new account)',
] as const;

export interface ExportTicket {
  id: string;
  status: 'queued' | 'ready' | 'failed';
  url?: string;
  expiresAt?: string;
}

export interface DeleteResult {
  deleted: true;
  storeSubscription?: { provider: 'apple' | 'google'; cancelUrl: string };
}

/**
 * A copy of the person's own records, then deletion of those records.
 *
 * Deletion runs in steps so it can be retried and cannot be undone by late
 * writers:
 * 1. mark the account (`users.deletion_requested_at`), which waits for any
 *    writer holding the person's live-person lock and makes later writers
 *    and requests refuse;
 * 2. delete every stored object (exports, evidence files, recorded upload
 *    intents); a refused delete stops here with the account still marked;
 * 3. erase the personal rows and check that none remain;
 * 4. delete the person's sign-in from V2's own Firebase project (never V1's:
 *    `SignInDeleter`), and record that it is gone;
 * 5. erase again and only then remove the `users` row.
 * Until step 4 the person can sign in and repeat the request, which resumes.
 * After it they cannot, so an erase interrupted in step 5 is finished by
 * `finishInterruptedDeletions`. Success is returned only after step 5
 * commits. Accounting rows stay with the sign-in id cleared
 * (`RETAINED_AFTER_DELETION`).
 */
export class AccountPrivacyService {
  constructor(
    private readonly pool: Pool,
    private readonly tokens: IdTokenVerifier,
    private readonly storage: ObjectStorage,
    private readonly clock: Clock = systemClock,
    private readonly signIns: SignInDeleter = new UnconfiguredSignInDeleter(),
  ) {}

  async startExport(owner: Principal, scope: string | undefined): Promise<{ id: string; status: 'queued' }> {
    if (scope !== 'personal' && scope !== 'workspace') {
      throw new BillingError('validation_error', { field: 'scope', reason: 'invalid' });
    }
    await this.pruneExpiredExports(owner);
    const id = randomUUID();
    // The key is recorded before the file is written, so deletion finds it even if this export fails half way.
    const key = `exports/${personKey(owner.authUserId)}/${id}.json`;
    await this.pool.query(
      `INSERT INTO account_exports (id, billing_account_id, auth_user_id, scope, status, object_key)
       VALUES ($1, $2, $3, $4, 'queued', $5)`,
      [id, owner.billingAccountId, owner.authUserId, scope, key],
    );
    let written = false;
    try {
      await withTransaction(this.pool, async (db) => {
        await requireLivePerson(db, owner.authUserId);
        const body = await personalExport(db, owner, { scope, generatedAt: this.clock.now() });
        await this.storage.put(key, Buffer.from(JSON.stringify(body)), 'application/json');
        written = true;
        const expires = new Date(this.clock.now().getTime() + EXPORT_LINK_TTL_MS);
        await db.query(`UPDATE account_exports SET status = 'ready', expires_at = $2 WHERE id = $1`, [id, expires]);
      });
    } catch (error) {
      // The key is dropped only when no object can exist: storage was never configured, or the cleanup delete worked.
      const neverStored = !written && isBillingError(error, 'provider_unavailable') && error.details.reason === 'storage_not_configured';
      let gone = neverStored;
      if (!gone) gone = await this.storage.delete(key).then(() => true, () => false);
      await this.pool
        .query(`UPDATE account_exports SET status = 'failed', object_key = CASE WHEN $2 THEN NULL ELSE object_key END WHERE id = $1`, [id, gone])
        .catch(() => undefined);
      if (error instanceof BillingError) throw error;
      throw new BillingError('provider_unavailable', { reason: 'storage_not_configured' });
    }
    return { id, status: 'queued' };
  }

  async readExport(owner: Principal, exportId: string): Promise<ExportTicket> {
    const rows = await this.pool.query<{ status: string; object_key: string | null; expires_at: Date | null }>(
      `SELECT status, object_key, expires_at FROM account_exports WHERE id = $1 AND auth_user_id = $2`,
      [exportId, owner.authUserId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.status !== 'ready' || !row.object_key || !row.expires_at || row.expires_at <= this.clock.now()) {
      return { id: exportId, status: row.status === 'queued' ? 'queued' : 'failed' };
    }
    const url = await this.storage.signedUrl(row.object_key, row.expires_at, { fileName: 'flacroncv-export.json', contentType: 'application/json' });
    return { id: exportId, status: 'ready', url, expiresAt: row.expires_at.toISOString() };
  }

  async deleteAccount(owner: Principal, input: { idToken?: string; confirm?: string }): Promise<DeleteResult> {
    if (input.confirm !== 'DELETE') throw new BillingError('validation_error', { field: 'confirm', reason: 'invalid' });
    if (!input.idToken) throw new BillingError('validation_error', { field: 'idToken', reason: 'invalid' });
    const identity = await this.tokens.verify(input.idToken);
    if (identity.uid !== owner.authUserId) throw new BillingError('permission_denied');
    if (!isFreshSignIn(identity, this.clock.now())) {
      throw new BillingError('validation_error', { field: 'idToken', reason: 'stale' });
    }
    const account = await this.pool.query<{ provider: string | null; status: string; cancel_at_period_end: boolean }>(
      `SELECT provider, status, cancel_at_period_end FROM billing_accounts WHERE id = $1`,
      [owner.billingAccountId],
    );
    const provider = account.rows[0]?.provider ?? null;
    const status = account.rows[0]?.status ?? '';
    // Stripe can only be cancelled from its hosted portal, which is unreachable once the account is gone.
    if (provider === 'stripe' && CHARGING_STATES.includes(status) && !account.rows[0]?.cancel_at_period_end) {
      throw new BillingError('validation_error', { field: 'subscription', reason: 'cancel_first' });
    }
    // Without a way to remove the sign-in nothing starts: a half-deleted account that can still sign in helps nobody.
    if (this.signIns instanceof UnconfiguredSignInDeleter) {
      throw new BillingError('provider_unavailable', { reason: 'sign_in_deletion_not_configured' });
    }

    // 1. Mark. The UPDATE waits for writers holding the live-person lock; after it, they refuse.
    await this.pool.query(
      `UPDATE users SET deletion_requested_at = COALESCE(deletion_requested_at, $2) WHERE auth_user_id = $1`,
      [owner.authUserId, this.clock.now()],
    );

    // 2. Stored objects. Deleting a missing object succeeds, so a retry repeats this safely.
    for (const key of await storedObjectKeys(this.pool, owner)) await this.storage.delete(key);

    // 3. Rows, then a check, then the users row. The account's own links (users row, workspace owner,
    // billing sign-in id) go only in the last transaction, so a retry before then still finds the account.
    await this.eraseAndCheck(owner, false);

    // 4. The V2 sign-in. A failure here leaves the account marked and the sign-in usable, so the person retries.
    const state = await this.pool.query<{ sign_in_deleted_at: Date | null }>(
      `SELECT sign_in_deleted_at FROM users WHERE auth_user_id = $1`,
      [owner.authUserId],
    );
    if (!state.rows[0]?.sign_in_deleted_at) {
      await this.signIns.deleteSignIn(input.idToken);
      await this.pool.query(`UPDATE users SET sign_in_deleted_at = $2 WHERE auth_user_id = $1`, [owner.authUserId, this.clock.now()]);
    }

    // 5. The last pass removes the users row.
    await this.eraseAndCheck(owner, true);

    const liveStore = (provider === 'apple' || provider === 'google') && (status === 'active' || status === 'trialing');
    if (!liveStore) return { deleted: true };
    return {
      deleted: true,
      storeSubscription: {
        provider,
        cancelUrl: provider === 'apple' ? APPLE_CANCEL_URL : GOOGLE_CANCEL_URL,
      },
    };
  }

  /**
   * Finishes deletions whose sign-in is already gone but whose last erase
   * did not commit (the request failed after step 4). Also forgets deleted
   * sign-in ids once no token issued before the deletion can still be valid.
   * Safe to run from several processes: each account is erased under its lock.
   */
  async finishInterruptedDeletions(limit = 20): Promise<{ finished: number; failed: number }> {
    const now = this.clock.now();
    await this.pool.query(`DELETE FROM deleted_sign_ins WHERE deleted_at < $1`, [new Date(now.getTime() - DELETED_SIGN_IN_MEMORY_MS)]);
    const due = await this.pool.query<{
      user_id: string;
      auth_user_id: string;
      locale: Principal['locale'];
      workspace_id: string;
      billing_account_id: string;
      origin: Principal['origin'];
    }>(
      `SELECT u.id AS user_id, u.auth_user_id, u.locale, w.id AS workspace_id, b.id AS billing_account_id, b.origin
         FROM users u
         JOIN workspaces w ON w.owner_user_id = u.id AND w.kind = 'individual'
         JOIN billing_accounts b ON b.workspace_id = w.id
        WHERE u.sign_in_deleted_at IS NOT NULL AND u.sign_in_deleted_at < $1
        ORDER BY u.sign_in_deleted_at
        LIMIT $2`,
      [new Date(now.getTime() - INTERRUPTED_DELETION_AFTER_MS), limit],
    );
    let finished = 0;
    let failed = 0;
    for (const row of due.rows) {
      const identity: VerifiedIdentity = { uid: row.auth_user_id, email: null, emailVerified: false, authTime: now, issuedAt: now, signInProvider: null };
      const owner: Principal = {
        userId: row.user_id,
        authUserId: row.auth_user_id,
        workspaceId: row.workspace_id,
        billingAccountId: row.billing_account_id,
        locale: row.locale,
        origin: row.origin,
        identity,
      };
      try {
        for (const key of await storedObjectKeys(this.pool, owner)) await this.storage.delete(key);
        await this.eraseAndCheck(owner, false);
        await this.eraseAndCheck(owner, true);
        finished += 1;
      } catch {
        failed += 1;
      }
    }
    return { finished, failed };
  }

  /**
   * V1 integration backstop. Erases the career data of people whose V1
   * account V1 has closed, checking each user about once a day.
   *
   * `isClosed` must answer true only on positive evidence of closure (V1's
   * soft delete or deactivation). An unknown or missing V1 record answers
   * false, so a read gap can never erase anyone. Safe to run from several
   * processes: each erase runs under the account's lock.
   */
  async eraseClosedV1Accounts(
    isClosed: (authUserId: string) => Promise<boolean>,
    limit = 20,
  ): Promise<{ checked: number; erased: number; failed: number }> {
    const now = this.clock.now();
    const due = await this.pool.query<{
      user_id: string;
      auth_user_id: string;
      locale: Principal['locale'];
      workspace_id: string;
      billing_account_id: string;
      origin: Principal['origin'];
    }>(
      `SELECT u.id AS user_id, u.auth_user_id, u.locale, w.id AS workspace_id, b.id AS billing_account_id, b.origin
         FROM users u
         JOIN workspaces w ON w.owner_user_id = u.id AND w.kind = 'individual'
         JOIN billing_accounts b ON b.workspace_id = w.id
        WHERE (u.deletion_requested_at IS NULL OR u.deletion_requested_at < $3)
          AND (u.v1_closure_checked_at IS NULL OR u.v1_closure_checked_at < $1)
        ORDER BY u.v1_closure_checked_at NULLS FIRST
        LIMIT $2`,
      // A row marked earlier but not erased (storage or database failed mid-erase,
      // or a person's own deletion stalled) is picked up again once the attempt is
      // surely over. Without this it was never retried: V1 had closed the account,
      // so the person could not retry either.
      [new Date(now.getTime() - V1_CLOSURE_RECHECK_MS), limit, new Date(now.getTime() - INTERRUPTED_DELETION_AFTER_MS)],
    );
    let erased = 0;
    let failed = 0;
    for (const row of due.rows) {
      try {
        if (!(await isClosed(row.auth_user_id))) {
          await this.pool.query(`UPDATE users SET v1_closure_checked_at = $2 WHERE id = $1`, [row.user_id, now]);
          continue;
        }
        const identity: VerifiedIdentity = { uid: row.auth_user_id, email: null, emailVerified: false, authTime: now, issuedAt: now, signInProvider: null };
        const owner: Principal = {
          userId: row.user_id,
          authUserId: row.auth_user_id,
          workspaceId: row.workspace_id,
          billingAccountId: row.billing_account_id,
          locale: row.locale,
          origin: row.origin,
          identity,
        };
        await this.pool.query(
          `UPDATE users SET deletion_requested_at = COALESCE(deletion_requested_at, $2) WHERE id = $1`,
          [row.user_id, now],
        );
        for (const key of await storedObjectKeys(this.pool, owner)) await this.storage.delete(key);
        await this.eraseAndCheck(owner, false);
        await this.eraseAndCheck(owner, true);
        erased += 1;
      } catch {
        // V1, storage or the database failed: the closure check is not stamped, so a
        // later tick retries it (after INTERRUPTED_DELETION_AFTER_MS if it was marked).
        failed += 1;
      }
    }
    return { checked: due.rows.length, erased, failed };
  }

  /** One erase pass, a check, a second pass if anything was written meanwhile, then a final check. */
  private async eraseAndCheck(owner: Principal, final: boolean): Promise<void> {
    const pass = () =>
      withTransaction(this.pool, async (db) => {
        await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`user:${owner.authUserId}`]);
        await erasePersonalData(db, owner, { removeUser: final, now: this.clock.now() });
      });
    await pass();
    let left = await remainingPersonalData(this.pool, owner, { final });
    if (left.length > 0) {
      await pass();
      left = await remainingPersonalData(this.pool, owner, { final });
    }
    if (left.length > 0) throw new AccountDeletionIncomplete(left);
  }

  /** Expired exports are deleted when a new one starts; a refused delete keeps the key for later. */
  private async pruneExpiredExports(owner: Principal): Promise<void> {
    const expired = await this.pool.query<{ id: string; object_key: string }>(
      `SELECT id, object_key FROM account_exports
        WHERE auth_user_id = $1 AND object_key IS NOT NULL AND (status <> 'ready' OR expires_at <= $2)`,
      [owner.authUserId, this.clock.now()],
    );
    for (const row of expired.rows) {
      try {
        await this.storage.delete(row.object_key);
        await this.pool.query(`UPDATE account_exports SET object_key = NULL WHERE id = $1`, [row.id]);
      } catch {
        // Kept: the next export or the account deletion tries again.
      }
    }
  }
}

/** Not a success: personal rows remained after two erase passes. The account stays marked, so the request can be retried. */
export class AccountDeletionIncomplete extends Error {
  constructor(readonly tables: string[]) {
    super(`account deletion incomplete: ${tables.join(', ')}`);
    this.name = 'AccountDeletionIncomplete';
  }
}

/** Every object key the person's rows point at, plus keys recorded before an upload that may have failed. */
async function storedObjectKeys(pool: Pool, owner: Principal): Promise<string[]> {
  const res = await pool.query<{ key: string }>(
    `SELECT object_key AS key FROM account_exports WHERE auth_user_id = $1 AND object_key IS NOT NULL
     UNION SELECT attachment_object_key FROM career_evidence WHERE candidate_auth_user_id = $1 AND attachment_object_key IS NOT NULL
     UNION SELECT object_key FROM stored_object_intents WHERE candidate_auth_user_id = $1`,
    [owner.authUserId],
  );
  return res.rows.map((row) => row.key);
}

/** Personal rows by sign-in id, and the owner's own workspace rows that only make sense with the account. */
export const PERSONAL_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['alert_items', 'recipient_auth_user_id'],
  ['digests', 'recipient_auth_user_id'],
  ['alert_settings', 'candidate_auth_user_id'],
  ['saved_searches', 'candidate_auth_user_id'],
  ['followed_companies', 'candidate_auth_user_id'],
  ['location_profiles', 'candidate_auth_user_id'],
  ['applications', 'candidate_auth_user_id'],
  ['interview_sessions', 'candidate_auth_user_id'],
  ['star_stories', 'candidate_auth_user_id'],
  ['match_results', 'candidate_auth_user_id'],
  ['action_packs', 'candidate_auth_user_id'],
  ['skill_gap_reports', 'candidate_auth_user_id'],
  ['candidate_specialist_modes', 'candidate_auth_user_id'],
  ['voice_interview_sessions', 'candidate_auth_user_id'],
  ['recording_consents', 'candidate_auth_user_id'],
  ['career_scenarios', 'candidate_auth_user_id'],
  ['assisted_form_sessions', 'candidate_auth_user_id'],
  ['map_sessions', 'candidate_auth_user_id'],
  ['career_achievements', 'candidate_auth_user_id'],
  ['career_promotion_goals', 'candidate_auth_user_id'],
  ['credential_reminders', 'candidate_auth_user_id'],
  ['opportunity_reports', 'candidate_auth_user_id'],
  ['opportunity_reports', 'reviewer_auth_user_id'],
  ['recruiting_opt_ins', 'candidate_auth_user_id'],
  ['portfolios', 'candidate_auth_user_id'],
  ['business_staff', 'auth_user_id'],
  ['writing_documents', 'candidate_auth_user_id'],
  ['resumes', 'candidate_auth_user_id'],
  ['career_evidence', 'candidate_auth_user_id'],
  ['career_facts', 'candidate_auth_user_id'],
  ['resume_imports', 'candidate_auth_user_id'],
  ['career_profiles', 'candidate_auth_user_id'],
  ['import_daily_counts', 'auth_user_id'],
  ['ai_jobs', 'owner_auth_user_id'],
  ['stored_object_intents', 'candidate_auth_user_id'],
  ['shared_record_tombstones', 'candidate_auth_user_id'],
  ['shared_record_requests', 'auth_user_id'],
  ['opportunities', 'candidate_auth_user_id'],
  ['account_exports', 'auth_user_id'],
  ['admin_audit', 'actor_auth_user_id'],
  ['usage_ledger', 'candidate_auth_user_id'],
  ['usage_balances', 'candidate_auth_user_id'],
  ['billing_accounts', 'auth_user_id'],
];
/** Cleared only in the final pass, because the account is found through them. */
const ACCOUNT_LINKS = ['usage_ledger', 'usage_balances', 'billing_accounts'];
export const OWNER_WORKSPACE_TABLES = ['api_keys', 'white_label_configs', 'business_staff', 'business_candidates'] as const;

/**
 * Tables that still hold the person's id (or the owner workspace's records).
 * Empty after a complete erase. Before the final pass, the account's own
 * links are not counted.
 */
export async function remainingPersonalData(db: Db, owner: Principal, options: { final: boolean } = { final: true }): Promise<string[]> {
  const left: string[] = [];
  for (const [table, column] of PERSONAL_COLUMNS) {
    if (!options.final && ACCOUNT_LINKS.includes(table)) continue;
    const res = await db.query(`SELECT 1 FROM ${table} WHERE ${column} = $1 LIMIT 1`, [owner.authUserId]);
    if (res.rows.length > 0) left.push(`${table}.${column}`);
  }
  for (const table of OWNER_WORKSPACE_TABLES) {
    const res = await db.query(`SELECT 1 FROM ${table} WHERE workspace_id = $1 LIMIT 1`, [owner.workspaceId]);
    if (res.rows.length > 0) left.push(`${table}.workspace_id`);
  }
  if (owner.identity?.email) {
    const res = await db.query(`SELECT 1 FROM business_candidates WHERE lower(email) = lower($1) LIMIT 1`, [owner.identity.email]);
    if (res.rows.length > 0) left.push('business_candidates.email');
  }
  if (!options.final) return left;
  const user = await db.query(`SELECT 1 FROM users WHERE auth_user_id = $1`, [owner.authUserId]);
  if (user.rows.length > 0) left.push('users.auth_user_id');
  const workspace = await db.query(`SELECT 1 FROM workspaces WHERE id = $1 AND (name IS NOT NULL OR owner_user_id IS NOT NULL)`, [owner.workspaceId]);
  if (workspace.rows.length > 0) left.push('workspaces.name_or_owner');
  return left;
}

async function erasePersonalData(db: Db, owner: Principal, options: { removeUser: boolean; now: Date }): Promise<void> {
  const uid = owner.authUserId;
  const ws = owner.workspaceId;
  const email = owner.identity?.email?.trim().toLowerCase() || null;
  const run = (sql: string, params: unknown[] = [uid]) => db.query(sql, params);

  await run(`DELETE FROM notification_deliveries WHERE alert_item_id IN (SELECT id FROM alert_items WHERE recipient_auth_user_id = $1)`);
  await run(`DELETE FROM digests WHERE recipient_auth_user_id = $1`);
  await run(`DELETE FROM alert_items WHERE recipient_auth_user_id = $1`);
  await run(`DELETE FROM alert_settings WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM saved_searches WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM followed_companies WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM location_profiles WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM application_reminders WHERE application_id IN (SELECT id FROM applications WHERE candidate_auth_user_id = $1)`);
  await run(`DELETE FROM applications WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM interview_answers WHERE session_id IN (SELECT id FROM interview_sessions WHERE candidate_auth_user_id = $1)`);
  await run(`DELETE FROM interview_sessions WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM star_stories WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM match_results WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM action_packs WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM skill_gap_reports WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM candidate_specialist_modes WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM voice_audio_records WHERE session_id IN (SELECT id FROM voice_interview_sessions WHERE candidate_auth_user_id = $1)`);
  await run(`DELETE FROM voice_interview_sessions WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM recording_consents WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM career_scenarios WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM assisted_form_sessions WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM map_sessions WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM career_achievements WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM career_promotion_goals WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM credential_reminders WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM opportunity_reports WHERE candidate_auth_user_id = $1`);
  // An operator's review stays on the report; who reviewed it does not.
  await run(`UPDATE opportunity_reports SET reviewer_auth_user_id = NULL WHERE reviewer_auth_user_id = $1`);
  await run(`DELETE FROM recruiting_opt_ins WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM portfolios WHERE candidate_auth_user_id = $1`);

  // Business records: the person's staff seats anywhere, invitations naming their address, and the owner's own workspace.
  const staffWhere = `auth_user_id = $1 OR workspace_id = $2`;
  const candidateWhere = `workspace_id = $2 OR ($3::text IS NOT NULL AND lower(email) = $3)`;
  await run(
    `DELETE FROM business_assignments
      WHERE staff_id IN (SELECT id FROM business_staff WHERE ${staffWhere})
         OR candidate_id IN (SELECT id FROM business_candidates WHERE ${candidateWhere})`,
    [uid, ws, email],
  );
  await run(`DELETE FROM business_staff WHERE ${staffWhere}`, [uid, ws]);
  await run(`DELETE FROM business_candidates WHERE workspace_id = $1 OR ($2::text IS NOT NULL AND lower(email) = $2)`, [ws, email]);
  await run(`DELETE FROM api_keys WHERE workspace_id = $1`, [ws]);
  await run(`DELETE FROM white_label_configs WHERE workspace_id = $1`, [ws]);

  await run(`DELETE FROM writing_documents WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM resumes WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM career_evidence WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM career_facts WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM resume_imports WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM career_profiles WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM import_daily_counts WHERE auth_user_id = $1`);
  await run(`DELETE FROM ai_jobs WHERE owner_auth_user_id = $1`);
  await run(`DELETE FROM estimates WHERE billing_account_id = $1`, [owner.billingAccountId]);
  // Called only after their objects were deleted (deleteAccount step 2).
  await run(`DELETE FROM stored_object_intents WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM shared_record_tombstones WHERE candidate_auth_user_id = $1`);
  await run(`DELETE FROM shared_record_requests WHERE auth_user_id = $1`);

  const pastes = await db.query<{ id: string }>(
    `SELECT o.id FROM opportunities o
      WHERE o.candidate_auth_user_id = $1
        AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.opportunity_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM interview_sessions s WHERE s.opportunity_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM voice_interview_sessions v WHERE v.opportunity_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM match_results m WHERE m.opportunity_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM alert_items i WHERE i.opportunity_id = o.id)
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_revisions r
            JOIN writing_documents w ON w.opportunity_revision_id = r.id
           WHERE r.opportunity_id = o.id)
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_revisions r
            JOIN resume_versions v ON v.opportunity_revision_id = r.id
           WHERE r.opportunity_id = o.id)`,
    [uid],
  );
  const ids = pastes.rows.map((row) => row.id);
  if (ids.length > 0) {
    await db.query(`UPDATE opportunities SET current_revision_id = NULL WHERE id = ANY($1::uuid[])`, [ids]);
    await db.query(`DELETE FROM opportunity_sources WHERE opportunity_id = ANY($1::uuid[])`, [ids]);
    await db.query(`DELETE FROM opportunity_revisions WHERE opportunity_id = ANY($1::uuid[])`, [ids]);
    await db.query(`DELETE FROM opportunities WHERE id = ANY($1::uuid[])`, [ids]);
  }

  await run(`DELETE FROM account_exports WHERE auth_user_id = $1`);
  await run(`UPDATE admin_audit SET actor_auth_user_id = 'deleted-account' WHERE actor_auth_user_id = $1`);
  if (!options.removeUser) return;

  await run(`UPDATE usage_ledger SET candidate_auth_user_id = NULL WHERE candidate_auth_user_id = $1`);
  await run(`UPDATE usage_balances SET candidate_auth_user_id = NULL WHERE candidate_auth_user_id = $1`);
  await run(`UPDATE billing_accounts SET auth_user_id = NULL WHERE id = $1`, [owner.billingAccountId]);
  await run(`UPDATE workspaces SET name = NULL, owner_user_id = NULL WHERE id = $1`, [ws]);
  // legal_acceptances and push_tokens go with the users row (ON DELETE CASCADE).
  await run(`DELETE FROM users WHERE auth_user_id = $1`);
  await run(`INSERT INTO deleted_sign_ins (auth_user_id, deleted_at) VALUES ($1, $2) ON CONFLICT (auth_user_id) DO NOTHING`, [uid, options.now]);
}
