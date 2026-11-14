import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';

@Injectable()
export class AdminService {
  constructor(private firebaseAdmin: FirebaseAdminService) {}

  async getStats() {
    const db = this.firebaseAdmin.firestore;

    const [usersCount, cvsCount, coverLettersCount, ticketsCount] = await Promise.all([
      db.collection('users').where('isActive', '==', true).count().get(),
      db.collection('cvs').where('deletedAt', '==', null).count().get(),
      db.collection('cover_letters').where('deletedAt', '==', null).count().get(),
      // "Open" = still needs attention: everything that is not resolved or closed.
      db
        .collection('support_tickets')
        .where('status', 'in', ['open', 'in_progress', 'waiting_on_customer'])
        .count()
        .get(),
    ]);

    const proUsers = await db
      .collection('users')
      .where('subscription.plan', '==', 'pro')
      .count()
      .get();

    const enterpriseUsers = await db
      .collection('users')
      .where('subscription.plan', '==', 'enterprise')
      .count()
      .get();

    // Fields consumed by the admin dashboard (activeSubscriptions / revenue /
    // recentUsers). Revenue + activeSubscriptions reuse getRevenueAnalytics() so
    // the dashboard stays consistent with the revenue view; recentUsers reuses
    // listUsers()'s isActive+createdAt-desc query (existing composite index).
    const [revenue, recentSnap] = await Promise.all([
      this.getRevenueAnalytics(),
      db
        .collection('users')
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get(),
    ]);

    const recentUsers = recentSnap.docs.map((doc: any) => {
      const u = doc.data();
      const created = u.createdAt?.toDate?.() ?? u.createdAt;
      return {
        id: u.uid ?? doc.id,
        displayName: u.displayName ?? '',
        email: u.email ?? '',
        role: u.role ?? 'user',
        createdAt: created ? new Date(created).toISOString() : null,
      };
    });

    return {
      totalUsers: usersCount.data().count,
      totalCVs: cvsCount.data().count,
      totalCoverLetters: coverLettersCount.data().count,
      openTickets: ticketsCount.data().count,
      proSubscribers: proUsers.data().count,
      enterpriseSubscribers: enterpriseUsers.data().count,
      activeSubscriptions: revenue.activeSubscriptions,
      revenue: revenue.monthlyRevenue,
      recentUsers,
    };
  }

  async getAuditLogs(page = 1, limit = 50, action?: string) {
    // Fetch a bounded window ordered by createdAt, then filter/paginate in
    // memory. This keeps the `action` filter working without a composite index
    // (mirrors CRMAuditService.list) and yields a correct filtered total.
    const snapshot = await this.firebaseAdmin.firestore
      .collection('audit_logs')
      .orderBy('createdAt', 'desc')
      .limit(2000)
      .get();

    let logs = snapshot.docs.map((doc: any) => doc.data());
    if (action) logs = logs.filter((l: any) => l.action === action);

    const total = logs.length;
    const start = (page - 1) * limit;
    return {
      logs: logs.slice(start, start + limit),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Plan breakdown and revenue for the admin overview and Subscriptions page.
   *
   * The plan a user is on lives on `users/{uid}.subscription.plan`. Stripe's
   * `subscriptions` collection only covers people paying through Stripe, so
   * plans granted by an operator (CRM "Change plan"), Apple/Google purchases and
   * comped accounts never appear there; counting only that collection showed
   * "Pro 0 / Active 0" while several users were on Pro. Counts now come from the
   * users themselves; revenue still comes from the Stripe records, and the number
   * of those is reported separately as `payingSubscriptions`.
   */
  async getRevenueAnalytics() {
    const db = this.firebaseAdmin.firestore;
    const [snapshot, usersSnap] = await Promise.all([
      db.collection('subscriptions').where('status', '==', 'active').get(),
      db.collection('users').where('isActive', '==', true).select('subscription').get(),
    ]);

    let monthlyRevenue = 0;
    snapshot.docs.forEach((doc: any) => {
      const sub = doc.data();
      const amount = (Number(sub.amount) || 0) / 100;
      monthlyRevenue += sub.interval === 'year' ? amount / 12 : amount;
    });

    const planBreakdown: Record<string, number> = { free: 0, pro: 0, career_accelerator: 0, enterprise: 0 };
    usersSnap.docs.forEach((doc: any) => {
      const plan = (doc.data()?.subscription?.plan as string | undefined) ?? 'free';
      planBreakdown[plan] = (planBreakdown[plan] || 0) + 1;
    });
    const activeSubscriptions = Object.entries(planBreakdown)
      .filter(([plan]) => plan !== 'free')
      .reduce((sum, [, count]) => sum + count, 0);

    return {
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
      /** Users on any paid plan, however they got it. */
      activeSubscriptions,
      /** Active Stripe subscriptions (the ones that produce monthlyRevenue). */
      payingSubscriptions: snapshot.size,
      planBreakdown,
    };
  }
}
