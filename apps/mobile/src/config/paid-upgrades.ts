import { Platform, type AlertButton } from 'react-native';
import { SubscriptionPlan } from '../types/enums';
import { PLAN_CONFIGS } from '../types/subscription.types';

/**
 * S1 — single switch for every paid-upgrade / Stripe Checkout path in this app.
 *
 * Mechanism: build-time `EXPO_PUBLIC_*` override, else a per-platform default.
 * `Platform.OS` is evaluated on device, so one JS bundle can be off on iOS and
 * on on Android. This is not remote config — flipping it after App Review by
 * fetching a server flag would be a guideline problem.
 *
 * Defaults are OFF on every platform (no paid upgrade in the app to start).
 * Set `android: true` below when Play Store Stripe-in-browser is wanted; leave
 * `ios: false` until IAP exists (Apple 3.1.1).
 *
 * `EXPO_PUBLIC_PAID_UPGRADES_ENABLED=true|false` overrides the platform default
 * (rollback / local QA). Do not ship an iOS App Store binary with `true`.
 */
function envOverride(): boolean | undefined {
  const raw = process.env.EXPO_PUBLIC_PAID_UPGRADES_ENABLED?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return undefined;
}

const DEFAULT_BY_PLATFORM: Record<string, boolean> = {
  ios: false,
  android: false,
  web: false,
};

export const PAID_UPGRADES_ENABLED: boolean =
  envOverride() ?? DEFAULT_BY_PLATFORM[Platform.OS] ?? false;

export function upgradeAlertButtons(onUpgrade: () => void): AlertButton[] {
  if (!PAID_UPGRADES_ENABLED) {
    return [{ text: 'OK' }];
  }
  return [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Upgrade', onPress: onUpgrade },
  ];
}

function formatLimit(limit: number | 'unlimited'): string {
  return limit === 'unlimited' ? 'unlimited' : String(limit);
}

export function cvLimitReachedMessage(plan: SubscriptionPlan): string {
  const fact = `Your ${plan} plan allows up to ${formatLimit(PLAN_CONFIGS[plan].limits.cvs)} CVs.`;
  return PAID_UPGRADES_ENABLED ? `${fact} Upgrade to create more.` : fact;
}

export function coverLetterLimitReachedMessage(plan: SubscriptionPlan): string {
  if (PAID_UPGRADES_ENABLED) {
    return 'Upgrade your plan to create more cover letters.';
  }
  return `Your ${plan} plan allows up to ${formatLimit(PLAN_CONFIGS[plan].limits.coverLetters)} cover letters.`;
}

export function exportLimitReachedMessage(): string {
  if (PAID_UPGRADES_ENABLED) {
    return 'You have reached your monthly export limit. Upgrade to Pro for unlimited exports.';
  }
  const limit = PLAN_CONFIGS[SubscriptionPlan.FREE].limits.exports;
  return `You have reached your monthly export limit (${formatLimit(limit)}).`;
}

export function aiCreditsExhaustedMessage(variant: 'summary' | 'coverLetter' | 'summaryHttp'): string {
  if (PAID_UPGRADES_ENABLED) {
    if (variant === 'coverLetter') return 'Upgrade to get more Engine credits.';
    if (variant === 'summaryHttp') return 'You are out of Engine credits. Upgrade your plan to get more.';
    return 'Upgrade your plan to get more Engine credits.';
  }
  return 'You have used all Engine credits for this month.';
}

export function lockedTemplateTitle(): string {
  return PAID_UPGRADES_ENABLED ? 'Upgrade Required' : 'Template unavailable';
}

export function lockedTemplateMessage(templateName: string, tier: string): string {
  if (PAID_UPGRADES_ENABLED) {
    return `The ${templateName} template requires a ${tier} plan.`;
  }
  return `The ${templateName} template is not included in your current plan.`;
}
