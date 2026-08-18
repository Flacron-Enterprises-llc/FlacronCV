import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { UserRole, SubscriptionPlan, SubscriptionStatus, PLAN_CONFIGS } from '@flacroncv/shared-types';

function makeFirebaseAdmin(firestore: InMemoryFirestore) {
  return { firestore } as any;
}

describe('UsersService', () => {
  let service: UsersService;
  let firestore: InMemoryFirestore;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    service = new UsersService(makeFirebaseAdmin(firestore));
  });

  describe('create', () => {
    it('returns a well-formed User with role=user, plan=free, aiCreditsLimit from PLAN_CONFIGS[FREE]', async () => {
      const user = await service.create({
        uid: 'uid-1',
        email: 'user@example.com',
        displayName: 'Test User',
        photoURL: null,
      });

      expect(user.uid).toBe('uid-1');
      expect(user.email).toBe('user@example.com');
      expect(user.role).toBe(UserRole.USER);
      expect(user.subscription.plan).toBe(SubscriptionPlan.FREE);
      expect(user.subscription.hasUsedTrial).toBe(false);
      expect(user.usage.aiCreditsLimit).toBe(
        PLAN_CONFIGS[SubscriptionPlan.FREE].limits.aiCredits,
      );
      expect(user.isActive).toBe(true);
      expect(user.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('findById', () => {
    it('returns null when user does not exist', async () => {
      const result = await service.findById('non-existent');
      expect(result).toBeNull();
    });

    it('returns the user when it exists', async () => {
      await service.create({ uid: 'uid-2', email: 'a@b.com', displayName: 'A', photoURL: null });
      const result = await service.findById('uid-2');
      expect(result).not.toBeNull();
      expect(result!.uid).toBe('uid-2');
    });
  });

  describe('findByIdOrThrow', () => {
    it('throws NotFoundException when user does not exist', async () => {
      await expect(service.findByIdOrThrow('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates profile fields via dot-notation and returns updated user', async () => {
      await service.create({ uid: 'uid-3', email: 'c@d.com', displayName: 'C D', photoURL: null });

      const updated = await service.update('uid-3', {
        profile: { firstName: 'Updated', headline: 'Engineer' },
      });

      expect(updated.profile.firstName).toBe('Updated');
      expect(updated.profile.headline).toBe('Engineer');
    });

    it('drops unknown profile keys (whitelist) while keeping known ones', async () => {
      await service.create({ uid: 'wl-1', email: 'wl@b.com', displayName: 'WL', photoURL: null });

      const updated = await service.update('wl-1', {
        profile: { firstName: 'Kept', evilKey: 'x'.repeat(10) } as any,
      });

      expect(updated.profile.firstName).toBe('Kept');
      expect((updated.profile as any).evilKey).toBeUndefined();
    });

    it('drops unknown preference keys while keeping known ones', async () => {
      await service.create({ uid: 'wl-2', email: 'wl2@b.com', displayName: 'WL2', photoURL: null });

      const updated = await service.update('wl-2', {
        preferences: { emailNotifications: false, junk: 'nope' } as any,
      });

      expect(updated.preferences.emailNotifications).toBe(false);
      expect((updated.preferences as any).junk).toBeUndefined();
    });

    it('rejects an out-of-enum theme preference with 400', async () => {
      await service.create({ uid: 'v-1', email: 'v1@b.com', displayName: 'V1', photoURL: null });
      await expect(
        service.update('v-1', { preferences: { theme: 'neon' } as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-boolean emailNotifications with 400', async () => {
      await service.create({ uid: 'v-2', email: 'v2@b.com', displayName: 'V2', photoURL: null });
      await expect(
        service.update('v-2', { preferences: { emailNotifications: 'yes' } as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an over-length bio with 400', async () => {
      await service.create({ uid: 'v-3', email: 'v3@b.com', displayName: 'V3', photoURL: null });
      await expect(
        service.update('v-3', { profile: { bio: 'x'.repeat(2001) } }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-https photoURL (e.g. javascript:) with 400', async () => {
      await service.create({ uid: 'v-4', email: 'v4@b.com', displayName: 'V4', photoURL: null });
      await expect(
        service.update('v-4', { photoURL: 'javascript:alert(1)' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid https photoURL', async () => {
      await service.create({ uid: 'v-5', email: 'v5@b.com', displayName: 'V5', photoURL: null });
      const updated = await service.update('v-5', {
        photoURL: 'https://firebasestorage.googleapis.com/v0/b/app/o/avatars%2Fx.jpg?alt=media',
      });
      expect(updated.photoURL).toContain('https://');
    });
  });

  describe('softDelete', () => {
    it('soft-deletes and revokes Firebase sessions + disables the auth user', async () => {
      const auth = {
        revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
        updateUser: jest.fn().mockResolvedValue(undefined),
      };
      const svc = new UsersService({ firestore, auth } as any);
      await svc.create({ uid: 'del-1', email: 'del@b.com', displayName: 'Del', photoURL: null });

      await svc.softDelete('del-1');

      const doc = await firestore.collection('users').doc('del-1').get();
      expect(doc.data()!.isActive).toBe(false);
      expect(doc.data()!.deletedAt).toBeTruthy(); // was null before delete
      expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('del-1');
      expect(auth.updateUser).toHaveBeenCalledWith('del-1', { disabled: true });
    });

    it('still soft-deletes when the auth revocation fails (best-effort)', async () => {
      const auth = {
        revokeRefreshTokens: jest.fn().mockRejectedValue(new Error('auth down')),
        updateUser: jest.fn(),
      };
      const svc = new UsersService({ firestore, auth } as any);
      await svc.create({ uid: 'del-2', email: 'del2@b.com', displayName: 'Del2', photoURL: null });

      await expect(svc.softDelete('del-2')).resolves.toBeUndefined();
      const doc = await firestore.collection('users').doc('del-2').get();
      expect(doc.data()!.isActive).toBe(false);
    });
  });

  describe('signOutEverywhere', () => {
    it('revokes every refresh token for the account', async () => {
      const auth = { revokeRefreshTokens: jest.fn().mockResolvedValue(undefined) };
      const svc = new UsersService({ firestore, auth } as any);

      const result = await svc.signOutEverywhere('so-1');

      expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('so-1');
      expect(new Date(result.revokedAt).getTime()).not.toBeNaN();
    });

    it('propagates a revocation failure instead of reporting success', async () => {
      // The user is being told "you are signed out everywhere". If the revoke
      // failed they are NOT, so this must never be swallowed.
      const auth = { revokeRefreshTokens: jest.fn().mockRejectedValue(new Error('auth down')) };
      const svc = new UsersService({ firestore, auth } as any);

      await expect(svc.signOutEverywhere('so-2')).rejects.toThrow('auth down');
    });
  });

  describe('exportPersonalData', () => {
    const OWNER = 'owner-uid';
    const OTHER = 'other-uid';

    /** Seed one owned document plus an identical one belonging to someone else. */
    async function seedPair(collection: string, extra: Record<string, unknown> = {}) {
      await firestore.collection(collection).doc(`${collection}-mine`).set({
        id: `${collection}-mine`,
        userId: OWNER,
        title: 'Mine',
        createdAt: '2024-01-02T00:00:00.000Z',
        deletedAt: null,
        ...extra,
      });
      await firestore.collection(collection).doc(`${collection}-theirs`).set({
        id: `${collection}-theirs`,
        userId: OTHER,
        title: 'Theirs',
        createdAt: '2024-01-02T00:00:00.000Z',
        deletedAt: null,
        ...extra,
      });
    }

    beforeEach(async () => {
      await service.create({
        uid: OWNER,
        email: 'owner@example.com',
        displayName: 'Owner Person',
        photoURL: null,
      });
      await service.create({
        uid: OTHER,
        email: 'other@example.com',
        displayName: 'Other Person',
        photoURL: null,
      });

      await seedPair('cvs');
      await seedPair('cover_letters');
      await seedPair('job_applications', { company: 'Acme', position: 'Engineer' });

      // CV sections live in a subcollection — a CV without them is an empty shell.
      await firestore
        .collection('cvs')
        .doc('cvs-mine')
        .collection('sections')
        .doc('sec-1')
        .set({ id: 'sec-1', type: 'experience', title: 'Experience', order: 0, items: [{ company: 'Acme' }] });
      await firestore
        .collection('cvs')
        .doc('cvs-theirs')
        .collection('sections')
        .doc('sec-x')
        .set({ id: 'sec-x', type: 'experience', title: 'Their Experience', order: 0, items: [] });

      await firestore.collection('support_tickets').doc('t-mine').set({
        id: 't-mine',
        userId: OWNER,
        userEmail: 'owner@example.com',
        subject: 'Cannot export',
        category: 'technical',
        priority: 'medium',
        status: 'open',
        assignedTo: 'staff-uid-999',
        assignedToName: 'Agent Smith',
        createdAt: '2024-01-03T00:00:00.000Z',
      });
      await firestore.collection('support_tickets').doc('t-theirs').set({
        id: 't-theirs',
        userId: OTHER,
        subject: 'Their private problem',
        createdAt: '2024-01-03T00:00:00.000Z',
      });
      await firestore
        .collection('support_tickets')
        .doc('t-mine')
        .collection('messages')
        .doc('m-1')
        .set({
          id: 'm-1',
          authorId: 'staff-uid-999',
          authorName: 'Agent Smith',
          authorRole: 'admin',
          content: 'Looking into it.',
          attachments: [],
          createdAt: '2024-01-03T01:00:00.000Z',
        });
    });

    it('includes the profile, preferences, subscription summary and usage', async () => {
      const data = await service.exportPersonalData(OWNER);

      expect(data.meta.userId).toBe(OWNER);
      expect(data.meta.format).toBe('flacroncv/user-data-export');
      expect(data.meta.truncated).toEqual([]);
      expect(data.account.email).toBe('owner@example.com');
      expect(data.profile.firstName).toBe('Owner');
      expect(data.preferences.language).toBe('en');
      expect(data.subscription.plan).toBe(SubscriptionPlan.FREE);
      expect(data.usage.aiCreditsLimit).toBe(5);
    });

    it("includes the user's own CVs with their sections", async () => {
      const data = await service.exportPersonalData(OWNER);

      expect(data.cvs).toHaveLength(1);
      expect(data.cvs[0].id).toBe('cvs-mine');
      expect(data.cvs[0].sections).toEqual([
        expect.objectContaining({ id: 'sec-1', title: 'Experience' }),
      ]);
    });

    it("includes the user's cover letters, job applications and support tickets", async () => {
      const data = await service.exportPersonalData(OWNER);

      expect(data.coverLetters.map((c) => c.id)).toEqual(['cover_letters-mine']);
      expect(data.jobApplications.map((j) => j.id)).toEqual(['job_applications-mine']);
      expect(data.supportTickets.map((t) => t.id)).toEqual(['t-mine']);
      expect(data.supportTickets[0].subject).toBe('Cannot export');
      expect(data.supportTickets[0].messages).toEqual([
        expect.objectContaining({ content: 'Looking into it.', authorRole: 'admin' }),
      ]);
    });

    it("does not leak another user's records", async () => {
      const data = await service.exportPersonalData(OWNER);

      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain(OTHER);
      expect(serialized).not.toContain('Theirs');
      expect(serialized).not.toContain('Their Experience');
      expect(serialized).not.toContain('Their private problem');
      expect(serialized).not.toContain('other@example.com');
    });

    it("exports this user's abuse fields and no other uid from the device lookup", async () => {
      await firestore.collection('users').doc(OWNER).update({
        'subscription.hasUsedTrial': true,
        abuse: {
          deviceHash: 'abc123hash',
          ipHash: 'def456hash',
          networkHash: 'def456hash',
          riskScore: 35,
          riskBand: 'allow',
          riskSignals: ['network_burst'],
          scoredAt: '2026-08-18T00:00:00.000Z',
          linkedUids: [OTHER],
        },
      });
      await firestore.collection('abuse_devices').doc('abc123hash').set({
        uids: [OWNER, OTHER],
        uidCount: 2,
        receivedFree: true,
      });

      const data = await service.exportPersonalData(OWNER);
      const serialized = JSON.stringify(data);

      expect(data.abuse.deviceHash).toBe('abc123hash');
      expect(data.abuse.riskScore).toBe(35);
      expect(data.abuse.riskBand).toBe('allow');
      expect(data.abuse.linkedUids).toBeUndefined();
      expect(data.subscription.hasUsedTrial).toBe(true);

      const known = [OWNER, OTHER, 'staff-uid-999'];
      const present = known.filter((id) => serialized.includes(id));
      expect(present).toEqual([OWNER]);
    });

    it('excludes Stripe identifiers from the subscription summary', async () => {
      await firestore.collection('users').doc(OWNER).update({
        'subscription.stripeCustomerId': 'cus_secret123',
        'subscription.stripeSubscriptionId': 'sub_secret123',
      });

      const data = await service.exportPersonalData(OWNER);

      expect(data.subscription.stripeCustomerId).toBeUndefined();
      expect(data.subscription.stripeSubscriptionId).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('cus_secret123');
    });

    it('excludes internal support routing and staff identifiers', async () => {
      const data = await service.exportPersonalData(OWNER);

      const ticket = data.supportTickets[0];
      expect(ticket.assignedTo).toBeUndefined();
      expect(ticket.assignedToName).toBeUndefined();
      // The agent's display name is already shown on the customer's own thread,
      // but their internal uid is not — and must not appear here either.
      expect(JSON.stringify(data)).not.toContain('staff-uid-999');
      expect((ticket.messages as Record<string, unknown>[])[0].authorId).toBeUndefined();
    });

    /**
     * REGRESSION — the export leaked support agents' internal notes.
     *
     * SupportService filters notes out of the customer-facing thread, but this
     * export reads the `messages` subcollection directly and bypassed that
     * filter. The field allowlist then stripped the `internal` flag, so a note
     * arrived in the customer's download looking exactly like a genuine reply —
     * complete with the agent's email address in `authorName`, which the reply
     * path deliberately hides behind "Support Team".
     *
     * Found by cross-checking two independently built features against each
     * other; neither one was wrong on its own.
     */
    it('NEVER exports an internal support note to the customer', async () => {
      await firestore
        .collection('support_tickets')
        .doc('t-mine')
        .collection('messages')
        .doc('note-1')
        .set({
          id: 'note-1',
          ticketId: 't-mine',
          authorId: 'staff-uid-999',
          authorName: 'agent@flacroncv.com',
          authorRole: 'admin',
          content: 'SECRET_INTERNAL_LIKELY_FRAUD',
          internal: true,
          createdAt: new Date('2026-07-30T10:00:00.000Z'),
        });

      const data = await service.exportPersonalData(OWNER);
      const serialized = JSON.stringify(data);

      expect(serialized).not.toContain('SECRET_INTERNAL_LIKELY_FRAUD');
      expect(serialized).not.toContain('agent@flacroncv.com');
      // The genuine customer-facing reply is still there — the filter must not
      // be so blunt that it empties the thread.
      expect(serialized).toContain('Looking into it.');
    });

    it('still exports a legacy message that predates the internal flag', async () => {
      // Existing rows have no `internal` field at all. Absent must mean
      // customer-visible, or the fix would silently erase everyone's history.
      await firestore
        .collection('support_tickets')
        .doc('t-mine')
        .collection('messages')
        .doc('legacy-1')
        .set({
          id: 'legacy-1',
          ticketId: 't-mine',
          authorName: 'Support Team',
          authorRole: 'admin',
          content: 'Legacy reply with no flag',
          createdAt: new Date('2026-07-30T11:00:00.000Z'),
        });

      const data = await service.exportPersonalData(OWNER);
      expect(JSON.stringify(data)).toContain('Legacy reply with no flag');
    });

    it('throws NotFoundException when the account does not exist', async () => {
      await expect(service.exportPersonalData('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listUsers', () => {
    beforeEach(async () => {
      await service.create({ uid: 'u1', email: 'u1@t.com', displayName: 'User One', photoURL: null });
      await service.create({ uid: 'u2', email: 'u2@t.com', displayName: 'User Two', photoURL: null });
    });

    it('returns all active users without filters', async () => {
      const result = await service.listUsers(1, 10);
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeGreaterThanOrEqual(2);
    });

    it('filters by role', async () => {
      const result = await service.listUsers(1, 10, { role: UserRole.USER });
      expect(result.items.every((u) => u.role === UserRole.USER)).toBe(true);
    });

    it('returns pagination metadata', async () => {
      const result = await service.listUsers(1, 1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(1);
      expect(result.totalPages).toBeGreaterThanOrEqual(1);
    });
  });

  describe('incrementUsage', () => {
    it('increments a usage counter atomically', async () => {
      await service.create({ uid: 'inc-1', email: 'inc@b.com', displayName: 'Inc', photoURL: null });

      await service.incrementUsage('inc-1', 'aiCreditsUsed');
      await service.incrementUsage('inc-1', 'aiCreditsUsed', 3);

      const user = await service.findByIdOrThrow('inc-1');
      expect(user.usage.aiCreditsUsed).toBe(4);
    });

    it('does not lose updates under concurrent increments (regression: read-modify-write)', async () => {
      await service.create({ uid: 'inc-2', email: 'inc2@b.com', displayName: 'Inc2', photoURL: null });

      // With the old read-modify-write implementation these interleave: both
      // read 0, both write 1. Atomic increments must land all 10.
      await Promise.all(
        Array.from({ length: 10 }, () => service.incrementUsage('inc-2', 'exportsThisMonth')),
      );

      const user = await service.findByIdOrThrow('inc-2');
      expect(user.usage.exportsThisMonth).toBe(10);
    });
  });

  describe('reserveAiCredit / refundAiCredit', () => {
    const seed = (uid: string, usage: Record<string, number>, subscription: Record<string, unknown>) =>
      firestore.collection('users').doc(uid).set({ uid, usage, subscription });

    const activeFree = { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null };

    it('reserves (returns true) and atomically increments when under the effective limit', async () => {
      await seed('r1', { aiCreditsUsed: 2, aiCreditsLimit: 5 }, activeFree);
      expect(await service.reserveAiCredit('r1')).toBe(true);
      expect((await service.findByIdOrThrow('r1')).usage.aiCreditsUsed).toBe(3);
    });

    it('does not reserve (returns false, no increment) at the limit', async () => {
      await seed('r2', { aiCreditsUsed: 5, aiCreditsLimit: 5 }, activeFree);
      expect(await service.reserveAiCredit('r2')).toBe(false);
      expect((await service.findByIdOrThrow('r2')).usage.aiCreditsUsed).toBe(5);
    });

    it('caps a delinquent-past-grace PRO account at the FREE allowance (effective plan)', async () => {
      // Stored PRO limit is 100, but past_due + expired period → effective FREE (5).
      await seed('r3', { aiCreditsUsed: 5, aiCreditsLimit: 100 }, {
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.PAST_DUE,
        currentPeriodEnd: '2020-01-01T00:00:00.000Z',
      });
      expect(await service.reserveAiCredit('r3')).toBe(false);
    });

    it('returns false for a missing user (no doc → cannot reserve)', async () => {
      expect(await service.reserveAiCredit('ghost')).toBe(false);
    });

    it('enforces the cap under concurrency — only `remaining` reservations succeed', async () => {
      await seed('r4', { aiCreditsUsed: 3, aiCreditsLimit: 5 }, activeFree); // 2 remaining
      const results = await Promise.all(Array.from({ length: 10 }, () => service.reserveAiCredit('r4')));
      expect(results.filter(Boolean)).toHaveLength(2);
      expect((await service.findByIdOrThrow('r4')).usage.aiCreditsUsed).toBe(5);
    });

    it('refundAiCredit decrements the counter', async () => {
      await seed('r5', { aiCreditsUsed: 3, aiCreditsLimit: 5 }, activeFree);
      await service.refundAiCredit('r5');
      expect((await service.findByIdOrThrow('r5')).usage.aiCreditsUsed).toBe(2);
    });
  });
});
