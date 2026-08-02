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
      db.collection('support_tickets').where('status', '==', 'open').count().get(),
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

  async getRevenueAnalytics() {
    const db = this.firebaseAdmin.firestore;
    const [snapshot, activeUsers] = await Promise.all([
      db.collection('subscriptions').where('status', '==', 'active').get(),
      db.collection('users').where('isActive', '==', true).count().get(),
    ]);

    let monthlyRevenue = 0;
    const planBreakdown: Record<string, number> = {};

    snapshot.docs.forEach((doc: any) => {
      const sub = doc.data();
      const amount = sub.amount / 100;
      const monthly = sub.interval === 'year' ? amount / 12 : amount;
      monthlyRevenue += monthly;
      planBreakdown[sub.plan] = (planBreakdown[sub.plan] || 0) + 1;
    });

    // Free users never get a `subscriptions` doc, so planBreakdown.free would
    // always be 0. Derive it from the active-user total minus everyone on a paid
    // plan so the admin "Free Plan" stat reflects reality.
    const paidUsers =
      (planBreakdown.pro || 0) +
      (planBreakdown.career_accelerator || 0) +
      (planBreakdown.enterprise || 0);
    planBreakdown.free = Math.max(0, activeUsers.data().count - paidUsers);

    return {
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
      activeSubscriptions: snapshot.size,
      planBreakdown,
    };
  }
}
