import { UsersService } from './users.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';

/**
 * Five-plan catalog usage rules on the V1 Firestore counters:
 * monthly renewal anchored to the billing period (paid) or the account
 * anniversary (Free), analyses as a separate counter, and every legacy path
 * left exactly as it was.
 */
describe('UsersService — plan usage (five-plan catalog)', () => {
  let firestore: InMemoryFirestore;
  let service: UsersService;
  const day = 24 * 60 * 60 * 1000;
  const ago = (days: number) => new Date(Date.now() - days * day);

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    service = new UsersService({ firestore } as any);
  });

  const seed = (uid: string, doc: Record<string, unknown>) =>
    firestore.collection('users').doc(uid).set({ uid, isActive: true, ...doc });
  const usage = async (uid: string) => (await service.findByIdOrThrow(uid)).usage as any;

  describe('monthly window rollover', () => {
    it('Free renews on the account anniversary: last reset before this window → counters zeroed', async () => {
      // Account created 40 days ago; counters last reset at creation.
      await seed('f1', {
        createdAt: ago(40),
        subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE },
        usage: { aiCreditsUsed: 3, analysesUsed: 3, aiCreditsLimit: 5, exportsThisMonth: 7, lastExportReset: ago(40) },
      });
      expect(await service.rolloverUsageIfDue('f1')).toBe(true);
      const u = await usage('f1');
      expect(u).toMatchObject({ aiCreditsUsed: 0, analysesUsed: 0, exportsThisMonth: 0, aiCreditsLimit: 3 });
      // The stored window start is the anniversary, not "now".
      expect(new Date(u.usagePeriodStart).getTime()).toBeLessThan(Date.now());
      expect(await service.rolloverUsageIfDue('f1')).toBe(false);
    });

    it('Free inside its first month keeps its counters', async () => {
      await seed('f2', {
        createdAt: ago(10),
        subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE },
        usage: { aiCreditsUsed: 2, aiCreditsLimit: 3, lastExportReset: ago(10) },
      });
      expect(await service.rolloverUsageIfDue('f2')).toBe(false);
      expect((await usage('f2')).aiCreditsUsed).toBe(2);
    });

    it('a paid current plan renews from its billing period start (annual plans renew monthly too)', async () => {
      await seed('s1', {
        createdAt: ago(400),
        subscription: {
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: ago(65), // an annual period that started ~2 months ago
          currentPeriodEnd: new Date(Date.now() + 300 * day),
        },
        usage: { aiCreditsUsed: 20, aiCreditsLimit: 20, usagePeriodStart: ago(65) },
      });
      expect(await service.reserveAiCredit('s1')).toBe(true);
      expect((await usage('s1')).aiCreditsUsed).toBe(1);
    });

    it('LEGACY plans are never rolled over here (calendar cron + invoice reset only)', async () => {
      await seed('p1', {
        createdAt: ago(400),
        subscription: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null },
        usage: { aiCreditsUsed: 100, aiCreditsLimit: 100, lastExportReset: ago(90) },
      });
      expect(await service.rolloverUsageIfDue('p1')).toBe(false);
      expect(await service.reserveAiCredit('p1')).toBe(false);
      expect((await usage('p1')).aiCreditsUsed).toBe(100);
    });

    it('sign-in rolls a due window over', async () => {
      await seed('f3', {
        createdAt: ago(35),
        lastLoginAt: ago(35),
        subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE },
        usage: { aiCreditsUsed: 3, aiCreditsLimit: 3, lastExportReset: ago(35) },
      });
      await service.updateLastLogin('f3');
      expect((await usage('f3')).aiCreditsUsed).toBe(0);
    });
  });

  describe('résumé analyses (ATS check)', () => {
    it('current plans spend an analysis, not a credit', async () => {
      await seed('a1', {
        createdAt: ago(5),
        subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE },
        usage: { aiCreditsUsed: 3, aiCreditsLimit: 3, analysesUsed: 2, lastExportReset: ago(5) },
      });
      expect(await service.reserveAnalysis('a1')).toEqual({ ok: true, counter: 'analyses' });
      expect(await service.reserveAnalysis('a1')).toEqual({ ok: false, counter: 'analyses' });
      const u = await usage('a1');
      expect(u.analysesUsed).toBe(3);
      expect(u.aiCreditsUsed).toBe(3);
    });

    it('LEGACY plans keep spending an Engine credit for the ATS check', async () => {
      await seed('a2', {
        subscription: { plan: SubscriptionPlan.ENTERPRISE, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null },
        usage: { aiCreditsUsed: 10, aiCreditsLimit: 500 },
      });
      expect(await service.reserveAnalysis('a2')).toEqual({ ok: true, counter: 'aiCredits' });
      expect((await usage('a2')).aiCreditsUsed).toBe(11);
      expect((await usage('a2')).analysesUsed).toBeUndefined();
    });

    it('refundUsage gives an analysis back and never goes below zero', async () => {
      await seed('a3', {
        createdAt: ago(5),
        subscription: { plan: SubscriptionPlan.STARTER, status: SubscriptionStatus.ACTIVE },
        usage: { analysesUsed: 1, lastExportReset: ago(5) },
      });
      await service.refundUsage('a3', 'analyses');
      await service.refundUsage('a3', 'analyses');
      expect((await usage('a3')).analysesUsed).toBe(0);
    });
  });

  describe('GET /users/me/usage summary', () => {
    it('keeps the stored fields and adds stored document counts and analyses', async () => {
      await seed('g1', {
        createdAt: ago(3),
        subscription: { plan: SubscriptionPlan.STARTER, status: SubscriptionStatus.ACTIVE },
        usage: { cvsCreated: 9, coverLettersCreated: 2, aiCreditsUsed: 4, aiCreditsLimit: 20, analysesUsed: 1, exportsThisMonth: 0, lastExportReset: ago(3) },
      });
      await firestore.collection('cvs').doc('x1').set({ id: 'x1', userId: 'g1', deletedAt: null });
      await firestore.collection('cvs').doc('x2').set({ id: 'x2', userId: 'g1', deletedAt: null });
      await firestore.collection('cvs').doc('x3').set({ id: 'x3', userId: 'g1', deletedAt: new Date() });
      await firestore.collection('cover_letters').doc('l1').set({ id: 'l1', userId: 'g1', deletedAt: null });
      expect(await service.getUsageSummary('g1')).toMatchObject({
        cvsCreated: 9,
        coverLettersCreated: 2,
        aiCreditsUsed: 4,
        aiCreditsLimit: 20,
        storedCvs: 2,
        storedCoverLetters: 1,
        analysesUsed: 1,
        analysesLimit: 15,
      });
    });

    it('legacy plans report analysesLimit null and their raw counters unchanged', async () => {
      await seed('g2', {
        subscription: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null },
        usage: { cvsCreated: 3, aiCreditsUsed: 50, aiCreditsLimit: 100, exportsThisMonth: 7 },
      });
      expect(await service.getUsageSummary('g2')).toMatchObject({
        cvsCreated: 3,
        aiCreditsUsed: 50,
        exportsThisMonth: 7,
        storedCvs: 0,
        analysesUsed: 0,
        analysesLimit: null,
      });
    });
  });

  describe('tracked applications and plan info', () => {
    it.each([
      [SubscriptionPlan.FREE, 25],
      [SubscriptionPlan.STARTER, 100],
      [SubscriptionPlan.PROFESSIONAL, 500],
      [SubscriptionPlan.CAREER_PRO, 2000],
      [SubscriptionPlan.BUSINESS, 500],
      [SubscriptionPlan.PRO, null],
      [SubscriptionPlan.CAREER_ACCELERATOR, null],
      [SubscriptionPlan.ENTERPRISE, null],
    ])('%s → tracked-application limit %s', async (plan, limit) => {
      await seed('t-' + plan, { subscription: { plan, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null }, usage: {} });
      expect(await service.trackedApplicationLimit('t-' + plan)).toBe(limit);
    });

    it('plan info: Free exposes removeBranding=false, capacity counts stored documents', async () => {
      await seed('i1', {
        createdAt: ago(3),
        subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE },
        usage: { cvsCreated: 4, aiCreditsUsed: 1, aiCreditsLimit: 5, lastExportReset: ago(3) },
      });
      await firestore.collection('cvs').doc('c1').set({ id: 'c1', userId: 'i1', deletedAt: null });
      await firestore.collection('cvs').doc('c2').set({ id: 'c2', userId: 'i1', deletedAt: new Date() });
      const info = await service.getPlanInfo('i1');
      expect(info).toMatchObject({
        plan: SubscriptionPlan.FREE,
        legacy: false,
        entitlements: { docxExport: false, removeBranding: false },
        usage: {
          cvs: { used: 1, limit: 1, counts: 'stored' },
          aiCredits: { used: 1, limit: 3 },
          analyses: { used: 0, limit: 3 },
          exports: { limit: 'unlimited' },
        },
      });
      expect(info.renewsAt).not.toBeNull();
    });

    it('plan info: legacy Pro keeps creation counting and no analyses allowance', async () => {
      await seed('i2', {
        subscription: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null },
        usage: { cvsCreated: 4, aiCreditsUsed: 10, aiCreditsLimit: 100 },
      });
      const info = await service.getPlanInfo('i2');
      expect(info).toMatchObject({
        plan: SubscriptionPlan.PRO,
        legacy: true,
        entitlements: { docxExport: true, removeBranding: true },
        usage: { cvs: { used: 4, limit: 10, counts: 'created' }, analyses: null },
        renewsAt: null,
      });
    });
  });
});
