import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import {
  User,
  CreateUserData,
  UpdateUserData,
  UserRole,
  SubscriptionPlan,
  SubscriptionStatus,
  Locale,
  Theme,
} from '@flacroncv/shared-types';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly collection = 'users';

  constructor(private firebaseAdmin: FirebaseAdminService) {}

  async create(data: CreateUserData): Promise<User> {
    const now = new Date();
    const user: User = {
      uid: data.uid,
      email: data.email,
      displayName: data.displayName,
      photoURL: data.photoURL || null,
      phoneNumber: null,
      profile: {
        firstName: data.displayName?.split(' ')[0] || '',
        lastName: data.displayName?.split(' ').slice(1).join(' ') || '',
        headline: '',
        bio: '',
        location: '',
        website: '',
        linkedin: '',
        github: '',
      },
      preferences: {
        language: Locale.EN,
        theme: Theme.SYSTEM,
        emailNotifications: true,
        marketingEmails: false,
        defaultCVTemplate: 'modern',
      },
      subscription: {
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      usage: {
        cvsCreated: 0,
        coverLettersCreated: 0,
        aiCreditsUsed: 0,
        aiCreditsLimit: 5,
        exportsThisMonth: 0,
        lastExportReset: now,
      },
      role: UserRole.USER,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      isActive: true,
      deletedAt: null,
    };

    await this.firebaseAdmin.firestore.collection(this.collection).doc(data.uid).set(user);
    return user;
  }

  async findById(uid: string): Promise<User | null> {
    const doc = await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).get();
    if (!doc.exists) return null;
    return doc.data() as User;
  }

  async findByIdOrThrow(uid: string): Promise<User> {
    const user = await this.findById(uid);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(uid: string, data: UpdateUserData): Promise<User> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.displayName) updateData.displayName = data.displayName;
    if (data.photoURL !== undefined) updateData.photoURL = data.photoURL;
    if (data.profile) {
      Object.entries(data.profile).forEach(([key, value]) => {
        updateData[`profile.${key}`] = value;
      });

      // Keep top-level displayName in sync when name parts change
      if (data.profile.firstName !== undefined || data.profile.lastName !== undefined) {
        const current = await this.findByIdOrThrow(uid);
        const firstName = data.profile.firstName ?? current.profile?.firstName ?? '';
        const lastName = data.profile.lastName ?? current.profile?.lastName ?? '';
        updateData.displayName = `${firstName} ${lastName}`.trim();
      }
    }
    if (data.preferences) {
      Object.entries(data.preferences).forEach(([key, value]) => {
        updateData[`preferences.${key}`] = value;
      });
    }

    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update(updateData);
    return this.findByIdOrThrow(uid);
  }

  async updateLastLogin(uid: string): Promise<void> {
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update({
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateRole(uid: string, role: UserRole): Promise<void> {
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update({
      role,
      updatedAt: new Date(),
    });
  }

  async updateSubscription(uid: string, subscription: Partial<User['subscription']>): Promise<void> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    Object.entries(subscription).forEach(([key, value]) => {
      updateData[`subscription.${key}`] = value;
    });
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update(updateData);
  }

  async updateUsage(uid: string, usage: Partial<User['usage']>): Promise<void> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    Object.entries(usage).forEach(([key, value]) => {
      updateData[`usage.${key}`] = value;
    });
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update(updateData);
  }

  async incrementUsage(uid: string, field: keyof User['usage'], amount = 1): Promise<void> {
    const user = await this.findByIdOrThrow(uid);
    const currentValue = (user.usage[field] as number) || 0;
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update({
      [`usage.${field}`]: currentValue + amount,
      updatedAt: new Date(),
    });
  }

  async softDelete(uid: string): Promise<void> {
    await this.firebaseAdmin.firestore.collection(this.collection).doc(uid).update({
      isActive: false,
      deletedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async listUsers(page = 1, limit = 20, filters?: { role?: string; plan?: string; search?: string }) {
    let query: FirebaseFirestore.Query = this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('isActive', '==', true);

    if (filters?.role) {
      query = query.where('role', '==', filters.role);
    }
    if (filters?.plan) {
      query = query.where('subscription.plan', '==', filters.plan);
    }

    query = query.orderBy('createdAt', 'desc').limit(limit).offset((page - 1) * limit);

    const snapshot = await query.get();
    const items = snapshot.docs.map((doc) => doc.data() as User);

    const countSnapshot = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('isActive', '==', true)
      .count()
      .get();
    const total = countSnapshot.data().count;

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }
}
