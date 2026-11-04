import type { Pool } from 'pg';
import { isLaunchLocale, LEGAL_VERSIONS, needsLegalAcceptance } from '@flacroncv/career-shared';
import type { AcceptedLegalVersions, Locale } from '@flacroncv/career-shared';
import { carriedAnchor, createFreeAccount } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import type { Db } from '../billing/db';
import { BillingError } from '../billing/errors';
import type { VerifiedIdentity } from './id-token';
import { rememberErasureEmail, verifiedErasureEmail } from '../privacy/erasure-email';

/** The caller on every authenticated request. Built from the verified token and our rows. */
export interface Principal {
  userId: string;
  authUserId: string;
  workspaceId: string;
  billingAccountId: string;
  locale: Locale;
  origin: 'v2' | 'migrated';
  identity: VerifiedIdentity;
}

export interface LegalAcceptanceView extends AcceptedLegalVersions {
  acceptedAt: Date;
}

export interface MeView {
  user: { id: string; authUserId: string; locale: Locale; email: string | null; emailVerified: boolean };
  workspaceId: string;
  billingAccountId: string;
  planId: string;
  legal: { required: typeof LEGAL_VERSIONS; accepted: LegalAcceptanceView | null; needsAcceptance: boolean };
}

export interface LegalAcceptanceInput extends AcceptedLegalVersions {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  disclaimerAccepted: boolean;
}

interface PrincipalRow {
  user_id: string;
  locale: Locale;
  workspace_id: string;
  billing_account_id: string;
  origin: 'v2' | 'migrated';
  deletion_requested_at: Date | null;
}

const systemClock: Clock = { now: () => new Date() };

/**
 * Users, their one individual workspace, and its billing account
 * (DATA_MODEL `users`, `workspaces`). A verified token for a uid with no
 * row gets a Free account in one transaction. A V1 account copied by the
 * migration already has its rows and is not touched.
 */
export class IdentityService {
  private readonly catalogs = new CatalogStore();
  /** uid -> verified address already recorded by this process, so most requests skip the write. */
  private readonly recordedEmail = new Map<string, string>();

  constructor(
    private readonly pool: Pool,
    private readonly catalogVersion: string,
    private readonly clock: Clock = systemClock,
  ) {}

  /**
   * The principal for a verified identity, creating the account on first
   * sight. Two first requests at once create one account: the second
   * waits on a lock keyed by the uid and then reads the first one's rows.
   */
  async principal(
    identity: VerifiedIdentity,
    localeHint?: string,
    options: { allowPendingDeletion?: boolean } = {},
  ): Promise<Principal> {
    const found = await findPrincipal(this.pool, identity.uid);
    if (found) {
      // Once deletion has started, only the deletion request itself (to finish or retry it) is served.
      if (found.deletion_requested_at && !options.allowPendingDeletion) {
        throw new BillingError('permission_denied', { reason: 'account_deletion_pending' });
      }
      await this.recordErasureEmail(identity);
      return toPrincipal(found, identity);
    }

    const catalog = await this.catalogs.get(this.pool, this.catalogVersion);
    const row = await withTransaction(this.pool, async (db) => {
      await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`user:${identity.uid}`]);
      const again = await findPrincipal(db, identity.uid);
      if (again) return again;
      // A token issued before the account was deleted must not open a new, empty account.
      const deleted = await db.query(`SELECT 1 FROM deleted_sign_ins WHERE auth_user_id = $1`, [identity.uid]);
      if (deleted.rows.length > 0) throw new BillingError('permission_denied', { reason: 'account_deleted' });
      const now = this.clock.now();
      await createFreeAccount(db, {
        authUserId: identity.uid,
        locale: isLaunchLocale(localeHint) ? localeHint : 'en',
        // Same sign-in re-created inside an allowance period it already used: same period, no fresh grant.
        anchor: (await carriedAnchor(db, identity.uid, now)) ?? now,
        catalog,
        now,
      });
      const created = await findPrincipal(db, identity.uid);
      if (!created) throw new Error('Account creation did not produce a principal');
      return created;
    });
    await this.recordErasureEmail(identity);
    return toPrincipal(row, identity);
  }

  /** See privacy/erasure-email.ts. Best effort: a failed write never blocks the request. */
  private async recordErasureEmail(identity: VerifiedIdentity): Promise<void> {
    const email = verifiedErasureEmail(identity);
    if (!email || this.recordedEmail.get(identity.uid) === email) return;
    try {
      await rememberErasureEmail(this.pool, identity.uid, identity);
      this.recordedEmail.set(identity.uid, email);
    } catch {
      /* retried on a later request */
    }
  }

  /**
   * The principal when the account already exists, without creating one.
   * Used by the V1 integration for callers whose V1 plan has no career access:
   * they may still export or erase career data they created earlier.
   */
  async existingPrincipal(
    identity: VerifiedIdentity,
    options: { allowPendingDeletion?: boolean } = {},
  ): Promise<Principal | null> {
    const found = await findPrincipal(this.pool, identity.uid);
    if (!found) return null;
    if (found.deletion_requested_at && !options.allowPendingDeletion) {
      throw new BillingError('permission_denied', { reason: 'account_deletion_pending' });
    }
    return toPrincipal(found, identity);
  }

  async me(principal: Principal): Promise<MeView> {
    const account = await this.pool.query<{ plan_id: string }>(
      `SELECT plan_id FROM billing_accounts WHERE id = $1`,
      [principal.billingAccountId],
    );
    const accepted = await readLegal(this.pool, principal.userId);
    return {
      user: {
        id: principal.userId,
        authUserId: principal.authUserId,
        locale: principal.locale,
        email: principal.identity.email,
        emailVerified: principal.identity.emailVerified,
      },
      workspaceId: principal.workspaceId,
      billingAccountId: principal.billingAccountId,
      planId: account.rows[0].plan_id,
      legal: legalView(accepted, principal.origin),
    };
  }

  async setLocale(principal: Principal, locale: unknown): Promise<Principal> {
    if (!isLaunchLocale(locale)) throw new BillingError('validation_error', { field: 'locale' });
    await this.pool.query(`UPDATE users SET locale = $2, updated_at = now() WHERE id = $1`, [principal.userId, locale]);
    return { ...principal, locale };
  }

  async legal(principal: Principal): Promise<MeView['legal']> {
    return legalView(await readLegal(this.pool, principal.userId), principal.origin);
  }

  /**
   * V1 `LegalAcceptanceService.record`: all three accepted, one row per
   * person, re-consent overwrites. V2 also refuses versions that are not
   * the current ones, so nobody is recorded as accepting a text the
   * server does not publish.
   */
  async acceptLegal(principal: Principal, input: LegalAcceptanceInput): Promise<MeView['legal']> {
    if (input.termsAccepted !== true || input.privacyAccepted !== true || input.disclaimerAccepted !== true) {
      throw new BillingError('validation_error', { reason: 'all_documents_required' });
    }
    if (
      input.termsVersion !== LEGAL_VERSIONS.terms ||
      input.privacyVersion !== LEGAL_VERSIONS.privacy ||
      input.disclaimerVersion !== LEGAL_VERSIONS.disclaimer
    ) {
      throw new BillingError('validation_error', { reason: 'legal_version_not_current' });
    }
    await this.pool.query(
      `INSERT INTO legal_acceptances
         (user_id, auth_user_id, terms_accepted, privacy_accepted, disclaimer_accepted,
          terms_version, privacy_version, disclaimer_version, accepted_at)
       VALUES ($1, $2, true, true, true, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         terms_version = EXCLUDED.terms_version,
         privacy_version = EXCLUDED.privacy_version,
         disclaimer_version = EXCLUDED.disclaimer_version,
         accepted_at = EXCLUDED.accepted_at`,
      [
        principal.userId,
        principal.authUserId,
        input.termsVersion,
        input.privacyVersion,
        input.disclaimerVersion,
        this.clock.now(),
      ],
    );
    return this.legal(principal);
  }

  /** Registering the same token again moves it to this person (a shared device signed in as someone else). */
  async registerPushToken(principal: Principal, token: unknown): Promise<void> {
    const value = validToken(token);
    await this.pool.query(
      `INSERT INTO push_tokens (user_id, auth_user_id, token) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, auth_user_id = EXCLUDED.auth_user_id`,
      [principal.userId, principal.authUserId, value],
    );
  }

  /** Removes this person's token only. Another person's token is left alone. */
  async removePushToken(principal: Principal, token: unknown): Promise<void> {
    const value = validToken(token);
    await this.pool.query(`DELETE FROM push_tokens WHERE token = $1 AND user_id = $2`, [value, principal.userId]);
  }
}

function validToken(token: unknown): string {
  if (typeof token !== 'string' || token.trim().length === 0 || token.length > 512) {
    throw new BillingError('validation_error', { field: 'token' });
  }
  return token.trim();
}

async function findPrincipal(db: Db, authUserId: string): Promise<PrincipalRow | null> {
  const res = await db.query<PrincipalRow>(
    `SELECT u.id AS user_id, u.locale, u.deletion_requested_at, w.id AS workspace_id, b.id AS billing_account_id, b.origin
       FROM users u
       JOIN workspaces w ON w.owner_user_id = u.id AND w.kind = 'individual'
       JOIN billing_accounts b ON b.workspace_id = w.id
      WHERE u.auth_user_id = $1
      ORDER BY w.created_at
      LIMIT 1`,
    [authUserId],
  );
  return res.rows[0] ?? null;
}

function toPrincipal(row: PrincipalRow, identity: VerifiedIdentity): Principal {
  return {
    userId: row.user_id,
    authUserId: identity.uid,
    workspaceId: row.workspace_id,
    billingAccountId: row.billing_account_id,
    locale: row.locale,
    origin: row.origin,
    identity,
  };
}

async function readLegal(db: Db, userId: string): Promise<LegalAcceptanceView | null> {
  const res = await db.query<{
    terms_version: string;
    privacy_version: string;
    disclaimer_version: string;
    accepted_at: Date;
  }>(
    `SELECT terms_version, privacy_version, disclaimer_version, accepted_at FROM legal_acceptances WHERE user_id = $1`,
    [userId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    termsVersion: row.terms_version,
    privacyVersion: row.privacy_version,
    disclaimerVersion: row.disclaimer_version,
    acceptedAt: row.accepted_at,
  };
}

function legalView(accepted: LegalAcceptanceView | null, origin: 'v2' | 'migrated'): MeView['legal'] {
  return { required: LEGAL_VERSIONS, accepted, needsAcceptance: needsLegalAcceptance(accepted, origin) };
}
