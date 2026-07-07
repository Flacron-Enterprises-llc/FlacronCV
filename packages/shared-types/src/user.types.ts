import { UserRole, SubscriptionPlan, SubscriptionStatus, Locale, Theme } from './enums';

export interface UserProfile {
  firstName: string;
  lastName: string;
  headline: string;
  bio: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
}

export interface UserPreferences {
  language: Locale;
  theme: Theme;
  emailNotifications: boolean;
  marketingEmails: boolean;
  defaultCVTemplate: string;
}

export interface UserSubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface UserUsage {
  cvsCreated: number;
  coverLettersCreated: number;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  exportsThisMonth: number;
  lastExportReset: Date;
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
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
  isActive: boolean;
  deletedAt: Date | null;
}

export interface CreateUserData {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
}

export interface UpdateUserData {
  displayName?: string;
  photoURL?: string | null;
  profile?: Partial<UserProfile>;
  preferences?: Partial<UserPreferences>;
}
