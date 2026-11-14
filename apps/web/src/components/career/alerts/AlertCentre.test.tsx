import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { AlertList, ReminderList } from '@flacroncv/career-api-client';
import type { JobApplication } from '@flacroncv/shared-types';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { AlertsScreen } from './AlertsScreen';

const user: SignedInUser = { uid: 'ada', email: 'ada@example.test', emailVerified: true, getIdToken: async () => 'token' };

const center: AlertList = {
  items: [
    {
      id: 'a1',
      opportunityId: '11111111-1111-4111-8111-111111111111',
      title: 'SQL analyst',
      organization: 'Babbage Works',
      revisionId: 'rev',
      reason: { code: 'saved_search', fit: null, tier: 'basic', searchLabel: 'SQL', labelReasons: [], gaps: [], advanced: null },
      basic: {
        provider: 'adzuna', category: 'job', locations: ['London'], sourceUrl: 'https://example.test/1',
        checkedAt: '2026-10-16T09:00:00.000Z', compensation: { minimum: null, maximum: null, currency: null, period: null }, deadline: '2026-12-01',
      },
      read: false,
      deliveries: [{ channel: 'email', status: 'pending', lastError: 'provider_unavailable' }],
      createdAt: '2026-10-16T09:00:00.000Z',
    },
  ],
  unread: 1,
  alertItem: { includedRemaining: 9, packRemaining: 0, renewalDate: null },
  settings: { email: true, push: false, telegram: false, digest: 'weekly', quietStart: null, quietEnd: null, paused: false },
  channels: { email: 'not_connected', push: 'not_connected', telegram: 'not_connected' },
  tier: 'basic',
};

const reminders: ReminderList = {
  upcoming: [
    { id: 'r1', kind: 'interview', title: 'Analyst · Fictional Co', dueDate: '2026-10-20', link: '/jobs', read: false, createdAt: '2026-10-16T00:00:00.000Z', deliveries: [] },
  ],
  history: [
    { id: 'r0', kind: 'certification_expiry', title: 'First Aid', dueDate: '2026-10-01', link: null, read: true, createdAt: '2026-09-01T00:00:00.000Z', deliveries: [] },
  ],
  unread: 1,
};

function renderCentre(overrides: Parameters<typeof testApi>[0], jobs: Partial<JobApplication>[] = []) {
  const tracker = { list: vi.fn(async () => jobs as JobApplication[]), create: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <AlertsScreen api={testApi(overrides)} user={user} ready signInHref="/en/sign-in" locale="en" tracker={tracker} />
    </NextIntlClientProvider>,
  );
  return tracker;
}

describe('alert centre', () => {
  it('says which saved search surfaced an alert, shows basic details, and is honest that email is not connected', async () => {
    const markAlertRead = vi.fn(async () => ({ id: 'a1', read: true as const }));
    renderCentre({ alerts: vi.fn(async () => center), markAlertRead, reminders: vi.fn(async () => reminders) });
    expect(await screen.findByText('Matches your saved search “SQL”.')).toBeTruthy();
    expect(screen.getByText(/London · deadline/)).toBeTruthy();
    expect(screen.getByText('1 unread')).toBeTruthy();
    expect(screen.getAllByText(/Not connected yet/).length).toBe(3);
    expect(screen.getByText(/Not sent by Email: not connected yet/)).toBeTruthy();
    // Free is the Basic level: no fit line, and the higher filters say where they start.
    expect(screen.getByText('Pay, schedule and level filters start on Starter.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0]!);
    await waitFor(() => expect(markAlertRead).toHaveBeenCalledWith('a1'));
  });

  it('syncs tracker dates into reminders and shows them with history, apart from alert quota', async () => {
    const syncTrackerReminders = vi.fn(async () => ({ created: 1 }));
    renderCentre(
      { alerts: vi.fn(async () => center), reminders: vi.fn(async () => reminders), syncTrackerReminders },
      [{ id: 'j1', company: 'Fictional Co', position: 'Analyst', status: 'applied' as JobApplication['status'], interviewDate: '2026-10-20T10:00', followUpDate: null, archived: false, deletedAt: null }],
    );
    expect(await screen.findByText('Analyst · Fictional Co')).toBeTruthy();
    expect(syncTrackerReminders).toHaveBeenCalledWith([
      { kind: 'interview', sourceKey: 'j1:interview', title: 'Analyst · Fictional Co', dueDate: '2026-10-20', link: '/jobs' },
    ]);
    expect(screen.getByText(/never use alert items/)).toBeTruthy();
    expect(screen.getByText('1 past reminder')).toBeTruthy();
  });

  it('offers category and fit-threshold controls from the Enhanced level', async () => {
    const createSavedSearch = vi.fn(async () => ({ id: 's1', q: 'SQL', category: 'internship', locationProfileId: null, radiusMiles: null, schedule: 'weekly' as const, paused: false }));
    renderCentre({
      alerts: vi.fn(async () => ({ ...center, tier: 'enhanced' as const, channels: { email: 'connected' as const, push: 'not_connected' as const, telegram: 'not_connected' as const } })),
      reminders: vi.fn(async () => ({ upcoming: [], history: [], unread: 0 })),
      savedSearches: vi.fn(async () => ({ items: [] })),
      createSavedSearch,
    });
    fireEvent.change(await screen.findByLabelText('Saved search'), { target: { value: 'SQL' } });
    fireEvent.change(screen.getByLabelText('Category (optional)'), { target: { value: 'internship' } });
    fireEvent.change(screen.getByLabelText('Only alert me for'), { target: { value: 'strong_fit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save search' }));
    await waitFor(() => expect(createSavedSearch).toHaveBeenCalledWith({ q: 'SQL', category: 'internship', relevance: 'strong_fit' }));
    expect(screen.getAllByText(/Not connected yet/).length).toBe(2);
  });
});
