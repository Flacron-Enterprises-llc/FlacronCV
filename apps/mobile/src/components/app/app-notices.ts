/**
 * Pure logic behind the app-wide notices (no React Native / Expo imports —
 * unit-tested under node). Mirrors the website's
 * `components/dashboard/AnnouncementBanner.tsx`, `MaintenanceGate.tsx` and
 * `DunningBanner.tsx`.
 */
import { t } from '../../i18n';
import { SubscriptionStatus, UserRole } from '../../types/enums';

export type AnnouncementType = 'info' | 'warning' | 'success' | 'danger';

/** GET /app-config (public) — operator settings from CRM Settings. */
export interface AppConfig {
  announcement: { enabled: boolean; message: string; type: AnnouncementType };
  maintenanceMode: { enabled: boolean; message: string };
  featureFlags: Record<string, boolean>;
}

const ANNOUNCEMENT_TYPES: readonly AnnouncementType[] = ['info', 'warning', 'success', 'danger'];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Defensive read of the /app-config body: anything malformed means "nothing to show". */
export function parseAppConfig(raw: unknown): AppConfig {
  const o = record(raw);
  const a = record(o.announcement);
  const m = record(o.maintenanceMode);
  const flags = record(o.featureFlags);
  const featureFlags: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(flags)) if (typeof v === 'boolean') featureFlags[k] = v;
  return {
    announcement: {
      enabled: a.enabled === true,
      message: typeof a.message === 'string' ? a.message : '',
      type: ANNOUNCEMENT_TYPES.includes(a.type as AnnouncementType) ? (a.type as AnnouncementType) : 'info',
    },
    maintenanceMode: {
      enabled: m.enabled === true,
      message: typeof m.message === 'string' ? m.message : '',
    },
    featureFlags,
  };
}

/**
 * The announcement to show, or null. Dismissal is keyed by the message text (as
 * on the website), so an edited announcement re-appears.
 */
export function activeAnnouncement(
  config: AppConfig | null | undefined,
  dismissedMessage: string | null,
): { message: string; type: AnnouncementType } | null {
  const a = config?.announcement;
  if (!a?.enabled || !a.message.trim()) return null;
  if (dismissedMessage === a.message) return null;
  return { message: a.message, type: a.type };
}

/**
 * Website fallback (`common.maintenance_default`) when the operator leaves the
 * message blank, in the current language. Operator-written text is shown as received.
 */
export function maintenanceDefaultMessage(): string {
  return t('notices.maintenance.defaultMessage');
}

/**
 * Maintenance screen text for this user, or null to let them through. Admins and
 * super-admins pass (so they can keep working and turn it back off).
 */
export function maintenanceMessage(
  config: AppConfig | null | undefined,
  role: UserRole | string | null | undefined,
): string | null {
  const m = config?.maintenanceMode;
  if (!m?.enabled) return null;
  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) return null;
  return m.message.trim() || maintenanceDefaultMessage();
}

/** shared-types DELINQUENT_STATUSES — the statuses the website's dunning banner shows for. */
export const DELINQUENT_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.INCOMPLETE,
];

/**
 * Payment-issue notice text, or null. Text only — App Store / Play rules forbid
 * linking to an external payment portal, so the user is told WHERE to fix it:
 * the store that bills an in-app subscription, otherwise the website.
 */
export function paymentIssueNotice(
  subscription: { status?: string | null; provider?: string | null } | null | undefined,
): { title: string; body: string } | null {
  const status = subscription?.status as SubscriptionStatus | undefined;
  if (!status || !DELINQUENT_STATUSES.includes(status)) return null;
  const body =
    subscription?.provider === 'apple'
      ? t('notices.paymentIssue.bodyApple')
      : subscription?.provider === 'google'
        ? t('notices.paymentIssue.bodyGoogle')
        : t('notices.paymentIssue.bodyWeb');
  return { title: t('notices.paymentIssue.title'), body };
}
