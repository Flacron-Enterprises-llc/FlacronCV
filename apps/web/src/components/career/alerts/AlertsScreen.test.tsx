import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type AlertList } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { AlertsScreen } from './AlertsScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const settings: AlertList['settings'] = {
  email: true,
  push: false,
  telegram: false,
  digest: 'weekly',
  quietStart: null,
  quietEnd: null,
  paused: false,
};

const center: AlertList = {
  items: [
    {
      id: 'a1',
      opportunityId: '11111111-1111-4111-8111-111111111111',
      title: 'SQL analyst',
      organization: 'Babbage Works',
      revisionId: '22222222-2222-4222-8222-222222222222',
      reason: { code: 'saved_search', fit: 'partial' },
      createdAt: '2026-10-16T09:00:00.000Z',
    },
  ],
  alertItem: { includedRemaining: 9, packRemaining: 0, renewalDate: '2026-11-16T00:00:00.000Z' },
  settings,
};

function renderAlerts(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <AlertsScreen api={api} user={user} ready signInHref="/en/sign-in" locale="en" />
    </NextIntlClientProvider>,
  );
}

describe('AlertsScreen', () => {
  it('shows the reason and does not show an overlap number', async () => {
    const api = testApi({ alerts: vi.fn().mockResolvedValue(center) });
    renderAlerts(api);
    expect(await screen.findByText('SQL analyst')).toBeTruthy();
    expect(screen.getByText('This listing matches a saved search.')).toBeTruthy();
    expect(screen.getByText('Partial overlap with your confirmed facts')).toBeTruthy();
    expect(screen.queryByText('0.42')).toBeNull();
    expect(screen.getByText('This is not a hiring probability.')).toBeTruthy();
  });

  it('keeps the list when the alert balance is zero and shows the plan message for push', async () => {
    const updateAlertSettings = vi.fn().mockRejectedValue(
      new ApiError(403, 'plan_upgrade_required', { code: 'plan_upgrade_required', feature: 'alertDelivery', minimumPlan: 'professional' }),
    );
    const api = testApi({
      alerts: vi.fn().mockResolvedValue({
        ...center,
        alertItem: { includedRemaining: 0, packRemaining: 0, renewalDate: '2026-11-16T00:00:00.000Z' },
      }),
      updateAlertSettings,
    });
    renderAlerts(api);
    expect(await screen.findByText('No alert items left')).toBeTruthy();
    expect(screen.getByText('SQL analyst')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Push' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save alert settings' }));
    expect(await screen.findByText('That channel is not on this plan')).toBeTruthy();
    expect(updateAlertSettings).toHaveBeenCalledTimes(1);
  });
});

describe('AlertsScreen saved searches', () => {
  const searches = [
    { id: 's1', q: 'data analyst', category: null, locationProfileId: null, radiusMiles: null, schedule: 'weekly' as const, paused: false },
    { id: 's2', q: null, category: null, locationProfileId: null, radiusMiles: null, schedule: 'daily' as const, paused: true },
  ];

  it('lists saved searches and pauses, resumes and deletes them', async () => {
    const updateSavedSearch = vi.fn().mockResolvedValue({ ...searches[0], paused: true });
    const deleteSavedSearch = vi.fn().mockResolvedValue({ ok: true });
    const api = testApi({
      alerts: vi.fn().mockResolvedValue(center),
      savedSearches: vi.fn().mockResolvedValue({ items: searches }),
      updateSavedSearch,
      deleteSavedSearch,
    });
    renderAlerts(api);
    expect(await screen.findByText('data analyst')).toBeTruthy();
    expect(screen.getByText('All opportunities')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(updateSavedSearch).toHaveBeenCalledWith('s1', { paused: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete saved search All opportunities' }));
    expect(deleteSavedSearch).toHaveBeenCalledWith('s2');
    await screen.findByText('data analyst');
    expect(screen.queryByText('All opportunities')).toBeNull();
  });

  it('keeps the alert centre when saved searches fail to load, and says push/Telegram are not connected', async () => {
    const api = testApi({ alerts: vi.fn().mockResolvedValue(center) });
    renderAlerts(api);
    expect(await screen.findByText('SQL analyst')).toBeTruthy();
    expect(await screen.findByText(/saved searches could not be loaded/)).toBeTruthy();
    expect(screen.getAllByText(/Not connected yet/).length).toBe(2);
  });
});
