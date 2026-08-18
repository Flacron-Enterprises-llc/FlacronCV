import { BillingInterval, SubscriptionPlan, SubscriptionStatus } from './enums';

export interface PlanLimits {
  cvs: number | 'unlimited';
  coverLetters: number | 'unlimited';
  aiCredits: number | 'unlimited';
  templates: 'free_only' | 'all';
  exports: number | 'unlimited';
}

export interface PlanConfig {
  plan: SubscriptionPlan;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  limits: PlanLimits;
  features: string[];
}

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  [SubscriptionPlan.FREE]: {
    plan: SubscriptionPlan.FREE,
    priceMonthly: 0,
    priceYearly: 0,
    limits: {
      cvs: 5,
      coverLetters: 1,
      aiCredits: 5,
      templates: 'free_only',
      exports: 2,
    },
    features: [
      '5 CVs',
      '1 Cover Letter',
      '5 AI Credits/month',
      '2 PDF Exports/month',
      'Free templates only',
    ],
  },
  [SubscriptionPlan.PRO]: {
    plan: SubscriptionPlan.PRO,
    priceMonthly: 29.99,
    priceYearly: 239.88,
    stripePriceIdMonthly: 'price_1T1LzDAWDS7HwRCx1DxhqRq1',
    stripePriceIdYearly: 'price_1T1M3YAWDS7HwRCx11Tl15x4',
    limits: {
      cvs: 10,
      coverLetters: 20,
      aiCredits: 100,
      templates: 'all',
      exports: 'unlimited',
    },
    features: [
      '10 CVs',
      '20 Cover Letters',
      '100 AI Credits/month',
      'Unlimited PDF Exports',
      'All templates',
      'No watermark',
      'Priority support',
    ],
  },
  [SubscriptionPlan.ENTERPRISE]: {
    plan: SubscriptionPlan.ENTERPRISE,
    priceMonthly: 99.99,
    priceYearly: 799.88,
    stripePriceIdMonthly: 'price_1T1LziAWDS7HwRCxozxuJtnx',
    stripePriceIdYearly: 'price_1T1M49AWDS7HwRCxFxY8ZR5y',
    limits: {
      cvs: 'unlimited',
      coverLetters: 'unlimited',
      aiCredits: 500,
      templates: 'all',
      exports: 'unlimited',
    },
    features: [
      'Unlimited CVs',
      'Unlimited Cover Letters',
      '500 AI Credits/month',
      'Unlimited PDF Exports',
      'All templates',
      'No watermark',
      'Dedicated support',
      'Priority AI processing',
    ],
  },
};

export interface Subscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  plan: SubscriptionPlan;
  priceId: string;
  interval: BillingInterval;
  amount: number;
  currency: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAt: string | null;
  canceledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
}
