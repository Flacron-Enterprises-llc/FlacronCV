import { Platform, type AlertButton } from 'react-native';
import { hasKey, t } from '../i18n';
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
    return [{ text: t('common.ok') }];
  }
  return [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('subscription.limits.upgrade'), onPress: onUpgrade },
  ];
}

function formatLimit(limit: number | 'unlimited'): string {
  return limit === 'unlimited' ? t('subscription.limits.unlimited') : String(limit);
}

/** Plan name for copy: the translated name when there is one, else the capitalised id. */
function planLabel(plan: string): string {
  const key = `settings.plans.${plan}`;
  return hasKey(key) ? t(key) : plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function cvLimitReachedMessage(plan: SubscriptionPlan): string {
  const fact = t('subscription.limits.cvLimit', {
    plan,
    limit: formatLimit(PLAN_CONFIGS[plan].limits.cvs),
  });
  return PAID_UPGRADES_ENABLED ? [fact, t('subscription.limits.cvUpgrade')].join(' ') : fact;
}

export function coverLetterLimitReachedMessage(plan: SubscriptionPlan): string {
  if (PAID_UPGRADES_ENABLED) {
    return t('subscription.limits.coverLetterUpgrade');
  }
  return t('subscription.limits.coverLetterLimit', {
    plan,
    limit: formatLimit(PLAN_CONFIGS[plan].limits.coverLetters),
  });
}

export function exportLimitReachedMessage(): string {
  if (PAID_UPGRADES_ENABLED) {
    return t('subscription.limits.exportUpgrade');
  }
  const limit = PLAN_CONFIGS[SubscriptionPlan.FREE].limits.exports;
  return t('subscription.limits.exportLimit', { limit: formatLimit(limit) });
}

export function aiCreditsExhaustedMessage(variant: 'summary' | 'coverLetter' | 'summaryHttp'): string {
  if (PAID_UPGRADES_ENABLED) {
    if (variant === 'coverLetter') return t('subscription.limits.creditsUpgradeCoverLetter');
    if (variant === 'summaryHttp') return t('subscription.limits.creditsUpgradeHttp');
    return t('subscription.limits.creditsUpgrade');
  }
  return t('subscription.limits.creditsExhausted');
}

export function lockedTemplateTitle(requiredTier?: string): string {
  if (PAID_UPGRADES_ENABLED) return t('subscription.upgradeModal.upgradeRequired');
  if (requiredTier) {
    return t('subscription.limits.templateTitle', { tier: planLabel(requiredTier) });
  }
  return t('subscription.limits.templateUnavailable');
}

export function lockedTemplateMessage(
  templateName: string,
  requiredTier: string,
  currentPlan: SubscriptionPlan = SubscriptionPlan.FREE,
): string {
  if (PAID_UPGRADES_ENABLED) {
    return t('subscription.limits.templateRequires', { name: templateName, tier: requiredTier });
  }
  return t('subscription.limits.templateIncluded', {
    name: templateName,
    tier: planLabel(requiredTier),
    planLabel: planLabel(currentPlan),
    plan: currentPlan,
  });
}
