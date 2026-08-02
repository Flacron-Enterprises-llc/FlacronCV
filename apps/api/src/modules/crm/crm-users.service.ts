import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { CRMAuditService } from './crm-audit.service';
import {
  PlatformUserItem,
  PlatformUserListParams,
  PLAN_CONFIGS,
  SubscriptionPlan,
  User,
  UserRole,
} from '@flacroncv/shared-types';

@Injectable()
export class CRMUsersService {
  private readonly col = 'users';

  constructor(
    private firebase: FirebaseAdminService,
    private audit: CRMAuditService,
  ) {}

  // ─── Read ──────────────────────────────────────────────────────────────────

  async listUsers(params: PlatformUserListParams): Promise<{
    items: PlatformUserItem[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 25, 100);

    let query: FirebaseFirestore.Query = this.firebase.firestore.collection(this.col);

    if (params.role) query = query.where('role', '==', params.role);
    if (params.plan) query = query.where('subscription.plan', '==', params.plan);
    if (params.isActive !== undefined) query = query.where('isActive', '==', params.isActive);

    query = query.orderBy('createdAt', 'desc').limit(2000);

    const snapshot = await query.get();
    let users: User[] = snapshot.docs.map((d: any) => d.data() as User);

    if (params.search) {
      const q = params.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          (u.displayName ?? '').toLowerCase().includes(q),
      );
    }

    if (params.sortBy && params.sortBy !== 'createdAt') {
      users.sort((a, b) => {
        let aVal: number | string | Date;
        let bVal: number | string | Date;
        switch (params.sortBy) {
          case 'lastLoginAt':
            aVal = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
            bVal = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
            break;
          case 'displayName':
            aVal = (a.displayName ?? '').toLowerCase();
            bVal = (b.displayName ?? '').toLowerCase();
            break;
          case 'cvsCreated':
            aVal = a.usage?.cvsCreated ?? 0;
            bVal = b.usage?.cvsCreated ?? 0;
            break;
          default:
            return 0;
        }
        if (aVal < bVal) return params.sortOrder === 'asc' ? -1 : 1;
        if (aVal > bVal) return params.sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    } else if (params.sortOrder === 'asc') {
      users.reverse();
    }

    const total = users.length;
    const pages = Math.ceil(total / limit);
    const paginated = users.slice((page - 1) * limit, page * limit);
    const items: PlatformUserItem[] = paginated.map(this.toItem);

    return { items, total, page, limit, pages };
  }

  async getUserById(uid: string): Promise<User> {
    const doc = await this.firebase.firestore.collection(this.col).doc(uid).get();
    if (!doc.exists) throw new NotFoundException('User not found');
    return doc.data() as User;
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────

  async updateUserRole(
    uid: string,
    role: string,
    actorId: string,
    actorEmail: string,
  ): Promise<User> {
    const user = await this.getUserById(uid);

    // Never allow demoting the LAST super_admin — that would lock everyone out
    // of super_admin-only controls (this endpoint is itself super_admin-only).
    if (user.role === UserRole.SUPER_ADMIN && role !== UserRole.SUPER_ADMIN) {
      const superAdmins = await this.firebase.firestore
        .collection(this.col)
        .where('role', '==', UserRole.SUPER_ADMIN)
        .get();
      const hasOtherSuperAdmin = superAdmins.docs.some(
        (d: any) => (d.data() as { uid?: string }).uid !== uid,
      );
      if (!hasOtherSuperAdmin) {
        throw new BadRequestException('Cannot demote the last super admin.');
      }
    }

    await this.firebase.firestore.collection(this.col).doc(uid).update({
      role,
      updatedAt: new Date(),
    });
    // Sync to Firebase Auth custom claims so the JWT reflects the new role immediately
    await this.firebase.auth.setCustomUserClaims(uid, { role });
    await this.audit.log({
      actorId,
      actorEmail,
      action: 'USER_ROLE_CHANGED',
      targetType: 'user',
      targetId: uid,
      targetName: user.email,
      details: { from: user.role, to: role },
    });
    return this.getUserById(uid);
  }

  // A non-super_admin may not manage a super_admin account (suspend, reactivate,
  // change plan, reset usage) — mirrors the super_admin-only role endpoint and
  // protects the top tier from lockout/tampering by a lower admin.
  private assertCanManageTarget(actorRole: string, targetRole: string): void {
    if (targetRole === UserRole.SUPER_ADMIN && actorRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can manage a super admin account.');
    }
  }

  async updateUserPlan(
    uid: string,
    plan: string,
    status: string,
    actorId: string,
    actorEmail: string,
    actorRole: string,
  ): Promise<User> {
    const user = await this.getUserById(uid);
    this.assertCanManageTarget(actorRole, user.role);

    // Move the AI-credit ceiling with the plan. Stripe's own paths do this
    // (payment.service.ts writes `usage.aiCreditsLimit` alongside the plan), but
    // this manual path did not — so an operator comping someone to Pro or
    // Enterprise left them capped at the FREE allowance of 5 credits, with the
    // UI cheerfully showing the upgraded plan. The comp silently did nothing.
    const limits = PLAN_CONFIGS[plan as SubscriptionPlan]?.limits;
    await this.firebase.firestore.collection(this.col).doc(uid).update({
      'subscription.plan': plan,
      'subscription.status': status,
      ...(limits ? { 'usage.aiCreditsLimit': limits.aiCredits } : {}),
      updatedAt: new Date(),
    });
    await this.audit.log({
      actorId,
      actorEmail,
      action: 'USER_PLAN_CHANGED',
      targetType: 'user',
      targetId: uid,
      targetName: user.email,
      details: { from: user.subscription?.plan, to: plan },
    });
    return this.getUserById(uid);
  }

  async suspendUser(uid: string, actorId: string, actorEmail: string, actorRole: string): Promise<User> {
    const user = await this.getUserById(uid);
    this.assertCanManageTarget(actorRole, user.role);
    await this.firebase.firestore.collection(this.col).doc(uid).update({
      isActive: false,
      // NOT deletedAt — suspension is a moderation state, not a deletion, and
      // stamping a deletion date made a suspended account indistinguishable
      // from a self-deleted one.
      suspendedAt: new Date(),
      updatedAt: new Date(),
    });
    // Revoking alone does NOT suspend anyone: it invalidates refresh tokens
    // already issued, but the account stays enabled, so the user simply signs in
    // again and Firebase mints a fresh token. Disabling the Auth record is what
    // actually blocks re-authentication — the same pair UsersService.softDelete
    // uses. Without it the operator saw a success toast and the account kept
    // full access forever.
    await this.firebase.auth.revokeRefreshTokens(uid);
    await this.firebase.auth.updateUser(uid, { disabled: true });
    await this.audit.log({
      actorId,
      actorEmail,
      action: 'USER_SUSPENDED',
      targetType: 'user',
      targetId: uid,
      targetName: user.email,
      details: {},
    });
    return this.getUserById(uid);
  }

  async reactivateUser(uid: string, actorId: string, actorEmail: string, actorRole: string): Promise<User> {
    const user = await this.getUserById(uid);
    this.assertCanManageTarget(actorRole, user.role);
    await this.firebase.firestore.collection(this.col).doc(uid).update({
      isActive: true,
      deletedAt: null,
      suspendedAt: null,
      updatedAt: new Date(),
    });
    // Re-enable the Auth record. Reactivating only flipped the Firestore flag,
    // so an account disabled by suspend — or by self-deletion, which also
    // disables — stayed permanently unable to sign in even after an operator
    // "reactivated" it.
    await this.firebase.auth.updateUser(uid, { disabled: false });
    await this.audit.log({
      actorId,
      actorEmail,
      action: 'USER_REACTIVATED',
      targetType: 'user',
      targetId: uid,
      targetName: user.email,
      details: {},
    });
    return this.getUserById(uid);
  }

  async resetUsage(uid: string, actorId: string, actorEmail: string, actorRole: string): Promise<User> {
    const user = await this.getUserById(uid);
    this.assertCanManageTarget(actorRole, user.role);
    const now = new Date();
    await this.firebase.firestore.collection(this.col).doc(uid).update({
      'usage.aiCreditsUsed': 0,
      'usage.exportsThisMonth': 0,
      'usage.lastExportReset': now,
      updatedAt: now,
    });
    await this.audit.log({
      actorId,
      actorEmail,
      action: 'USER_USAGE_RESET',
      targetType: 'user',
      targetId: uid,
      targetName: user.email,
      details: {},
    });
    return this.getUserById(uid);
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  async getAllForExport(): Promise<User[]> {
    const snapshot = await this.firebase.firestore
      .collection(this.col)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((d: any) => d.data() as User);
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  private toItem(u: User): PlatformUserItem {
    return {
      uid: u.uid,
      email: u.email,
      displayName: u.displayName ?? '',
      photoURL: u.photoURL ?? null,
      role: u.role,
      subscriptionPlan: u.subscription?.plan ?? 'free',
      subscriptionStatus: u.subscription?.status ?? 'active',
      cvsCreated: u.usage?.cvsCreated ?? 0,
      coverLettersCreated: u.usage?.coverLettersCreated ?? 0,
      aiCreditsUsed: u.usage?.aiCreditsUsed ?? 0,
      aiCreditsLimit: u.usage?.aiCreditsLimit ?? 5,
      exportsThisMonth: u.usage?.exportsThisMonth ?? 0,
      isActive: u.isActive ?? true,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      location: u.profile?.location ?? '',
    };
  }
}
