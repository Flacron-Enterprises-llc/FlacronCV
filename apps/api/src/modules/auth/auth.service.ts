import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AbuseService } from '../abuse/abuse.service';
import { AuditAction } from '../audit/audit-actions';
import { UserRole } from '@flacroncv/shared-types';

/**
 * Firebase refuses to mint an action link whose `continueUrl` it does not trust.
 * Every code here means "the continue URL is the problem, the account is fine" —
 * most often FRONTEND_URL missing its scheme, or the live domain never being
 * added under Auth → Settings → Authorized domains. Verification must not die
 * with it, so these are recoverable (see `generateAndSendVerification`).
 */
const CONTINUE_URL_ERROR_CODES = new Set([
  'auth/invalid-continue-uri',
  'auth/unauthorized-continue-uri',
  'auth/missing-continue-uri',
  'auth/invalid-dynamic-link-domain',
]);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private firebaseAdmin: FirebaseAdminService,
    private usersService: UsersService,
    private mailService: MailService,
    private configService: ConfigService,
    private audit: AuditService,
    private abuse: AbuseService,
  ) {}

  async verifyAndSync(
    uid: string,
    email: string,
    displayName: string,
    emailVerified: boolean,
    photoURL?: string,
    context: { ipAddress?: string; userAgent?: string } = {},
    deviceToken?: string,
  ) {
    const ref = this.firebaseAdmin.firestore.collection('users').doc(uid);
    let user = await this.usersService.findById(uid);

    if (!user) {
      // ── New user ─────────────────────────────────────────────────────────
      // Email/password signups have no `name` claim in the very first ID
      // token (the client sets displayName via updateProfile a moment after
      // createUser). Ask the Auth record directly before falling back.
      let resolvedName = displayName;
      let namePending = false;
      if (!resolvedName || resolvedName === email) {
        const authRecord = await this.firebaseAdmin.auth.getUser(uid).catch(() => null);
        resolvedName = authRecord?.displayName || '';
      }
      if (!resolvedName) {
        resolvedName = email.split('@')[0];
        namePending = true;
      }

      await this.abuse.assertNetworkCreateAllowed(context.ipAddress);

      user = await this.usersService.create({
        uid,
        email,
        displayName: resolvedName,
        photoURL: photoURL || null,
      });
      if (namePending) {
        // Placeholder name in use — heal it on a later sync once the Auth
        // record carries the real name (see returning-user branch below).
        await ref.update({ displayNamePending: true });
      }
      this.logger.log(`New user created: ${uid}`);

      try {
        await this.abuse.recordRegistrationSignals({
          uid,
          email,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          deviceToken,
        });
      } catch {
        this.logger.warn(`Abuse scoring skipped uid=${uid}`);
      }

      if (emailVerified) {
        // OAuth provider (Google/GitHub) — email already verified → welcome immediately
        await ref.update({ welcomeEmailSent: true });
        this.mailService.sendWelcomeEmail(email, user.displayName).catch((err) =>
          this.logger.error(`Welcome email failed for ${email}`, err),
        );
      } else {
        // Email/password signup — send verification first, welcome comes after they verify
        await ref.update({ welcomeEmailSent: false });
        this.generateAndSendVerification(uid, email, user.displayName).catch((err) =>
          this.logger.error(`Verification email failed for ${email}`, err),
        );
      }

      // `/auth/verify` is the first authenticated call every client makes after
      // a successful Firebase sign-in, so it is where registration and sign-in
      // become visible to the backend at all — Firebase Auth itself runs
      // client-side and writes nothing to our audit trail.
      await this.audit.logUserAction(AuditAction.REGISTERED, { uid, email }, 'user', uid, {
        metadata: { emailVerified },
        ...context,
      });
    } else {
      // ── Returning user ───────────────────────────────────────────────────
      // Capture the PREVIOUS lastLoginAt before it is overwritten — it is what
      // distinguishes a real sign-in from a page load (see the audit note below).
      const previousLogin = user.lastLoginAt;
      await this.usersService.updateLastLogin(uid);

      const doc = await ref.get();
      const docData = doc.data();

      // Heal a placeholder display name once the Auth record has the real
      // one. Only runs while displayNamePending is set, so a name the user
      // chose themselves is never overwritten.
      if (docData?.displayNamePending === true) {
        const authRecord = await this.firebaseAdmin.auth.getUser(uid).catch(() => null);
        if (authRecord?.displayName) {
          await ref.update({
            displayName: authRecord.displayName,
            displayNamePending: false,
            updatedAt: new Date(),
          });
          user = { ...user, displayName: authRecord.displayName };
          this.logger.log(`Display name healed for ${uid}`);
        }
      }

      // Check if they just verified their email since last login
      if (emailVerified) {
        if (docData?.welcomeEmailSent === false) {
          await ref.update({ welcomeEmailSent: true });
          this.mailService.sendWelcomeEmail(email, user.displayName).catch((err) =>
            this.logger.error(`Welcome email failed for ${email}`, err),
          );
        }
      }

      // Record a SESSION START, not every call.
      //
      // `/auth/verify` is hit on every mount of the authenticated app — every
      // page load and every tab — so logging unconditionally wrote an
      // AUTH_LOGIN row per navigation. That is not just noise: the admin Audit
      // Logs page reads a bounded 2,000-row window ordered by time and filters
      // in memory, so a single busy user's page loads would push every genuine
      // event (role changes, subscription changes, failed sign-ins) out of the
      // window and the filters would come back empty.
      //
      // A gap since the previous sync is the available signal for "this is a
      // new session" — Firebase issues the ID token client-side, so the API
      // never observes the sign-in itself.
      if (AuthService.isNewSession(previousLogin)) {
        await this.audit.logUserAction(
          AuditAction.LOGIN,
          { uid, email, role: user.role },
          'user',
          uid,
          context,
        );
      }
    }

    return user;
  }

  /** Minimum gap between syncs before one counts as a new session. */
  private static readonly SESSION_GAP_MS = 30 * 60 * 1000;

  /** True when the last sync is absent or older than {@link SESSION_GAP_MS}. */
  private static isNewSession(previousLogin: unknown): boolean {
    if (!previousLogin) return true;
    const raw = previousLogin as { toDate?: () => Date; _seconds?: number; seconds?: number };
    let last: Date | null = null;
    if (previousLogin instanceof Date) last = previousLogin;
    else if (typeof raw?.toDate === 'function') last = raw.toDate();
    else if (typeof raw?._seconds === 'number') last = new Date(raw._seconds * 1000);
    else if (typeof raw?.seconds === 'number') last = new Date(raw.seconds * 1000);
    else if (typeof previousLogin === 'string') last = new Date(previousLogin);

    if (!last || Number.isNaN(last.getTime())) return true;
    return Date.now() - last.getTime() > AuthService.SESSION_GAP_MS;
  }

  /**
   * Record a sign-out. Firebase sign-out is a purely client-side operation, so
   * the client reports it explicitly; there is nothing to revoke here.
   */
  async recordLogout(
    user: { uid: string; email?: string; role?: string },
    context: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<void> {
    await this.audit.logUserAction(AuditAction.LOGOUT, user, 'user', user.uid, context);
  }

  /**
   * Record a failed sign-in reported by the client.
   *
   * Firebase rejects bad credentials in the browser, so the API never sees the
   * attempt unless the client tells it. The endpoint is unauthenticated by
   * necessity and therefore tightly throttled; treat these rows as
   * client-asserted signal, not as proof. Only the address and a coarse reason
   * code are stored — never the submitted password.
   */
  async recordFailedLogin(
    email: string,
    reason: string,
    context: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<void> {
    await this.audit.log({
      actorId: 'anonymous',
      actorEmail: email,
      actorRole: 'anonymous',
      action: AuditAction.LOGIN_FAILED,
      resource: 'auth',
      resourceId: email,
      metadata: { reason },
      ...context,
    });
  }

  async sendPasswordReset(email: string): Promise<void> {
    let link: string;
    try {
      link = await this.firebaseAdmin.auth.generatePasswordResetLink(email);
    } catch (error) {
      // Unknown address: log and return as if successful. The caller must
      // respond identically either way so account existence never leaks.
      if ((error as { code?: string }).code === 'auth/email-not-found') {
        this.logger.log(`Password reset requested for unknown email (not disclosed to caller)`);
        return;
      }
      throw error;
    }
    await this.audit.log({
      actorId: 'anonymous',
      actorEmail: email,
      actorRole: 'anonymous',
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      resource: 'auth',
      resourceId: email,
    });
    const snapshot = await this.firebaseAdmin.firestore
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    const displayName: string = snapshot.empty ? '' : ((snapshot.docs[0].data().displayName as string) || '');
    await this.mailService.sendPasswordResetEmail(email, displayName, link);
  }

  async sendEmailVerification(uid: string): Promise<void> {
    const firebaseUser = await this.firebaseAdmin.auth.getUser(uid);
    const userEmail = firebaseUser.email || '';
    await this.generateAndSendVerification(uid, userEmail, firebaseUser.displayName || '');
  }

  async setUserRole(
    uid: string,
    role: UserRole,
    actor?: { uid: string; email?: string; role?: string },
  ) {
    const previous = (await this.usersService.findById(uid))?.role;
    await this.firebaseAdmin.auth.setCustomUserClaims(uid, { role });
    await this.usersService.updateRole(uid, role);
    this.logger.log(`User ${uid} role set to ${role}`);

    // A privilege change is the single most security-relevant mutation in the
    // product, so it is always recorded with who granted it and what it was.
    await this.audit.log({
      actorId: actor?.uid || 'system',
      actorEmail: actor?.email || 'system',
      actorRole: actor?.role || 'system',
      action: AuditAction.USER_ROLE_CHANGED,
      resource: 'user',
      resourceId: uid,
      changes: { before: { role: previous ?? null }, after: { role } },
    });
  }

  async revokeTokens(uid: string) {
    await this.firebaseAdmin.auth.revokeRefreshTokens(uid);
    this.logger.log(`Tokens revoked for user ${uid}`);
  }

  /**
   * Where the verification link drops the user once Firebase has consumed the
   * code. Returns null when FRONTEND_URL is unusable as a `continueUrl` — a
   * relative value, or one without an http(s) scheme — because passing it on
   * would make Firebase reject the whole request.
   */
  private verificationContinueUrl(): string | null {
    const configured = (this.configService.get<string>('frontendUrl') || '').trim().replace(/\/+$/, '');
    if (!configured) return null;
    try {
      const { protocol } = new URL(configured);
      if (protocol !== 'http:' && protocol !== 'https:') {
        this.logger.error(`FRONTEND_URL "${configured}" is not http(s); verification links will use the Firebase default handler`);
        return null;
      }
    } catch {
      this.logger.error(`FRONTEND_URL "${configured}" is not an absolute URL; verification links will use the Firebase default handler`);
      return null;
    }
    return `${configured}/dashboard`;
  }

  private async generateAndSendVerification(uid: string, email: string, displayName: string): Promise<void> {
    if (!email) {
      throw new BadRequestException('This account has no email address to verify');
    }

    const continueUrl = this.verificationContinueUrl();
    let link: string;
    try {
      link = continueUrl
        ? await this.firebaseAdmin.auth.generateEmailVerificationLink(email, { url: continueUrl })
        : await this.firebaseAdmin.auth.generateEmailVerificationLink(email);
    } catch (error) {
      const code = (error as { code?: string }).code;

      // A rejected continue URL is a deployment misconfiguration, but it used to
      // strand the account permanently: signup swallows this failure and the
      // resend endpoint turned it into a bare 500, so the user could never
      // obtain a link at all. Fall back to a link with no continue URL — it is
      // handled on Firebase's own domain, needs no whitelisting, and the
      // verify-email page polls for the state change anyway.
      if (continueUrl && CONTINUE_URL_ERROR_CODES.has(code ?? '')) {
        this.logger.error(
          `Firebase rejected verification continue URL "${continueUrl}" (${code}) — ` +
            'add its domain under Auth → Settings → Authorized domains and check FRONTEND_URL. ' +
            'Falling back to a link without a continue URL.',
        );
        link = await this.firebaseAdmin.auth.generateEmailVerificationLink(email);
      } else {
        this.logger.error(`Could not generate verification link for ${uid}: ${code ?? (error as Error).message}`);
        throw error;
      }
    }

    await this.mailService.sendEmailVerificationEmail(email, displayName, link);
  }
}
