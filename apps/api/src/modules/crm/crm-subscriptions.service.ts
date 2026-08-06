import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { CRMAuditService } from './crm-audit.service';
import { CRMSubscriptionRecord, CRMSubscriptionListParams } from '@flacroncv/shared-types';
import Stripe from 'stripe';

@Injectable()
export class CRMSubscriptionsService {
  private readonly logger = new Logger(CRMSubscriptionsService.name);
  private readonly subCol = 'subscriptions';
  private readonly userCol = 'users';
  private stripe!: Stripe;

  constructor(
    private firebase: FirebaseAdminService,
    private config: ConfigService,
    private audit: CRMAuditService,
  ) {
    const secretKey = this.config.get<string>('stripe.secretKey');
    if (secretKey) {
      this.stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' as any });
    }
  }

  async listSubscriptions(params: CRMSubscriptionListParams): Promise<{
    items: CRMSubscriptionRecord[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 25, 100);

    let query: FirebaseFirestore.Query = this.firebase.firestore.collection(this.subCol);

    if (params.plan) query = query.where('plan', '==', params.plan);
    if (params.status) query = query.where('status', '==', params.status);
    if (params.userId) query = query.where('userId', '==', params.userId);

    query = query.orderBy('createdAt', 'desc').limit(2000);
    const snapshot = await query.get();

    let records = snapshot.docs.map((d) => d.data() as Record<string, any>);

    if (params.startDate) {
      const from = new Date(params.startDate);
      records = records.filter((r) => new Date(r.createdAt?.toDate?.() ?? r.createdAt) >= from);
    }
    if (params.endDate) {
      const to = new Date(params.endDate);
      records = records.filter((r) => new Date(r.createdAt?.toDate?.() ?? r.createdAt) <= to);
    }

    // Enrich with user display info
    const userIds = [...new Set(records.map((r) => r.userId as string))];
    const userMap = await this.fetchUserMap(userIds);

    const enriched: CRMSubscriptionRecord[] = records.map((r) => {
      const u = userMap[r.userId] ?? {};
      return {
        id: r.id,
        userId: r.userId,
        userEmail: u.email ?? '',
        userDisplayName: u.displayName ?? '',
        stripeCustomerId: r.stripeCustomerId,
        plan: r.plan,
        priceId: r.priceId,
        interval: r.interval,
        amount: r.amount,
        currency: r.currency ?? 'usd',
        status: r.status,
        currentPeriodStart: r.currentPeriodStart?.toDate?.() ?? new Date(r.currentPeriodStart),
        currentPeriodEnd: r.currentPeriodEnd?.toDate?.() ?? new Date(r.currentPeriodEnd),
        cancelAt: r.cancelAt ? (r.cancelAt?.toDate?.() ?? new Date(r.cancelAt)) : null,
        canceledAt: r.canceledAt ? (r.canceledAt?.toDate?.() ?? new Date(r.canceledAt)) : null,
        cancelAtPeriodEnd: r.cancelAtPeriodEnd ?? false,
        createdAt: r.createdAt?.toDate?.() ?? new Date(r.createdAt),
        updatedAt: r.updatedAt?.toDate?.() ?? new Date(r.updatedAt),
      };
    });

    const total = enriched.length;
    const pages = Math.ceil(total / limit);
    const items = enriched.slice((page - 1) * limit, page * limit);

    return { items, total, page, limit, pages };
  }

  async getSubscriptionById(id: string): Promise<CRMSubscriptionRecord> {
    const doc = await this.firebase.firestore.collection(this.subCol).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Subscription not found');

    const r = doc.data() as Record<string, any>;
    const userMap = await this.fetchUserMap([r.userId]);
    const u = userMap[r.userId] ?? {};

    return {
      id: r.id,
      userId: r.userId,
      userEmail: u.email ?? '',
      userDisplayName: u.displayName ?? '',
      stripeCustomerId: r.stripeCustomerId,
      plan: r.plan,
      priceId: r.priceId,
      interval: r.interval,
      amount: r.amount,
      currency: r.currency ?? 'usd',
      status: r.status,
      currentPeriodStart: r.currentPeriodStart?.toDate?.() ?? new Date(r.currentPeriodStart),
      currentPeriodEnd: r.currentPeriodEnd?.toDate?.() ?? new Date(r.currentPeriodEnd),
      cancelAt: r.cancelAt ? (r.cancelAt?.toDate?.() ?? new Date(r.cancelAt)) : null,
      canceledAt: r.canceledAt ? (r.canceledAt?.toDate?.() ?? new Date(r.canceledAt)) : null,
      cancelAtPeriodEnd: r.cancelAtPeriodEnd ?? false,
      createdAt: r.createdAt?.toDate?.() ?? new Date(r.createdAt),
      updatedAt: r.updatedAt?.toDate?.() ?? new Date(r.updatedAt),
    };
  }

  async cancelSubscription(
    subscriptionId: string,
    actorId: string,
    actorEmail: string,
  ): Promise<CRMSubscriptionRecord> {
    const sub = await this.getSubscriptionById(subscriptionId);

    if (sub.status === 'canceled') {
      throw new BadRequestException('Subscription is already canceled');
    }

    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured on this server');
    }

    await this.stripe.subscriptions.cancel(subscriptionId);
    this.logger.log(`Admin canceled subscription ${subscriptionId} for user ${sub.userId}`);

    // Reflect the cancellation on the local record immediately so the row this
    // method returns (and the list view) shows "canceled" right away, instead of
    // the stale "active" it held until the async customer.subscription.deleted
    // webhook arrived (which also re-confirms these same fields).
    await this.firebase.firestore.collection(this.subCol).doc(subscriptionId).set(
      {
        status: 'canceled',
        canceledAt: new Date(),
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    await this.audit.log({
      actorId,
      actorEmail,
      action: 'SUBSCRIPTION_CANCELED',
      targetType: 'subscription',
      targetId: subscriptionId,
      targetName: sub.userEmail,
      details: { plan: sub.plan, userId: sub.userId },
    });

    return this.getSubscriptionById(subscriptionId);
  }

  async getAllForExport(): Promise<CRMSubscriptionRecord[]> {
    const result = await this.listSubscriptions({ page: 1, limit: 10000 });
    return result.items;
  }

  private async fetchUserMap(
    userIds: string[],
  ): Promise<Record<string, { email: string; displayName: string }>> {
    if (userIds.length === 0) return {};
    const chunks: string[][] = [];
    for (let i = 0; i < userIds.length; i += 10) {
      chunks.push(userIds.slice(i, i + 10));
    }
    const map: Record<string, { email: string; displayName: string }> = {};
    for (const chunk of chunks) {
      const snaps = await Promise.all(
        chunk.map((uid) => this.firebase.firestore.collection(this.userCol).doc(uid).get()),
      );
      for (const snap of snaps) {
        if (snap.exists) {
          const d = snap.data() as Record<string, any>;
          map[snap.id] = { email: d.email ?? '', displayName: d.displayName ?? '' };
        }
      }
    }
    return map;
  }
}
