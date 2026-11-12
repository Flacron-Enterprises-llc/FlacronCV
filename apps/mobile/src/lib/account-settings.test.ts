import { afterEach, describe, expect, it } from 'vitest';
import {
  emailPreferencePatch,
  emailPreferenceValue,
  sendPasswordResetToSelf,
  signOutEverywhere,
} from './account-settings';
import {
  invoiceAccessibilityLabel,
  invoiceAmount,
  invoiceStatusLabel,
  invoiceStatusVariant,
  invoiceSubtitle,
} from './billing-history';
import { LEGAL_PATHS, legalDocUrl } from './legal-docs';
import type { BillingInvoice } from '../types/subscription.types';

describe('email preferences', () => {
  it('uses the website defaults when the stored value is missing', () => {
    expect(emailPreferenceValue(undefined, 'emailNotifications')).toBe(true);
    expect(emailPreferenceValue(undefined, 'marketingEmails')).toBe(false);
    expect(emailPreferenceValue({}, 'emailNotifications')).toBe(true);
  });

  it('reads stored values', () => {
    expect(emailPreferenceValue({ emailNotifications: false, marketingEmails: true }, 'emailNotifications')).toBe(false);
    expect(emailPreferenceValue({ emailNotifications: false, marketingEmails: true }, 'marketingEmails')).toBe(true);
  });

  it('PATCH body carries only the toggled key (never pushNotifications)', () => {
    expect(emailPreferencePatch('marketingEmails', true)).toEqual({ marketingEmails: true });
    expect(emailPreferencePatch('emailNotifications', false)).toEqual({ emailNotifications: false });
  });
});

describe('sendPasswordResetToSelf (POST /auth/reset-password via auth-store, not called live)', () => {
  it('sends the reset to the signed-in address, trimmed', async () => {
    const sent: string[] = [];
    const address = await sendPasswordResetToSelf(' jane@example.test ', async (email) => {
      sent.push(email);
    });
    expect(sent).toEqual(['jane@example.test']);
    expect(address).toBe('jane@example.test');
  });

  it('refuses without an email and never calls the API', async () => {
    let called = false;
    await expect(
      sendPasswordResetToSelf(null, async () => {
        called = true;
      }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });

  it('passes the store error message through', async () => {
    await expect(
      sendPasswordResetToSelf('jane@example.test', async () => {
        throw new Error('Too many requests. Please wait a moment and try again.');
      }),
    ).rejects.toThrow('Too many requests');
  });
});

describe('signOutEverywhere (POST /users/me/sign-out-everywhere, not called live)', () => {
  it('revokes on the server, then signs out locally', async () => {
    const calls: string[] = [];
    await signOutEverywhere({
      revokeAllSessions: async () => {
        calls.push('revoke');
        return { revokedAt: '2026-11-13T00:00:00.000Z' };
      },
      signOutLocally: async () => {
        calls.push('local');
      },
    });
    expect(calls).toEqual(['revoke', 'local']);
  });

  it('a failed revoke keeps this device signed in and rethrows', async () => {
    const calls: string[] = [];
    await expect(
      signOutEverywhere({
        revokeAllSessions: async () => {
          throw new Error('429');
        },
        signOutLocally: async () => {
          calls.push('local');
        },
      }),
    ).rejects.toThrow('429');
    expect(calls).toEqual([]);
  });

  it('a failed local sign-out after a revoke is not an error', async () => {
    await expect(
      signOutEverywhere({
        revokeAllSessions: async () => ({}),
        signOutLocally: async () => {
          throw new Error('offline');
        },
      }),
    ).resolves.toBeUndefined();
  });
});

const invoice = (over: Partial<BillingInvoice> = {}): BillingInvoice => ({
  id: 'in_1',
  number: 'ABC-0001',
  status: 'paid',
  amountPaid: 1999,
  amountDue: 1999,
  currency: 'usd',
  created: '2026-01-05T12:00:00.000Z',
  hostedInvoiceUrl: 'https://invoice.example/x',
  invoicePdf: 'https://invoice.example/x.pdf',
  ...over,
});

describe('billing history formatting', () => {
  it('formats minor units as currency, falling back to amountDue', () => {
    expect(invoiceAmount(invoice())).toBe('$19.99');
    expect(invoiceAmount(invoice({ amountPaid: 0, amountDue: 500 }))).toBe('$5.00');
    expect(invoiceAmount(invoice({ currency: 'eur', amountPaid: 1000 }))).toBe('€10.00');
  });

  it('falls back to a plain amount for an unknown currency code', () => {
    expect(invoiceAmount(invoice({ currency: 'not-a-code', amountPaid: 1234 }))).toBe('12.34 NOT-A-CODE');
  });

  it('uses website status labels and variants', () => {
    expect(invoiceStatusLabel('paid')).toBe('Paid');
    expect(invoiceStatusLabel('uncollectible')).toBe('Uncollectible');
    expect(invoiceStatusLabel('mystery')).toBe('mystery');
    expect(invoiceStatusVariant('open')).toBe('warning');
    expect(invoiceStatusVariant('void')).toBe('danger');
    expect(invoiceStatusVariant('mystery')).toBe('default');
  });

  it('subtitle is date · number, or date alone', () => {
    const fmt = () => 'Jan 5, 2026';
    expect(invoiceSubtitle(invoice(), fmt)).toBe('Jan 5, 2026 · ABC-0001');
    expect(invoiceSubtitle(invoice({ number: null }), fmt)).toBe('Jan 5, 2026');
  });

  it('accessibility label never contains the Stripe links', () => {
    const label = invoiceAccessibilityLabel(invoice(), () => 'Jan 5, 2026');
    expect(label).toBe('$19.99, Jan 5, 2026, invoice ABC-0001, Paid');
    expect(label).not.toContain('http');
  });
});

describe('refund policy link', () => {
  const original = process.env.EXPO_PUBLIC_APP_URL;
  afterEach(() => {
    process.env.EXPO_PUBLIC_APP_URL = original;
  });

  it('points at the website /refund-policy page', () => {
    expect(LEGAL_PATHS.refund).toBe('/refund-policy');
    process.env.EXPO_PUBLIC_APP_URL = 'https://app.example.test/';
    expect(legalDocUrl('refund')).toBe('https://app.example.test/en/refund-policy');
  });

  it('is null without a configured origin', () => {
    process.env.EXPO_PUBLIC_APP_URL = '';
    expect(legalDocUrl('refund')).toBeNull();
  });
});
