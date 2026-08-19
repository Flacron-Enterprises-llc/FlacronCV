import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { FieldValue, Transaction, DocumentReference } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { toIsoString } from '../../common/utils/date';
import {
  User,
  UserProfile,
  CreateUserData,
  UpdateUserData,
  UserRole,
  SubscriptionPlan,
  SubscriptionStatus,
  Locale,
  Theme,
  PLAN_CONFIGS,
  resolveEffectivePlan,
  ProfileLinkField,
  isProfileLinkField,
  validateProfileLink,
  LEGAL_ACCEPTANCES_COLLECTION,
} from '@flacroncv/shared-types';

/**
 * The document handed back by `GET /users/me/export`.
 *
 * The Privacy Policy promises a Right to Access and a Right to Portability and
 * there was previously no way to exercise either in the product. This is that
 * way: one self-describing JSON file containing everything the signed-in user
 * owns, and nothing else — no other user's records, no Stripe identifiers, no
 * internal staff identifiers.
 */
export interface PersonalDataExport {
  meta: {
    format: 'flacroncv/user-data-export';
    version: number;
    generatedAt: string;
    userId: string;
    /**
     * Collections whose per-export record cap was reached, so their list below
     * is incomplete. Empty in every ordinary case — but a silently truncated
     * "complete copy of your data" would be a worse compliance answer than no
     * export at all, so truncation is always stated.
     */
    truncated: string[];
  };
  account: Record<string, unknown>;
  profile: Record<string, unknown>;
  preferences: Record<string, unknown>;
  subscription: Record<string, unknown>;
  usage: Record<string, unknown>;
  abuse: Record<string, unknown>;
  cvs: Record<string, unknown>[];
  coverLetters: Record<string, unknown>[];
  jobApplications: Record<string, unknown>[];
  supportTickets: Record<string, unknown>[];
  /** Own `legalAcceptances/{uid}` row, or null when grandfathered (no record). */
  legalAcceptance: Record<string, unknown> | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly collection = 'users';

  // Whitelist of writable profile fields → max length. Any key not listed is
  // dropped from a profile update (prevents doc-bloat / junk-key persistence).
  private static readonly PROFILE_MAX_LENGTHS: Record<keyof UserProfile, number> = {
    firstName: 100,
    lastName: 100,
    headline: 200,
    bio: 2000,
    location: 200,
    website: 500,
    linkedin: 500,
    github: 500,
  };

  constructor(private firebaseAdmin: FirebaseAdminService) {}

  async create(data: CreateUserData): Promise<User> {
    const now = new Date();
    const user: User = {
      uid: data.uid,
      email: data.email,
      displayName: data.displayName,
      photoURL: data.photoURL || null,
      phoneNumber: null,
      profile: {
        firstName: data.displayName?.split(' ')[0] || '',
        lastName: data.displayName?.split(' ').slice(1).join(' ') || '',
        headline: '',
        bio: '',
        location: '',
        website: '',
        linkedin: '',
        github: '',
      },
      preferences: {
        language: Locale.EN,
        theme: Theme.SYSTEM,
        emailNotifications: true,
        marketingEmails: false,
        defaultCVTemplate: 'modern',
      },
      subscription: {
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        hasUsedTrial: false,
      },
      usage: {
        cvsCreated: 0,
        coverLettersCreated: 0,
        aiCreditsUsed: 0,
        aiCreditsLimit: PLAN_CONFIGS[SubscriptionPlan.FREE].limits.aiCredits,
        exportsThisMonth: 0,
        lastExportReset: now,
      },
      role: UserRole.USER,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      isActive: true,
      deletedAt: null,
    };

    await this.firebaseAdmin.firestore.collection(this.collection).doc(data.uid).set(user);
    return user;
  }

  async findById(uid: string): Promise<User | null> {
    const doc = await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).get();
    if (!doc.exists) return null;
    return doc.data() as User;
  }

  async findByIdOrThrow(uid: string): Promise<User> {
    const user = await this.findById(uid);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(uid: string, data: UpdateUserData): Promise<User> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.displayName) {
      updateData.displayName = this.assertString('displayName', data.displayName, 200);
      // An explicitly chosen name must never be overwritten by the
      // registration-time placeholder heal in AuthService.verifyAndSync.
      updateData.displayNamePending = false;
    }
    if (data.photoURL !== undefined) {
      updateData.photoURL = data.photoURL === null ? null : this.assertPhotoURL(data.photoURL);
    }
    if (data.profile) {
      // Whitelist known profile fields only (unknown keys dropped) and cap
      // lengths, so an authenticated client cannot bloat its own doc or persist
      // junk. Invalid known values are rejected with 400.
      Object.entries(data.profile).forEach(([key, value]) => {
        const max = UsersService.PROFILE_MAX_LENGTHS[key as keyof UserProfile];
        if (max === undefined) return; // unknown key — drop
        const str = this.assertString(`profile.${key}`, value, max);
        // The link fields get the shared rule (right site, real URL, http/https
        // only) rather than just a length cap. Length alone let a GitHub URL
        // save into the LinkedIn field and ship onto a CV labelled LinkedIn.
        updateData[`profile.${key}`] = isProfileLinkField(key)
          ? this.assertProfileLink(key, str, max)
          : str;
      });

      // Keep top-level displayName in sync when name parts change
      if (data.profile.firstName !== undefined || data.profile.lastName !== undefined) {
        const current = await this.findByIdOrThrow(uid);
        const firstName = data.profile.firstName ?? current.profile?.firstName ?? '';
        const lastName = data.profile.lastName ?? current.profile?.lastName ?? '';
        updateData.displayName = `${firstName} ${lastName}`.trim();
        updateData.displayNamePending = false;
      }
    }
    if (data.preferences) {
      Object.entries(data.preferences).forEach(([key, value]) => {
        const validated = this.validatePreference(key, value);
        if (validated === undefined) return; // unknown preference key — drop
        updateData[`preferences.${key}`] = validated;
      });
    }

    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update(updateData);
    return this.findByIdOrThrow(uid);
  }

  private assertString(field: string, value: unknown, maxLen: number): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string.`);
    }
    if (value.length > maxLen) {
      throw new BadRequestException(`${field} must be at most ${maxLen} characters.`);
    }
    return value;
  }

  /**
   * Runs the shared link rule and turns a rejection into a 400.
   *
   * Returns the NORMALISED value (scheme added when the user pasted
   * "github.com/name"), so what lands in Firestore is always a parseable URL —
   * the CV renderer and the public profile page both assume that.
   */
  private assertProfileLink(field: ProfileLinkField, value: string, maxLen: number): string {
    const result = validateProfileLink(field, value, maxLen);
    if (result.error) throw new BadRequestException(result.error);
    return result.value;
  }

  private assertPhotoURL(value: unknown): string {
    if (typeof value !== 'string' || value.length > 2048) {
      throw new BadRequestException('photoURL must be a URL string of at most 2048 characters.');
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException('photoURL must be a valid URL.');
    }
    // Reject javascript:/data:/http and other schemes — only https avatars.
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('photoURL must be an https URL.');
    }
    return value;
  }

  private validatePreference(key: string, value: unknown): unknown {
    switch (key) {
      case 'language':
        if (!Object.values(Locale).includes(value as Locale)) {
          throw new BadRequestException('Invalid language preference.');
        }
        return value;
      case 'theme':
        if (!Object.values(Theme).includes(value as Theme)) {
          throw new BadRequestException('Invalid theme preference.');
        }
        return value;
      case 'emailNotifications':
      case 'marketingEmails':
        if (typeof value !== 'boolean') {
          throw new BadRequestException(`${key} must be a boolean.`);
        }
        return value;
      case 'defaultCVTemplate':
        return this.assertString('defaultCVTemplate', value, 100);
      default:
        return undefined; // unknown preference key — dropped by the caller
    }
  }

  async updateLastLogin(uid: string): Promise<void> {
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update({
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateRole(uid: string, role: UserRole): Promise<void> {
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update({
      role,
      updatedAt: new Date(),
    });
  }

  async updateSubscription(uid: string, subscription: Partial<User['subscription']>): Promise<void> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    Object.entries(subscription).forEach(([key, value]) => {
      updateData[`subscription.${key}`] = value;
    });
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update(updateData);
  }

  async updateUsage(uid: string, usage: Partial<User['usage']>): Promise<void> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    Object.entries(usage).forEach(([key, value]) => {
      updateData[`usage.${key}`] = value;
    });
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update(updateData);
  }

  async incrementUsage(uid: string, field: keyof User['usage'], amount = 1): Promise<void> {
    // Atomic server-side increment: a read-modify-write here loses updates
    // under concurrent requests, letting users slip past plan limits.
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update({
      [`usage.${field}`]: FieldValue.increment(amount),
      updatedAt: new Date(),
    });
  }

  /**
   * Atomically reserve one AI credit inside a transaction: the limit check and
   * the increment are one committed operation, so N concurrent AI requests can't
   * all pass a stale check and overshoot the plan cap (TOCTOU). The ceiling is
   * the *effective* plan's allowance (a delinquent-past-grace account is held to
   * FREE), capped by the stored per-user limit. Returns false when the doc is
   * missing or no credit remains — the caller then rejects without calling the
   * paid model. Refund with {@link refundAiCredit} if the generation fails.
   */
  async reserveAiCredit(uid: string): Promise<boolean> {
    const ref: DocumentReference = this.firebaseAdmin.firestore.collection(this.collection).doc(uid);
    return this.firebaseAdmin.firestore.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const user = snap.data() as User;
      const effectiveLimit = Math.min(
        user.usage.aiCreditsLimit,
        PLAN_CONFIGS[resolveEffectivePlan(user.subscription)].limits.aiCredits,
      );
      if ((user.usage.aiCreditsUsed ?? 0) >= effectiveLimit) return false;
      tx.update(ref, {
        'usage.aiCreditsUsed': FieldValue.increment(1),
        updatedAt: new Date(),
      });
      return true;
    });
  }

  /** Give back a credit reserved by {@link reserveAiCredit} when generation fails. */
  async refundAiCredit(uid: string): Promise<void> {
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update({
      'usage.aiCreditsUsed': FieldValue.increment(-1),
      updatedAt: new Date(),
    });
  }

  async softDelete(uid: string): Promise<void> {
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update({
      isActive: false,
      deletedAt: new Date(),
      updatedAt: new Date(),
    });

    // Terminate all sessions and block re-authentication so a soft-deleted
    // account cannot keep calling the API with a still-valid refresh token
    // (mirrors CrmUsersService.suspendUser). The Firestore soft-delete above is
    // the source of truth, so an Auth-side hiccup must not fail the deletion —
    // log and continue.
    try {
      await this.firebaseAdmin.auth.revokeRefreshTokens(uid);
      await this.firebaseAdmin.auth.updateUser(uid, { disabled: true });
    } catch (err) {
      this.logger.error(
        `Failed to revoke/disable Firebase Auth for deleted user ${uid}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Revoke every refresh token issued to this account — "sign out of all
   * devices". Firebase Auth exposes no per-session or per-device handle, so
   * this all-or-nothing revocation is the only session control that genuinely
   * exists; the UI must not imply otherwise.
   *
   * Note the guard verifies ID tokens without `checkRevoked`, so an already
   * issued ID token stays usable until it expires (Firebase caps that at one
   * hour). Revocation is what stops those sessions being renewed.
   *
   * Unlike the best-effort revoke inside {@link softDelete}, a failure here is
   * fatal on purpose: revoking IS the action, so the caller must not be told it
   * succeeded when it did not.
   */
  async signOutEverywhere(uid: string): Promise<{ revokedAt: string }> {
    await this.firebaseAdmin.auth.revokeRefreshTokens(uid);
    const revokedAt = new Date().toISOString();
    this.logger.log(`Revoked all refresh tokens for user ${uid}`);
    return { revokedAt };
  }

  // ── Personal data export (Right to Access / Portability) ───────────────────

  /**
   * Export section name → the real Firestore collection behind it. Every one of
   * these carries the owner uid in a field literally named `userId` (see
   * CVService, CoverLetterService, JobsService and SupportService).
   */
  private static readonly OWNED_COLLECTIONS = {
    cvs: 'cvs',
    coverLetters: 'cover_letters',
    jobApplications: 'job_applications',
    supportTickets: 'support_tickets',
  } as const;

  /**
   * Per-collection ceiling for one export. Real accounts sit far below this
   * (plan limits see to that); the cap only stops a pathological account from
   * turning one request into an unbounded read. Hitting it is reported in
   * `meta.truncated` rather than silently dropping records.
   */
  private static readonly EXPORT_MAX_PER_COLLECTION = 500;

  /** Subscription fields safe to hand back — Stripe identifiers are excluded. */
  private static readonly EXPORTED_SUBSCRIPTION_FIELDS = [
    'plan',
    'status',
    'currentPeriodEnd',
    'cancelAtPeriodEnd',
    'hasUsedTrial',
  ] as const;

  private static readonly EXPORTED_ABUSE_FIELDS = [
    'deviceHash',
    'ipHash',
    'networkHash',
    'riskScore',
    'riskBand',
    'riskSignals',
    'scoredAt',
  ] as const;

  private static readonly EXPORTED_LEGAL_ACCEPTANCE_FIELDS = [
    'userId',
    'email',
    'termsAccepted',
    'privacyAccepted',
    'disclaimerAccepted',
    'termsVersion',
    'privacyVersion',
    'disclaimerVersion',
    'acceptedAt',
  ] as const;

  private static readonly EXPORTED_ACCOUNT_FIELDS = [
    'uid',
    'email',
    'displayName',
    'photoURL',
    'phoneNumber',
    'role',
    'isActive',
    'createdAt',
    'updatedAt',
    'lastLoginAt',
    'deletedAt',
  ] as const;

  private static readonly EXPORTED_PREFERENCE_FIELDS = [
    'language',
    'theme',
    'emailNotifications',
    'marketingEmails',
    'defaultCVTemplate',
  ] as const;

  private static readonly EXPORTED_USAGE_FIELDS = [
    'cvsCreated',
    'coverLettersCreated',
    'aiCreditsUsed',
    'aiCreditsLimit',
    'exportsThisMonth',
    'lastExportReset',
  ] as const;

  /**
   * A support ticket as the *customer* holds it. `assignedTo`/`assignedToName`
   * identify the staff member handling it and are internal routing data, not
   * the customer's own; they stay out.
   */
  private static readonly EXPORTED_TICKET_FIELDS = [
    'id',
    'subject',
    'category',
    'priority',
    'status',
    'createdAt',
    'updatedAt',
    'resolvedAt',
    'closedAt',
  ] as const;

  /**
   * A ticket message. `authorName` is kept because the customer already sees it
   * on their own ticket thread; `authorId` is dropped because an agent's uid is
   * an internal identifier that is never shown anywhere.
   */
  private static readonly EXPORTED_TICKET_MESSAGE_FIELDS = [
    'authorName',
    'authorRole',
    'content',
    'attachments',
    'createdAt',
  ] as const;

  /**
   * Firestore Timestamps serialise to `{_seconds, _nanoseconds}`, which is
   * unreadable in a file we hand to a person and unusable to anyone importing
   * it elsewhere. Convert those (and Dates) to ISO 8601 throughout, and turn
   * `undefined` into `null` so keys are not silently dropped by JSON.stringify.
   */
  private static jsonSafe(value: unknown): unknown {
    if (value === undefined || value === null) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((entry) => UsersService.jsonSafe(entry));
    if (typeof value !== 'object') return value;

    const ts = value as {
      toDate?: unknown;
      seconds?: unknown;
      nanoseconds?: unknown;
      _seconds?: unknown;
      _nanoseconds?: unknown;
    };
    const isTimestamp =
      typeof ts.toDate === 'function' ||
      (typeof ts._seconds === 'number' && typeof ts._nanoseconds === 'number') ||
      (typeof ts.seconds === 'number' && typeof ts.nanoseconds === 'number');
    if (isTimestamp) return toIsoString(value) || null;

    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = UsersService.jsonSafe(entry);
    }
    return out;
  }

  /** Project `source` down to `fields` only — an allowlist, never a blocklist. */
  private static pick(
    source: Record<string, unknown> | undefined,
    fields: readonly string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of fields) out[field] = UsersService.jsonSafe(source?.[field]);
    return out;
  }

  private static asRecord(value: unknown): Record<string, unknown> {
    return (UsersService.jsonSafe(value) ?? {}) as Record<string, unknown>;
  }

  /** Newest first, matching how the product lists these documents. */
  private static byCreatedAtDesc(a: Record<string, unknown>, b: Record<string, unknown>): number {
    return toIsoString(b.createdAt).localeCompare(toIsoString(a.createdAt));
  }

  /**
   * Read one collection's documents for a single owner.
   *
   * The `userId` equality filter is re-asserted on the results: the query
   * already scopes the read, but an export is the one place where a mis-scoped
   * read would hand one person another person's records, so the invariant is
   * enforced twice rather than trusted once.
   */
  private async readOwnedDocs(
    collection: string,
    uid: string,
  ): Promise<{ rows: { id: string; data: Record<string, unknown> }[]; truncated: boolean }> {
    const cap = UsersService.EXPORT_MAX_PER_COLLECTION;
    // Only a `userId` equality filter (no orderBy, no second where) so the
    // export needs no composite index; ordering is applied in memory below.
    const snapshot = await this.firebaseAdmin.firestore
      .collection(collection)
      .where('userId', '==', uid)
      .limit(cap + 1)
      .get();

    const rows = (snapshot.docs as { id: string; data: () => Record<string, unknown> | undefined }[])
      .map((doc) => ({ id: doc.id, data: doc.data() ?? {} }))
      .filter((row) => row.data.userId === uid);

    return { rows: rows.slice(0, cap), truncated: snapshot.docs.length > cap };
  }

  private async readCvSections(cvId: string): Promise<unknown[]> {
    const snapshot = await this.firebaseAdmin.firestore
      .collection(UsersService.OWNED_COLLECTIONS.cvs)
      .doc(cvId)
      .collection('sections')
      .orderBy('order')
      .get();
    return (snapshot.docs as { data: () => Record<string, unknown> | undefined }[]).map((doc) =>
      UsersService.jsonSafe(doc.data() ?? {}),
    );
  }

  private async readTicketMessages(ticketId: string): Promise<Record<string, unknown>[]> {
    const snapshot = await this.firebaseAdmin.firestore
      .collection(UsersService.OWNED_COLLECTIONS.supportTickets)
      .doc(ticketId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .get();
    return (snapshot.docs as { data: () => Record<string, unknown> | undefined }[])
      // INTERNAL NOTES MUST NEVER REACH THE CUSTOMER.
      //
      // SupportService.getMessages() filters these for the support UI, but this
      // export reads the `messages` subcollection DIRECTLY and so bypasses that
      // filter entirely — a customer downloading their own data received the
      // agents' private notes about them, stripped of the `internal` flag by the
      // field allowlist below and therefore indistinguishable from a real reply.
      // It also exposed the agent's email in `authorName`, which the reply path
      // deliberately hides behind "Support Team".
      //
      // Filtered here as well as in SupportService: any raw reader of this
      // subcollection must repeat the check. Fail closed — a truthy flag is
      // excluded, and only an explicitly absent/false flag is treated as
      // customer-visible, so a malformed value never leaks.
      .filter((doc) => !doc.data()?.internal)
      .map((doc) => UsersService.pick(doc.data(), UsersService.EXPORTED_TICKET_MESSAGE_FIELDS));
  }

  /**
   * Everything the signed-in user owns, as one portable JSON document.
   *
   * `uid` MUST come from the authenticated principal — this method performs no
   * further authorisation of its own beyond scoping every read to that uid.
   */
  async exportPersonalData(uid: string): Promise<PersonalDataExport> {
    const user = await this.findByIdOrThrow(uid);
    const userRecord = UsersService.asRecord(user);

    const [cvDocs, coverLetterDocs, jobDocs, ticketDocs, legalSnap] = await Promise.all([
      this.readOwnedDocs(UsersService.OWNED_COLLECTIONS.cvs, uid),
      this.readOwnedDocs(UsersService.OWNED_COLLECTIONS.coverLetters, uid),
      this.readOwnedDocs(UsersService.OWNED_COLLECTIONS.jobApplications, uid),
      this.readOwnedDocs(UsersService.OWNED_COLLECTIONS.supportTickets, uid),
      this.firebaseAdmin.firestore.collection(LEGAL_ACCEPTANCES_COLLECTION).doc(uid).get(),
    ]);

    // A CV's content lives in its `sections` subcollection, so a CV without its
    // sections would be an empty shell — useless for portability.
    const cvs = await Promise.all(
      cvDocs.rows.map(async (row) => ({
        ...UsersService.asRecord(row.data),
        id: row.id,
        sections: await this.readCvSections(row.id),
      })),
    );

    const supportTickets = await Promise.all(
      ticketDocs.rows.map(async (row) => ({
        ...UsersService.pick(row.data, UsersService.EXPORTED_TICKET_FIELDS),
        id: row.id,
        messages: await this.readTicketMessages(row.id),
      })),
    );

    const truncated = Object.entries({
      cvs: cvDocs.truncated,
      coverLetters: coverLetterDocs.truncated,
      jobApplications: jobDocs.truncated,
      supportTickets: ticketDocs.truncated,
    })
      .filter(([, wasTruncated]) => wasTruncated)
      .map(([name]) => name);

    return {
      meta: {
        format: 'flacroncv/user-data-export',
        version: 1,
        generatedAt: new Date().toISOString(),
        userId: uid,
        truncated,
      },
      account: UsersService.pick(userRecord, UsersService.EXPORTED_ACCOUNT_FIELDS),
      profile: UsersService.pick(
        userRecord.profile as Record<string, unknown> | undefined,
        Object.keys(UsersService.PROFILE_MAX_LENGTHS),
      ),
      preferences: UsersService.pick(
        userRecord.preferences as Record<string, unknown> | undefined,
        UsersService.EXPORTED_PREFERENCE_FIELDS,
      ),
      subscription: UsersService.pick(
        userRecord.subscription as Record<string, unknown> | undefined,
        UsersService.EXPORTED_SUBSCRIPTION_FIELDS,
      ),
      usage: UsersService.pick(
        userRecord.usage as Record<string, unknown> | undefined,
        UsersService.EXPORTED_USAGE_FIELDS,
      ),
      abuse: UsersService.pick(
        userRecord.abuse as Record<string, unknown> | undefined,
        UsersService.EXPORTED_ABUSE_FIELDS,
      ),
      cvs: cvs.sort(UsersService.byCreatedAtDesc),
      coverLetters: coverLetterDocs.rows
        .map((row) => ({ ...UsersService.asRecord(row.data), id: row.id }))
        .sort(UsersService.byCreatedAtDesc),
      jobApplications: jobDocs.rows
        .map((row) => ({ ...UsersService.asRecord(row.data), id: row.id }))
        .sort(UsersService.byCreatedAtDesc),
      supportTickets: supportTickets.sort(UsersService.byCreatedAtDesc),
      legalAcceptance: legalSnap.exists
        ? UsersService.pick(
            UsersService.asRecord(legalSnap.data()),
            UsersService.EXPORTED_LEGAL_ACCEPTANCE_FIELDS,
          )
        : null,
    };
  }

  async listUsers(page = 1, limit = 20, filters?: { role?: string; plan?: string; search?: string }) {
    let query: FirebaseFirestore.Query = this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('isActive', '==', true);

    if (filters?.role) {
      query = query.where('role', '==', filters.role);
    }
    if (filters?.plan) {
      query = query.where('subscription.plan', '==', filters.plan);
    }

    query = query.orderBy('createdAt', 'desc').limit(limit).offset((page - 1) * limit);

    const snapshot = await query.get();
    const items = snapshot.docs.map((doc) => doc.data() as User);

    const countSnapshot = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('isActive', '==', true)
      .count()
      .get();
    const total = countSnapshot.data().count;

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }
}
