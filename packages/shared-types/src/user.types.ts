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
  /**
   * Never cleared. Defence-in-depth alongside the Stripe subscription-history
   * check — not a replacement for it. Existing accounts may omit this field
   * (treated as false). No production backfill.
   */
  hasUsedTrial?: boolean;
}

export type RiskBand = 'allow' | 'verify' | 'deny';

export type AbuseGrantStatus = 'eligible' | 'pending_step_up' | 'blocked' | 'granted';

export type RiskSignalCode =
  | 'identity_received_free'
  | 'device_received_free'
  | 'multiple_accounts_device'
  | 'network_burst'
  | 'disposable_email'
  | 'bot_activity'
  | 'vpn_datacenter'
  | 'repeat_create_delete';

/**
 * Abuse-prevention snapshot on the user doc. Hashes only — never a raw IP or
 * device token. Optional so accounts created before Batch G stay valid.
 */
export interface UserAbuse {
  deviceHash: string | null;
  ipHash: string | null;
  networkHash: string | null;
  riskScore: number;
  riskBand: RiskBand;
  riskSignals: RiskSignalCode[];
  scoredAt: Date;
  /**
   * Free-grant state. Omitted while enforcement is off and on accounts
   * scored before part 2. Missing is treated as eligible (grandfather).
   */
  grantStatus?: AbuseGrantStatus;
  /** When `pending_step_up`, the grant becomes eligible at this instant. */
  cooldownEndsAt?: Date | null;
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
  /** Present after a scored registration. Omitted on older accounts. */
  abuse?: UserAbuse | null;
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
