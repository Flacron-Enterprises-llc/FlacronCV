import { Locale, SubscriptionPlan, SubscriptionStatus, Theme, UserRole } from './enums';

export interface UserProfile {
  firstName: string;
  lastName: string;
  headline?: string;
  bio?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
}

export interface UserPreferences {
  language: Locale;
  theme: Theme;
  emailNotifications: boolean;
  marketingEmails: boolean;
  defaultCVTemplate?: string;
  pushNotifications?: boolean;
}

export interface UserSubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Omitted on Stripe-only docs. */
  provider?: 'stripe' | 'apple' | 'google';
  originalTransactionId?: string | null;
  purchaseToken?: string | null;
}

export interface UserUsage {
  cvsCreated: number;
  coverLettersCreated: number;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  exportsThisMonth: number;
  lastExportReset: string;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  phoneNumber: string | null;
  profile: UserProfile;
  preferences: UserPreferences;
  subscription: UserSubscription;
  usage: UserUsage;
  pushTokens?: string[];
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
  isActive: boolean;
  deletedAt: string | null;
}

/** PUT /users/me — Nest UpdateUserDto. Not Partial<User> (uid/email/subscription would 400). */
export interface UpdateUserPayload {
  displayName?: string;
  photoURL?: string | null;
  profile?: Partial<UserProfile>;
  preferences?: Partial<UserPreferences>;
}
