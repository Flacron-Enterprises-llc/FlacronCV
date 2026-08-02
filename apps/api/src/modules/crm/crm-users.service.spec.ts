import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CRMUsersService } from './crm-users.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { UserRole, SubscriptionPlan } from '@flacroncv/shared-types';

function makeUser(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: 'Test User',
    photoURL: null,
    role: UserRole.USER,
    isActive: true,
    deletedAt: null,
    subscription: { plan: SubscriptionPlan.FREE, status: 'active', stripeCustomerId: null },
    usage: { cvsCreated: 0, coverLettersCreated: 0, aiCreditsUsed: 0, aiCreditsLimit: 5, exportsThisMonth: 0 },
    profile: { location: 'London' },
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    ...overrides,
  };
}

function makeFirebaseAdmin(firestore: InMemoryFirestore) {
  return {
    firestore,
    auth: {
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
      // Suspension disables the Auth record; revoking alone only invalidates
      // tokens already issued and the user can just sign in again.
      updateUser: jest.fn().mockResolvedValue(undefined),
    },
  } as any;
}

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) } as any;
}

async function seedUser(firestore: InMemoryFirestore, data: Record<string, unknown>) {
  const uid = data.uid as string;
  await firestore.collection('users').doc(uid).set(data);
  return uid;
}

describe('CRMUsersService', () => {
  let service: CRMUsersService;
  let firestore: InMemoryFirestore;
  let firebase: ReturnType<typeof makeFirebaseAdmin>;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    firebase = makeFirebaseAdmin(firestore);
    audit = makeAudit();
    service = new CRMUsersService(firebase, audit);
  });

  // ─── listUsers ──────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('returns empty list when no users exist', async () => {
      const result = await service.listUsers({});
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('returns paginated users', async () => {
      for (let i = 1; i <= 5; i++) {
        await seedUser(firestore, makeUser(`uid-${i}`));
      }
      const result = await service.listUsers({ page: 1, limit: 3 });
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.pages).toBe(2);
    });

    it('filters by role', async () => {
      await seedUser(firestore, makeUser('uid-admin', { role: UserRole.ADMIN }));
      await seedUser(firestore, makeUser('uid-user', { role: UserRole.USER }));
      const result = await service.listUsers({ role: UserRole.ADMIN });
      expect(result.items.every((u) => u.role === UserRole.ADMIN)).toBe(true);
    });

    it('filters by isActive', async () => {
      await seedUser(firestore, makeUser('uid-active', { isActive: true }));
      await seedUser(firestore, makeUser('uid-inactive', { isActive: false }));
      const result = await service.listUsers({ isActive: false });
      expect(result.items.every((u) => u.isActive === false)).toBe(true);
    });

    it('searches by email substring', async () => {
      await seedUser(firestore, makeUser('uid-a', { email: 'alice@example.com' }));
      await seedUser(firestore, makeUser('uid-b', { email: 'bob@example.com' }));
      const result = await service.listUsers({ search: 'alice' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].email).toBe('alice@example.com');
    });
  });

  // ─── getUserById ────────────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('throws NotFoundException for unknown uid', async () => {
      await expect(service.getUserById('ghost')).rejects.toThrow(NotFoundException);
    });

    it('returns the user when found', async () => {
      await seedUser(firestore, makeUser('uid-x'));
      const user = await service.getUserById('uid-x');
      expect(user.uid).toBe('uid-x');
    });
  });

  // ─── updateUserRole ─────────────────────────────────────────────────────────

  describe('updateUserRole', () => {
    it('updates role in Firestore and syncs Firebase Auth custom claims', async () => {
      await seedUser(firestore, makeUser('uid-1'));

      await service.updateUserRole('uid-1', UserRole.ADMIN, 'actor-id', 'actor@example.com');

      const updated = await service.getUserById('uid-1');
      expect(updated.role).toBe(UserRole.ADMIN);
      expect(firebase.auth.setCustomUserClaims).toHaveBeenCalledWith('uid-1', { role: UserRole.ADMIN });
    });

    it('writes an audit log entry', async () => {
      await seedUser(firestore, makeUser('uid-1'));
      await service.updateUserRole('uid-1', UserRole.ADMIN, 'actor-id', 'actor@example.com');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_ROLE_CHANGED', targetId: 'uid-1' }),
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      await expect(
        service.updateUserRole('ghost', UserRole.ADMIN, 'a', 'a@example.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('promoting a user to super_admin is allowed (guard only blocks demotions)', async () => {
      await seedUser(firestore, makeUser('promote-me', { role: UserRole.ADMIN }));
      await service.updateUserRole('promote-me', UserRole.SUPER_ADMIN, 'actor', 'actor@example.com');
      expect((await service.getUserById('promote-me')).role).toBe(UserRole.SUPER_ADMIN);
    });

    it('blocks demoting the LAST super_admin', async () => {
      await seedUser(firestore, makeUser('sa-1', { role: UserRole.SUPER_ADMIN }));
      await expect(
        service.updateUserRole('sa-1', UserRole.ADMIN, 'sa-1', 'sa-1@example.com'),
      ).rejects.toThrow(BadRequestException);
      // Role must be unchanged and no claim written.
      expect((await service.getUserById('sa-1')).role).toBe(UserRole.SUPER_ADMIN);
      expect(firebase.auth.setCustomUserClaims).not.toHaveBeenCalled();
    });

    it('allows demoting a super_admin when another super_admin remains', async () => {
      await seedUser(firestore, makeUser('sa-1', { role: UserRole.SUPER_ADMIN }));
      await seedUser(firestore, makeUser('sa-2', { role: UserRole.SUPER_ADMIN }));
      await service.updateUserRole('sa-1', UserRole.ADMIN, 'sa-2', 'sa-2@example.com');
      expect((await service.getUserById('sa-1')).role).toBe(UserRole.ADMIN);
      expect(firebase.auth.setCustomUserClaims).toHaveBeenCalledWith('sa-1', { role: UserRole.ADMIN });
    });
  });

  // ─── suspendUser ────────────────────────────────────────────────────────────

  describe('suspendUser', () => {
    it('sets isActive to false and revokes Firebase refresh tokens', async () => {
      await seedUser(firestore, makeUser('uid-2'));

      await service.suspendUser('uid-2', 'actor-id', 'actor@example.com', UserRole.ADMIN);

      const updated = await service.getUserById('uid-2');
      expect(updated.isActive).toBe(false);
      expect(firebase.auth.revokeRefreshTokens).toHaveBeenCalledWith('uid-2');
    });

    // The bug this guards: revoking only invalidates refresh tokens ALREADY
    // issued. The Auth record stayed enabled, so a suspended user signed in
    // again and Firebase minted a fresh token — the suspension did nothing while
    // showing the operator a success state.
    it('disables the Firebase Auth record so the user cannot sign in again', async () => {
      await seedUser(firestore, makeUser('uid-2'));

      await service.suspendUser('uid-2', 'actor-id', 'actor@example.com', UserRole.ADMIN);

      expect(firebase.auth.updateUser).toHaveBeenCalledWith('uid-2', { disabled: true });
    });

    it('writes a USER_SUSPENDED audit log entry', async () => {
      await seedUser(firestore, makeUser('uid-2'));
      await service.suspendUser('uid-2', 'actor-id', 'actor@example.com', UserRole.ADMIN);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_SUSPENDED' }),
      );
    });
  });

  // ─── reactivateUser ─────────────────────────────────────────────────────────

  describe('reactivateUser', () => {
    it('sets isActive to true', async () => {
      await seedUser(firestore, makeUser('uid-3', { isActive: false, deletedAt: new Date() }));

      await service.reactivateUser('uid-3', 'actor-id', 'actor@example.com', UserRole.ADMIN);

      const updated = await service.getUserById('uid-3');
      expect(updated.isActive).toBe(true);
      // Reactivation must re-enable Auth too, or an account disabled by suspend
      // (or by self-deletion) stays permanently unable to sign in.
      expect(firebase.auth.updateUser).toHaveBeenCalledWith('uid-3', { disabled: false });
      expect(updated.deletedAt).toBeNull();
    });
  });

  // ─── resetUsage ─────────────────────────────────────────────────────────────

  describe('resetUsage', () => {
    it('zeros out AI credits and exports counter', async () => {
      await seedUser(firestore, makeUser('uid-4', {
        usage: { aiCreditsUsed: 50, exportsThisMonth: 10, aiCreditsLimit: 100, cvsCreated: 3, coverLettersCreated: 1 },
      }));

      await service.resetUsage('uid-4', 'actor-id', 'actor@example.com', UserRole.ADMIN);

      const updated = await service.getUserById('uid-4');
      expect(updated.usage.aiCreditsUsed).toBe(0);
      expect(updated.usage.exportsThisMonth).toBe(0);
    });
  });

  // ─── tier guard: non-super_admin cannot manage a super_admin ─────────────────

  describe('tier guard (target-role protection)', () => {
    it('blocks a plain admin from suspending a super_admin (and does not revoke sessions)', async () => {
      await seedUser(firestore, makeUser('sa-1', { role: UserRole.SUPER_ADMIN }));
      await expect(
        service.suspendUser('sa-1', 'admin-actor', 'admin@example.com', UserRole.ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect((await service.getUserById('sa-1')).isActive).toBe(true);
      expect(firebase.auth.revokeRefreshTokens).not.toHaveBeenCalled();
    });

    it('allows a super_admin to suspend a super_admin', async () => {
      await seedUser(firestore, makeUser('sa-2', { role: UserRole.SUPER_ADMIN }));
      await service.suspendUser('sa-2', 'sa-actor', 'sa@example.com', UserRole.SUPER_ADMIN);
      expect((await service.getUserById('sa-2')).isActive).toBe(false);
      expect(firebase.auth.revokeRefreshTokens).toHaveBeenCalledWith('sa-2');
    });

    it('still lets a plain admin suspend a regular user', async () => {
      await seedUser(firestore, makeUser('regular', { role: UserRole.USER }));
      await service.suspendUser('regular', 'admin-actor', 'admin@example.com', UserRole.ADMIN);
      expect((await service.getUserById('regular')).isActive).toBe(false);
    });

    it('blocks a plain admin from changing a super_admin plan / reactivating / resetting usage', async () => {
      await seedUser(firestore, makeUser('sa-3', { role: UserRole.SUPER_ADMIN }));
      await expect(
        service.updateUserPlan('sa-3', 'free', 'canceled', 'a', 'a@example.com', UserRole.ADMIN),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.reactivateUser('sa-3', 'a', 'a@example.com', UserRole.ADMIN),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.resetUsage('sa-3', 'a', 'a@example.com', UserRole.ADMIN),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
