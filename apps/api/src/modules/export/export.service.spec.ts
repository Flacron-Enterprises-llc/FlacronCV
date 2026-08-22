import { ExportService, exportLimitReachedMessage } from './export.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { PLAN_CONFIGS, SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';

function makeFirebaseAdmin(firestore: InMemoryFirestore) {
  return { firestore } as any;
}

function makeService(firestore: InMemoryFirestore) {
  const abuse = { assertNewConsumption: jest.fn().mockResolvedValue(undefined) };
  const service = new ExportService(
    makeFirebaseAdmin(firestore),
    {} as any,
    {} as any,
    {} as any,
    abuse as any,
  );
  return { service, abuse };
}

async function seedUser(
  firestore: InMemoryFirestore,
  uid: string,
  plan: SubscriptionPlan,
  exportsThisMonth: number,
  status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
  currentPeriodEnd: Date | string | null = null,
) {
  await firestore.collection('users').doc(uid).set({
    uid,
    subscription: { plan, status, currentPeriodEnd },
    usage: { exportsThisMonth },
  });
}

async function used(firestore: InMemoryFirestore, uid: string): Promise<number> {
  const snap = await firestore.collection('users').doc(uid).get();
  return (snap.data() as { usage: { exportsThisMonth: number } }).usage.exportsThisMonth;
}

describe('ExportService client export reserve / refund / confirm', () => {
  let firestore: InMemoryFirestore;
  let service: ExportService;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    ({ service } = makeService(firestore));
  });

  describe('recordClientExport (transactional reserve)', () => {
    it('blocks DOCX for a FREE user without incrementing or writing a reservation', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 0);
      const result = await service.recordClientExport('uid', 'docx');
      expect(result).toEqual({ allowed: false, reason: 'docx_requires_paid' });
      expect(await used(firestore, 'uid')).toBe(0);
      expect((await firestore.collection('export_reservations').get()).docs).toHaveLength(0);
    });

    it('allows a FREE PDF under quota, increments, and returns a reservationId', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 0);
      const result = await service.recordClientExport('uid', 'pdf');
      expect(result.allowed).toBe(true);
      expect(result.reservationId).toEqual(expect.any(String));
      expect(await used(firestore, 'uid')).toBe(1);
      const res = await firestore.collection('export_reservations').doc(result.reservationId!).get();
      expect(res.exists).toBe(true);
      expect(res.data()).toMatchObject({ uid: 'uid', status: 'reserved', format: 'pdf' });
    });

    it('blocks a FREE PDF once the lifetime quota of 2 is reached', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 2);
      const result = await service.recordClientExport('uid', 'pdf');
      expect(result).toEqual({ allowed: false, reason: 'limit_reached' });
      expect(await used(firestore, 'uid')).toBe(2);
    });

    it('allows DOCX for PRO and records usage even when the counter is high (unlimited)', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.PRO, 999);
      const result = await service.recordClientExport('uid', 'docx');
      expect(result.allowed).toBe(true);
      expect(await used(firestore, 'uid')).toBe(1000);
    });

    it('treats delinquent-past-grace PRO as FREE (blocks DOCX)', async () => {
      await seedUser(
        firestore,
        'uid',
        SubscriptionPlan.PRO,
        0,
        SubscriptionStatus.PAST_DUE,
        new Date('2000-01-01T00:00:00.000Z'),
      );
      const result = await service.recordClientExport('uid', 'docx');
      expect(result).toEqual({ allowed: false, reason: 'docx_requires_paid' });
      expect(await used(firestore, 'uid')).toBe(0);
    });

    it('enforces the Free cap under concurrency — only remaining reservations succeed', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 0); // 2 remaining
      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.recordClientExport('uid', 'pdf')),
      );
      expect(results.filter((r) => r.allowed)).toHaveLength(2);
      expect(await used(firestore, 'uid')).toBe(2);
    });
  });

  describe('refundClientExport (idempotent, floor at zero)', () => {
    it('refunds a reserved export once and restores the counter', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 0);
      const { reservationId } = await service.recordClientExport('uid', 'pdf');
      expect(await used(firestore, 'uid')).toBe(1);

      const first = await service.refundClientExport('uid', reservationId!);
      expect(first).toEqual({ refunded: true });
      expect(await used(firestore, 'uid')).toBe(0);

      const second = await service.refundClientExport('uid', reservationId!);
      expect(second).toEqual({ refunded: false });
      expect(await used(firestore, 'uid')).toBe(0);
    });

    it('does not hand back an export that was never spent (unknown id / empty id)', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 1);
      expect(await service.refundClientExport('uid', 'no-such-reservation')).toEqual({
        refunded: false,
      });
      expect(await service.refundClientExport('uid', '')).toEqual({ refunded: false });
      expect(await used(firestore, 'uid')).toBe(1);
    });

    it('does not refund another user\'s reservation', async () => {
      await seedUser(firestore, 'owner', SubscriptionPlan.FREE, 0);
      await seedUser(firestore, 'other', SubscriptionPlan.FREE, 0);
      const { reservationId } = await service.recordClientExport('owner', 'pdf');
      expect(await service.refundClientExport('other', reservationId!)).toEqual({ refunded: false });
      expect(await used(firestore, 'owner')).toBe(1);
    });

    it('never takes the counter below zero when used is already 0', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 0);
      const { reservationId } = await service.recordClientExport('uid', 'pdf');
      // Simulate a corrupted / manually zeroed counter while reservation is live.
      await firestore.collection('users').doc('uid').update({
        usage: { exportsThisMonth: 0 },
      });
      const result = await service.refundClientExport('uid', reservationId!);
      expect(result).toEqual({ refunded: true }); // reservation closed
      expect(await used(firestore, 'uid')).toBe(0);
      // Second call still no-op
      expect(await service.refundClientExport('uid', reservationId!)).toEqual({ refunded: false });
      expect(await used(firestore, 'uid')).toBe(0);
    });

    it('a double-fired catch after one reserve refunds exactly once (prior usage intact)', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 1); // one prior successful export
      const { reservationId } = await service.recordClientExport('uid', 'pdf');
      expect(await used(firestore, 'uid')).toBe(2);

      await Promise.all([
        service.refundClientExport('uid', reservationId!),
        service.refundClientExport('uid', reservationId!),
      ]);
      expect(await used(firestore, 'uid')).toBe(1); // only the new reserve returned
    });

    it('does not refund a reservation that was already confirmed (consumed)', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 0);
      const { reservationId } = await service.recordClientExport('uid', 'pdf');
      expect(await service.confirmClientExport('uid', reservationId!)).toBe('confirmed');
      expect(await service.refundClientExport('uid', reservationId!)).toEqual({ refunded: false });
      expect(await used(firestore, 'uid')).toBe(1);
    });
  });

  describe('exportLimitReachedMessage', () => {
    it('Free copy does not promise a monthly reset', () => {
      const free = PLAN_CONFIGS[SubscriptionPlan.FREE].limits.exports as number;
      expect(exportLimitReachedMessage(SubscriptionPlan.FREE, free)).toBe(
        `Export limit reached for your plan (${free}). Please upgrade.`,
      );
      expect(exportLimitReachedMessage(SubscriptionPlan.FREE, free)).not.toContain('/month');
    });

    it('paid numeric copy keeps monthly cadence', () => {
      expect(exportLimitReachedMessage(SubscriptionPlan.PRO, 10)).toBe(
        'Export limit reached for your plan (10/month). Please upgrade.',
      );
    });
  });

  describe('confirmClientExport', () => {
    it('transitions reserved → consumed once; repeats are already_consumed', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 0);
      const { reservationId } = await service.recordClientExport('uid', 'pdf');
      expect(await service.confirmClientExport('uid', reservationId!)).toBe('confirmed');
      expect(await service.confirmClientExport('uid', reservationId!)).toBe('already_consumed');
      expect(await used(firestore, 'uid')).toBe(1); // confirm does not charge again
    });

    it('rejects confirm after refund', async () => {
      await seedUser(firestore, 'uid', SubscriptionPlan.FREE, 0);
      const { reservationId } = await service.recordClientExport('uid', 'pdf');
      await service.refundClientExport('uid', reservationId!);
      expect(await service.confirmClientExport('uid', reservationId!)).toBe('invalid');
    });
  });
});
