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

export type AppTourStatus = 'unseen' | 'in_progress' | 'skipped' | 'completed';

/** Product-tour progress (shared-types AppTourPreference). */
export interface AppTourPreference {
  version: number;
  status: AppTourStatus;
  /** Step to resume while `in_progress`. Null otherwise. */
  stepId: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  updatedAt: string | null;
}

export interface UserPreferences {
  language: Locale;
  theme: Theme;
  emailNotifications: boolean;
  marketingEmails: boolean;
  defaultCVTemplate?: string;
  pushNotifications?: boolean;
  /** Website tour. Read-only for the app — mobile never writes it. */
  appTour?: AppTourPreference;
  /** Mobile tour (src/lib/app-tour.ts). Omitted on accounts created before it shipped. */
  mobileAppTour?: AppTourPreference;
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
