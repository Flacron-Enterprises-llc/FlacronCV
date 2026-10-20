import { UserRole, SubscriptionPlan, SubscriptionStatus, BillingProvider, Locale, Theme } from './enums';

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

/**
 * Product-tour progress stored on the account. Missing entirely on accounts
 * created before the tour shipped — that absence is intentional and must not
 * be treated as "unseen". No production backfill.
 *
 * A later `version` must not restart the tour for anyone who already
 * completed or skipped it.
 */
export const APP_TOUR_VERSION = 1;

export type AppTourStatus = 'unseen' | 'in_progress' | 'skipped' | 'completed';

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
  defaultCVTemplate: string;
  /**
   * Remote push opt-in. Missing on accounts created before push plumbing
   * (treated as false). Enforced server-side — a client toggle is UX only.
   */
  pushNotifications?: boolean;
  /**
   * Interactive app tour. Set to `unseen` only when the account is created.
   * Omitted on older accounts.
   */
  appTour?: AppTourPreference;
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
  /**
   * Who bills this plan. Existing docs omit it — resolveBillingProvider
   * returns Stripe. No production backfill; Stripe handlers do not write this
   * until IAP verify is live.
   */
  provider?: BillingProvider;
  /** Apple StoreKit 2 original transaction id. Omit for Stripe. */
  originalTransactionId?: string | null;
  /** Google Play purchase token. Omit for Stripe. */
  purchaseToken?: string | null;
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
  /**
   * Expo push tokens for this account's devices. Missing on older accounts
   * (treated as []). Capped server-side. Not a subcollection — lives on the
   * user document.
   */
  pushTokens?: string[];
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
