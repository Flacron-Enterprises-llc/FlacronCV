import type {
  ApiKeyEnvironment,
  ApiKeyView,
  DeveloperKey,
  DeveloperStatus,
} from '../../../../../packages/career-api-client/src/types';
import { formatDate, t } from '../../i18n';

/**
 * Developer page view logic (website: ScopePanels `DeveloperPanel`). Keys
 * belong to one environment (`flc_test_…` or `flc_live_…`); test keys never
 * spend paid reads. A key can be created only when the API package add-on is
 * on the account, and the raw key is shown once. Nothing is sold in the app:
 * without the add-on the page says the API is coming soon.
 */

const S = (key: string, values?: Record<string, string | number>) => t(`careerBusiness.scope.${key}`, values);

/** The website's defaults when the API does not report its limits. */
export const DEFAULT_RATE_LIMITS: Record<ApiKeyEnvironment, number> = { test: 30, live: 120 };

export function environmentLabel(environment: ApiKeyEnvironment): string {
  return environment === 'live' ? S('envLive') : S('envTest');
}

export function rateLimitsLine(status: Pick<DeveloperStatus, 'rateLimits'>): string {
  const limits = status.rateLimits ?? DEFAULT_RATE_LIMITS;
  return S('rateLimits', { test: limits.test, live: limits.live });
}

/** The key's visible prefix only, never a secret. */
export function keyPrefixLabel(key: Pick<ApiKeyView, 'prefix'>): string {
  return `${key.prefix}…`;
}

export function keyCreatedLine(key: Pick<ApiKeyView, 'createdAt'>): string {
  return S('keyCreated', { date: formatDate(new Date(key.createdAt)) });
}

/** Adds a key just created to the top of the list (the secret is not kept in the list). */
export function withCreatedKey(keys: readonly ApiKeyView[], created: DeveloperKey, now: Date = new Date()): ApiKeyView[] {
  return [
    { id: created.id, prefix: created.prefix, environment: created.environment, createdAt: now.toISOString(), lastUsedAt: null, revokedAt: null },
    ...keys.filter((key) => key.id !== created.id),
  ];
}

export function withRevokedKey(keys: readonly ApiKeyView[], keyId: string, now: Date = new Date()): ApiKeyView[] {
  return keys.map((key) => (key.id === keyId && !key.revokedAt ? { ...key, revokedAt: now.toISOString() } : key));
}

/** Active keys first, newest first within each group. */
export function sortKeys(keys: readonly ApiKeyView[]): ApiKeyView[] {
  return [...keys].sort((a, b) => {
    if (Boolean(a.revokedAt) !== Boolean(b.revokedAt)) return a.revokedAt ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * What the page can offer. `soon`: no add-on at all and no keys, so the page
 * is an honest "coming soon". `keys` lets the person create keys; `brand`
 * lets them save a white-label brand. Existing keys can always be revoked.
 */
export function developerMode(status: DeveloperStatus): { soon: boolean; keys: boolean; brand: boolean } {
  const hasKeys = (status.keys ?? []).length > 0;
  return { soon: !status.apiPackage && !status.whiteLabel && !hasKeys, keys: status.apiPackage, brand: status.whiteLabel };
}

/** The attribution must keep FlacronCV (the API refuses it otherwise). */
export function attributionValid(attribution: string): boolean {
  return /flacroncv/i.test(attribution);
}
