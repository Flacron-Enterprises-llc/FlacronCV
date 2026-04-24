import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import {
  PlatformAnalyticsOverview,
  PlatformUserGrowthDataPoint,
  PlatformUsageDataPoint,
  PlatformTopTemplate,
  User,
} from '@flacroncv/shared-types';

@Injectable()
export class CRMPlatformService {
  constructor(private firebase: FirebaseAdminService) {}

  async getOverview(): Promise<PlatformAnalyticsOverview> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [usersSnap, cvsSnap, coverLettersSnap] = await Promise.all([
      this.firebase.firestore.collection('users').get(),
      this.firebase.firestore.collection('cvs').get(),
      this.firebase.firestore.collection('cover_letters').get(),
    ]);

    const users: User[] = usersSnap.docs.map((d: any) => d.data() as User);
    const cvs: any[] = cvsSnap.docs.map((d: any) => d.data());
    const coverLetters: any[] = coverLettersSnap.docs.map((d: any) => d.data());

    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.isActive !== false).length;

    const newUsersThisMonth = users.filter(
      (u) => new Date(u.createdAt) >= startOfMonth,
    ).length;

    const newUsersLastMonth = users.filter((u) => {
      const d = new Date(u.createdAt);
      return d >= startOfLastMonth && d <= endOfLastMonth;
    }).length;

    const usersByPlan = {
      free: users.filter((u) => u.subscription?.plan === 'free').length,
      pro: users.filter((u) => u.subscription?.plan === 'pro').length,
      enterprise: users.filter((u) => u.subscription?.plan === 'enterprise').length,
    };

    const totalCVs = cvs.length;
    const totalCoverLetters = coverLetters.length;

    const cvsThisMonth = cvs.filter(
      (cv) => cv.createdAt && new Date(cv.createdAt) >= startOfMonth,
    ).length;

    const coverLettersThisMonth = coverLetters.filter(
      (cl) => cl.createdAt && new Date(cl.createdAt) >= startOfMonth,
    ).length;

    const cvsLastMonth = cvs.filter((cv) => {
      if (!cv.createdAt) return false;
      const d = new Date(cv.createdAt);
      return d >= startOfLastMonth && d <= endOfLastMonth;
    }).length;

    const coverLettersLastMonth = coverLetters.filter((cl) => {
      if (!cl.createdAt) return false;
      const d = new Date(cl.createdAt);
      return d >= startOfLastMonth && d <= endOfLastMonth;
    }).length;

    const pctChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100 * 10) / 10;
    };

    return {
      totalUsers,
      activeUsers,
      newUsersThisMonth,
      usersByPlan,
      totalCVs,
      totalCoverLetters,
      cvsThisMonth,
      coverLettersThisMonth,
      avgCVsPerUser: totalUsers > 0 ? Math.round((totalCVs / totalUsers) * 10) / 10 : 0,
      avgCoverLettersPerUser: totalUsers > 0 ? Math.round((totalCoverLetters / totalUsers) * 10) / 10 : 0,
      thisMonthVsLastMonth: {
        users: pctChange(newUsersThisMonth, newUsersLastMonth),
        cvs: pctChange(cvsThisMonth, cvsLastMonth),
        coverLetters: pctChange(coverLettersThisMonth, coverLettersLastMonth),
      },
    };
  }

  async getUserGrowthChart(): Promise<PlatformUserGrowthDataPoint[]> {
    const snapshot = await this.firebase.firestore.collection('users').get();
    const users: User[] = snapshot.docs.map((d: any) => d.data() as User);

    const now = new Date();
    const byMonth = new Map<string, { users: number; activeUsers: number; label: string }>();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      byMonth.set(key, { users: 0, activeUsers: 0, label });
    }

    for (const u of users) {
      const d = new Date(u.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (byMonth.has(key)) {
        byMonth.get(key)!.users += 1;
        if (u.isActive !== false) byMonth.get(key)!.activeUsers += 1;
      }
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ month: v.label, users: v.users, activeUsers: v.activeUsers }));
  }

  async getUsageChart(): Promise<PlatformUsageDataPoint[]> {
    const [cvsSnap, coverLettersSnap] = await Promise.all([
      this.firebase.firestore.collection('cvs').get(),
      this.firebase.firestore.collection('cover_letters').get(),
    ]);

    const cvs: any[] = cvsSnap.docs.map((d: any) => d.data());
    const coverLetters: any[] = coverLettersSnap.docs.map((d: any) => d.data());

    const now = new Date();
    const byMonth = new Map<string, { cvs: number; coverLetters: number; label: string }>();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      byMonth.set(key, { cvs: 0, coverLetters: 0, label });
    }

    for (const cv of cvs) {
      if (!cv.createdAt) continue;
      const d = new Date(cv.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (byMonth.has(key)) byMonth.get(key)!.cvs += 1;
    }

    for (const cl of coverLetters) {
      if (!cl.createdAt) continue;
      const d = new Date(cl.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (byMonth.has(key)) byMonth.get(key)!.coverLetters += 1;
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ month: v.label, cvs: v.cvs, coverLetters: v.coverLetters }));
  }

  async getTopTemplates(): Promise<PlatformTopTemplate[]> {
    const cvsSnap = await this.firebase.firestore.collection('cvs').get();
    const cvs: any[] = cvsSnap.docs.map((d: any) => d.data());

    const counts = new Map<string, number>();
    for (const cv of cvs) {
      const t = cv.templateId ?? cv.template ?? 'unknown';
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }

    const sorted = Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return sorted.map(([templateId, usageCount]) => ({
      templateId,
      name: templateId.charAt(0).toUpperCase() + templateId.slice(1).replace(/-/g, ' '),
      usageCount,
      category: 'cv',
    }));
  }
}
