import { NotFoundException } from '@nestjs/common';
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
  });

  // ─── suspendUser ────────────────────────────────────────────────────────────

  describe('suspendUser', () => {
    it('sets isActive to false and revokes Firebase refresh tokens', async () => {
      await seedUser(firestore, makeUser('uid-2'));

      await service.suspendUser('uid-2', 'actor-id', 'actor@example.com');

      const updated = await service.getUserById('uid-2');
      expect(updated.isActive).toBe(false);
      expect(firebase.auth.revokeRefreshTokens).toHaveBeenCalledWith('uid-2');
    });

    it('writes a USER_SUSPENDED audit log entry', async () => {
      await seedUser(firestore, makeUser('uid-2'));
      await service.suspendUser('uid-2', 'actor-id', 'actor@example.com');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_SUSPENDED' }),
      );
    });
  });

  // ─── reactivateUser ─────────────────────────────────────────────────────────

  describe('reactivateUser', () => {
    it('sets isActive to true', async () => {
      await seedUser(firestore, makeUser('uid-3', { isActive: false, deletedAt: new Date() }));

      await service.reactivateUser('uid-3', 'actor-id', 'actor@example.com');

      const updated = await service.getUserById('uid-3');
      expect(updated.isActive).toBe(true);
      expect(updated.deletedAt).toBeNull();
    });
  });

  // ─── resetUsage ─────────────────────────────────────────────────────────────

  describe('resetUsage', () => {
    it('zeros out AI credits and exports counter', async () => {
      await seedUser(firestore, makeUser('uid-4', {
        usage: { aiCreditsUsed: 50, exportsThisMonth: 10, aiCreditsLimit: 100, cvsCreated: 3, coverLettersCreated: 1 },
      }));

      await service.resetUsage('uid-4', 'actor-id', 'actor@example.com');

      const updated = await service.getUserById('uid-4');
      expect(updated.usage.aiCreditsUsed).toBe(0);
      expect(updated.usage.exportsThisMonth).toBe(0);
    });
  });
});
