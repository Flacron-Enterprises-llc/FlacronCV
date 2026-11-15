import { Alert, Platform, type AlertButton } from 'react-native';
import { t } from '../i18n';
import { anyStoreProduct, isStorePlatform, storeProductMap } from '../lib/iap';
import { upgradePrompt, promptForApiError, type UpgradePrompt, type UpgradeReason } from '../lib/upgrade-prompts';

/**
 * S1 — single switch for every paid-upgrade path in this app.
 *
 * The app sells the five-plan catalog (Starter, Professional, Career Pro;
 * monthly and annual) through in-app purchase only — App Store on iOS, Google
 * Play on Android (Apple 3.1.1 / Play Payments policy). This is on exactly
 * when the build carries at least one store product id for this platform
 * (EXPO_PUBLIC_IAP_<PLAN>_<MONTHLY|ANNUAL>_<IOS|ANDROID>, see src/lib/iap.ts);
 * otherwise plan cards say "Coming soon" and limit prompts state the fact
 * with a plain OK — no dead button and never a link to buy on the website.
 *
 * `EXPO_PUBLIC_PAID_UPGRADES_ENABLED=false` still forces it off (rollback /
 * review builds). `true` can no longer force it on without store products.
 *
 * The app no longer starts a Stripe checkout: the legacy Pro / Enterprise
 * plans are not sold to anyone new (PLAN_CONTRACT), and the in-app purchase
 * covers plan purchases on both platforms. The API keeps accepting the old
 * app build's Stripe checkout (legacy-mobile-checkout.ts) until that build is
 * retired.
 */
function envOverride(): boolean | undefined {
  const raw = process.env.EXPO_PUBLIC_PAID_UPGRADES_ENABLED?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return undefined;
}

/** Store product ids this build sells on this platform (empty off-device or when none are configured). */
export const STORE_PRODUCTS = isStorePlatform(Platform.OS) ? storeProductMap(Platform.OS) : {};

export const PAID_UPGRADES_ENABLED: boolean = envOverride() !== false && anyStoreProduct(STORE_PRODUCTS);

/**
 * Legacy Stripe subscribers' "Manage billing" (Stripe customer portal in the
 * browser). Unchanged from before the five-plan catalog: on only when the
 * build sets EXPO_PUBLIC_PAID_UPGRADES_ENABLED=true (Android builds that used
 * it); never on in an iOS App Store build.
 */
export const LEGACY_STRIPE_PORTAL_ENABLED: boolean = envOverride() === true && Platform.OS !== 'ios';

/** "Not now" + "See plans" when the app can sell a plan; a single OK otherwise. */
export function upgradeAlertButtons(onUpgrade: () => void): AlertButton[] {
  if (!PAID_UPGRADES_ENABLED) {
    return [{ text: t('common.ok') }];
  }
  return [
    { text: t('plans.upgrade.notNow'), style: 'cancel' },
    { text: t('plans.upgrade.seePlans'), onPress: onUpgrade },
  ];
}

/** Shows a prompt as an Alert (buttons only when it can lead somewhere). */
export function showUpgradePrompt(prompt: UpgradePrompt, onUpgrade: () => void): void {
  Alert.alert(prompt.title, prompt.message, prompt.upgradeable ? upgradeAlertButtons(onUpgrade) : [{ text: t('common.ok') }]);
}

/** The prompt for a limit on the account's effective plan. */
export function limitPrompt(
  reason: UpgradeReason,
  plan: string | null | undefined,
  extra: { templateName?: string; requiredTier?: string; minimumPlan?: string | null } = {},
): UpgradePrompt {
  return upgradePrompt(reason, { plan, canUpgrade: PAID_UPGRADES_ENABLED, ...extra });
}

/** The prompt for an API refusal (error codes as the website maps them), or null. */
export function promptForError(
  err: unknown,
  plan: string | null | undefined,
  hint?: 'cvs' | 'coverLetters' | 'export' | 'ai',
): UpgradePrompt | null {
  return promptForApiError(err, { plan, canUpgrade: PAID_UPGRADES_ENABLED }, hint);
}

// ─── Message helpers kept for existing callers ───────────────────────────────

export function cvLimitReachedMessage(plan: string): string {
  return limitPrompt('cvs', plan).message;
}

export function coverLetterLimitReachedMessage(plan: string): string {
  return limitPrompt('coverLetters', plan).message;
}

export function exportLimitReachedMessage(plan?: string): string {
  return limitPrompt('exports', plan ?? null).message;
}

export function docxNotIncludedMessage(plan?: string): string {
  return limitPrompt('docx', plan ?? 'free').message;
}

/**
 * Engine credits used up. `variant` is kept for existing callers; the copy is
 * the same fact for every surface, with the upgrade line only when the app can
 * sell a plan. Pass the plan when known (Free renews on the account anniversary).
 */
export function aiCreditsExhaustedMessage(_variant: 'summary' | 'coverLetter' | 'summaryHttp', plan?: string): string {
  // Plan unknown: state the paid-plan fact without naming a plan to upgrade to.
  if (!plan) return upgradePrompt('aiCredits', { plan: 'starter', canUpgrade: false }).message;
  return limitPrompt('aiCredits', plan).message;
}

export function lockedTemplateTitle(_requiredTier?: string): string {
  return t('plans.upgrade.title.templates');
}

export function lockedTemplateMessage(templateName: string, requiredTier: string, currentPlan: string = 'free'): string {
  return limitPrompt('templates', currentPlan, { templateName, requiredTier }).message;
}
