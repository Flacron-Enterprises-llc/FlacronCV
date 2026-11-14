import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SubscriptionPlan } from '@flacroncv/shared-types';
import en from '../../../../../../public/locales/en/common.json';

vi.mock('@/lib/firebase', () => ({ auth: {}, db: {}, storage: {}, app: {}, isConfigured: false, googleProvider: {} }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/fcge', () => ({ fcgeUpgradeClicked: vi.fn(), fcgeTrack: vi.fn() }));
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(async () => ({ items: [] })), post: vi.fn(), put: vi.fn() },
}));

const refreshUser = vi.fn(async () => {});
let usage = { coverLettersCreated: 1, aiCreditsUsed: 0 };
let plan = SubscriptionPlan.FREE;
vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'u1', subscription: { plan, status: 'active' }, usage },
    degraded: false,
    placeholderAccount: false,
    refreshUser,
  }),
}));

import NewCoverLetterPage from './page';

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <NewCoverLetterPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('/cover-letters/new allowance gate', () => {
  beforeEach(() => {
    refreshUser.mockClear();
    localStorage.clear();
  });

  it('blocks a Free user at the limit up front: notice + upgrade modal, with fresh usage', async () => {
    usage = { coverLettersCreated: 1, aiCreditsUsed: 0 };
    plan = SubscriptionPlan.FREE;
    renderPage();
    expect(screen.getByTestId('cover-letter-limit-notice').textContent).toContain(en.coverLetters.new_limit_reached);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it('lets a user with allowance left fill the form undisturbed', () => {
    usage = { coverLettersCreated: 0, aiCreditsUsed: 0 };
    plan = SubscriptionPlan.FREE;
    renderPage();
    expect(screen.queryByTestId('cover-letter-limit-notice')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
