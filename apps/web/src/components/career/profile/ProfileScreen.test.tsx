import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiClient, type Fact } from '@flacroncv/career-api-client';
import { EMPTY_PREFERENCES } from '@flacroncv/career-shared';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { ProfileScreen } from './ProfileScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const skill: Fact = {
  id: 'f1',
  factType: 'skill',
  value: { name: 'SQL', category: null },
  source: 'import',
  confirmation: 'draft',
  uncertain: { name: { reason: 'not_found_in_source' } },
  missingFields: [],
  importId: 'imp',
  revision: 1,
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
  confirmedAt: null,
};

const allowance = { limit: 10, used: 0, pending: 0, remaining: 10, resetsAt: '2026-10-17T00:00:00.000Z' };

const me = {
  user: { id: '1', authUserId: 'ada', locale: 'en' as const, email: 'ada@example.test', emailVerified: true },
  workspaceId: 'w',
  billingAccountId: 'b',
  planId: 'free',
  legal: {
    required: { terms: '2026-08-16', privacy: '2026-08-16', disclaimer: '2026-08-16' },
    accepted: null,
    needsAcceptance: false,
  },
};

function profileBody() {
  return {
    version: 1,
    preferences: { ...EMPTY_PREFERENCES },
    counts: { confirmed: 0, draft: 0, uncertain: 0, missingCore: [] as [] },
  };
}

function renderScreen(api: ApiClient, options: { signedIn?: SignedInUser | null; ready?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ProfileScreen
        api={api}
        user={options.signedIn === undefined ? user : options.signedIn}
        ready={options.ready ?? true}
        locale="en"
        signInHref="/en/sign-in"
        extract={async () => ({ text: 'Ada Lovelace', format: 'pdf' })}
        onLocale={vi.fn()}
        onResendVerification={vi.fn(async () => undefined)}
      />
    </NextIntlClientProvider>,
  );
}

function readyApi(facts: Fact[], remaining = 10, extra: Partial<ApiClient> = {}) {
  return testApi({
    me: vi.fn(async () => me),
    facts: vi.fn(async () => ({ items: facts, profileVersion: 1 })),
    profile: vi.fn(async () => profileBody()),
    importAllowance: vi.fn(async () => ({ ...allowance, remaining })),
    ...extra,
  });
}

describe('ProfileScreen', () => {
  it('shows an empty profile with the import notice', async () => {
    renderScreen(readyApi([]));
    expect(await screen.findByText('No career facts yet')).toBeTruthy();
    expect(screen.getByText('This does not use a document credit.')).toBeTruthy();
    expect(screen.getByText('10 imports left today')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a fact' })).toBeTruthy();
  });

  it('shows a draft, the uncertain flag, and confirms without sending an unchanged patch', async () => {
    const confirmFact = vi.fn(async () => ({ ...skill, confirmation: 'confirmed' as const, uncertain: {}, confirmedAt: '2026-10-16T01:00:00.000Z', revision: 2 }));
    const updateFact = vi.fn();
    renderScreen(readyApi([skill], 10, { confirmFact, updateFact }));
    expect(await screen.findByText('This was not found in the resume text.')).toBeTruthy();
    expect(screen.getAllByText('Draft')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findAllByText('Confirmed')).toHaveLength(2);
    expect(confirmFact).toHaveBeenCalledWith('f1');
    expect(updateFact).not.toHaveBeenCalled();
  });

  it('saves only the edited field', async () => {
    const updateFact = vi.fn(async () => ({ ...skill, value: { name: 'SQL', category: 'Data' }, revision: 2, updatedAt: '2026-10-16T02:00:00.000Z' }));
    renderScreen(readyApi([skill], 10, { updateFact }));
    const category = await screen.findByLabelText('Category');
    fireEvent.change(category, { target: { value: 'Data' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByDisplayValue('Data');
    expect(updateFact).toHaveBeenCalledWith('f1', { category: 'Data' });
  });

  it('hides the file input at the daily limit', async () => {
    renderScreen(readyApi([], 0));
    expect(await screen.findByText(/The daily import limit is 10/)).toBeTruthy();
    expect(screen.queryByLabelText('Resume file')).toBeNull();
  });

  it('keeps a typed edit on screen when the import fails, and says nothing was counted', async () => {
    const importResume = vi.fn(async () => {
      throw new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' });
    });
    renderScreen(readyApi([skill], 10, { importResume }));
    const category = await screen.findByLabelText('Category');
    fireEvent.change(category, { target: { value: 'Data' } });
    const input = screen.getByLabelText('Resume file');
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'ada.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Import is unavailable')).toBeTruthy();
    expect(screen.getByText('The provider did not answer. The daily import was not counted, and no document credit was used.')).toBeTruthy();
    expect(screen.getByLabelText('Category')).toHaveProperty('value', 'Data');
  });

  it('says nothing about the facts when the profile is not this person', async () => {
    renderScreen(
      testApi({
        me: vi.fn(async () => {
          throw new ApiError(403, 'permission_denied', { code: 'permission_denied' });
        }),
        facts: vi.fn(),
        profile: vi.fn(),
        importAllowance: vi.fn(),
      }),
    );
    expect(await screen.findByText('This profile is not available')).toBeTruthy();
    expect(screen.queryByText('SQL')).toBeNull();
  });

  it('offers a retry when the profile cannot be loaded', async () => {
    let calls = 0;
    const api = testApi({
      me: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new ApiError(0, 'network_error', { code: 'network_error' });
        return me;
      }),
      facts: vi.fn(async () => ({ items: [], profileVersion: 0 })),
      profile: vi.fn(async () => profileBody()),
      importAllowance: vi.fn(async () => allowance),
    });
    renderScreen(api);
    expect(await screen.findByText('The profile could not be loaded')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No career facts yet')).toBeTruthy();
  });

  it('asks for sign-in when there is no session', async () => {
    renderScreen(testApi(), { signedIn: null });
    expect(await screen.findByText('Sign in to see your profile')).toBeTruthy();
  });

  it('stacks the fact list in one column', async () => {
    renderScreen(readyApi([skill]));
    const layout = await screen.findByTestId('profile-layout');
    expect(layout.className).toContain('grid-cols-1');
  });
});
