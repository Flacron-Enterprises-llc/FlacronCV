import { describe, expect, it } from 'vitest';
import { SubscriptionStatus, UserRole } from '../../types/enums';
import {
  activeAnnouncement,
  MAINTENANCE_DEFAULT_MESSAGE,
  maintenanceMessage,
  parseAppConfig,
  paymentIssueNotice,
} from './app-notices';

const CONFIG = parseAppConfig({
  announcement: { enabled: true, message: 'New templates!', type: 'success' },
  maintenanceMode: { enabled: true, message: '' },
  featureFlags: { a: true, b: 'x' },
});

describe('parseAppConfig', () => {
  it('reads the /app-config shape and drops junk', () => {
    expect(CONFIG.announcement).toEqual({ enabled: true, message: 'New templates!', type: 'success' });
    expect(CONFIG.featureFlags).toEqual({ a: true });
  });
  it('treats a malformed body as "nothing on"', () => {
    const c = parseAppConfig(null);
    expect(c.announcement.enabled).toBe(false);
    expect(c.maintenanceMode.enabled).toBe(false);
    expect(
      parseAppConfig({ announcement: { enabled: true, message: 'x', type: 'weird' } }).announcement.type,
    ).toBe('info');
  });
});

describe('activeAnnouncement', () => {
  it('shows an enabled announcement until that exact message is dismissed', () => {
    expect(activeAnnouncement(CONFIG, null)).toEqual({ message: 'New templates!', type: 'success' });
    expect(activeAnnouncement(CONFIG, 'New templates!')).toBeNull();
    expect(activeAnnouncement(CONFIG, 'an older message')).not.toBeNull();
  });
  it('hides disabled or blank announcements', () => {
    expect(activeAnnouncement(parseAppConfig({ announcement: { enabled: false, message: 'x' } }), null)).toBeNull();
    expect(activeAnnouncement(parseAppConfig({ announcement: { enabled: true, message: '  ' } }), null)).toBeNull();
    expect(activeAnnouncement(undefined, null)).toBeNull();
  });
});

describe('maintenanceMessage', () => {
  it('blocks users with the operator message or the website fallback', () => {
    expect(maintenanceMessage(CONFIG, UserRole.USER)).toBe(MAINTENANCE_DEFAULT_MESSAGE);
    expect(
      maintenanceMessage(parseAppConfig({ maintenanceMode: { enabled: true, message: 'Back at 5pm' } }), undefined),
    ).toBe('Back at 5pm');
  });
  it('lets admins through, and everyone when off', () => {
    expect(maintenanceMessage(CONFIG, UserRole.ADMIN)).toBeNull();
    expect(maintenanceMessage(CONFIG, UserRole.SUPER_ADMIN)).toBeNull();
    expect(maintenanceMessage(parseAppConfig({}), UserRole.USER)).toBeNull();
  });
});

describe('paymentIssueNotice', () => {
  it.each([SubscriptionStatus.PAST_DUE, SubscriptionStatus.UNPAID, SubscriptionStatus.INCOMPLETE])(
    'shows for delinquent status %s',
    (status) => {
      expect(paymentIssueNotice({ status })?.title).toBe('Payment issue');
    },
  );
  it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED, SubscriptionStatus.TRIALING])(
    'is silent for %s (a clean cancellation is not a payment failure)',
    (status) => {
      expect(paymentIssueNotice({ status })).toBeNull();
    },
  );
  it('points at the place that bills the user, never a link', () => {
    expect(paymentIssueNotice({ status: 'past_due', provider: 'stripe' })!.body).toContain('FlacronCV website');
    expect(paymentIssueNotice({ status: 'past_due' })!.body).toContain('FlacronCV website');
    expect(paymentIssueNotice({ status: 'past_due', provider: 'apple' })!.body).toContain('App Store');
    expect(paymentIssueNotice({ status: 'past_due', provider: 'google' })!.body).toContain('Google Play');
    expect(paymentIssueNotice({ status: 'past_due' })!.body).not.toMatch(/https?:/);
    expect(paymentIssueNotice(null)).toBeNull();
  });
});
