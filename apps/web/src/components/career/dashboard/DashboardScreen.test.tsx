import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationItem, Fact, Me, UsageSummary } from '@flacroncv/career-api-client';
import type { FactType } from '@flacroncv/career-shared';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { DashboardScreen } from './DashboardScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const me: Me = {
  user: { id: 'user-1', authUserId: 'ada', locale: 'en', email: 'ada@example.test', emailVerified: true },
  workspaceId: 'workspace-1',
  billingAccountId: 'billing-1',
  planId: 'free',
  legal: {
    required: { terms: '2026-10-10', privacy: '2026-10-10', disclaimer: '2026-10-10' },
    accepted: null,
    needsAcceptance: false,
  },
};

function fact(id: string, factType: FactType, confirmation: 'draft' | 'confirmed'): Fact {
  return {
    id,
    factType,
    value: factType === 'skill' ? { name: 'SQL' } : { text: 'SQL' },
    source: 'manual',
    confirmation,
    uncertain: {},
    missingFields: [],
    importId: null,
    revision: 1,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    confirmedAt: confirmation === 'confirmed' ? '2026-10-16T00:00:00.000Z' : null,
  };
}

function application(id: string, title: string, deadline: string): ApplicationItem {
  return {
    id,
    opportunityId: '11111111-1111-4111-8111-111111111111',
    opportunityRevisionId: '22222222-2222-4222-8222-222222222222',
    resumeVersionId: '44444444-4444-4444-8444-444444444444',
    letterId: null,
    status: 'saved',
    contacts: [],
    notes: '',
    dates: { deadline, applied: null, interview: null },
    checklist: [],
    snapshot: {
      title,
      organization: null,
      sourceUrl: null,
      description: 'Keep the ledger.',
      checkedAt: '2026-10-16T09:00:00.000Z',
      provider: 'paste',
      revisionId: '22222222-2222-4222-8222-222222222222',
    },
    createdAt: '2026-10-16T09:00:00.000Z',
    updatedAt: '2026-10-16T09:00:00.000Z',
  };
}

const usage: UsageSummary = {
  renewalDate: '2026-11-16T00:00:00.000Z',
  units: [
    { unit: 'document_credit', includedGranted: 3, includedRemaining: 0, packRemaining: 0, packHeld: 0 },
    { unit: 'text_interview', includedGranted: 0, includedRemaining: 2, packRemaining: 0, packHeld: 0 },
  ],
  packs: [],
};

function renderDashboard(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <DashboardScreen api={api} user={user} ready signInHref="/en/sign-in" locale="en" />
    </NextIntlClientProvider>,
  );
}

describe('DashboardScreen', () => {
  it('shows a page heading when signed out', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <DashboardScreen api={testApi()} user={null} ready signInHref="/en/sign-in" locale="en" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('Facts, applications, and remaining usage for this account.')).toBeTruthy();
    expect(screen.getByText('Sign in to see your dashboard')).toBeTruthy();
  });

  it('shows an empty profile and does not spend a credit', async () => {
    const api = testApi({
      me: vi.fn().mockResolvedValue(me),
      facts: vi.fn().mockResolvedValue({ items: [], profileVersion: 1 }),
      usage: vi.fn().mockResolvedValue(usage),
      applications: vi.fn().mockResolvedValue({ items: [] }),
      resumes: vi.fn().mockResolvedValue({ items: [], documentCredit: { includedRemaining: 0, packRemaining: 0, renewalDate: null } }),
      alerts: vi.fn().mockResolvedValue({ items: [], alertItem: { includedRemaining: 0, packRemaining: 0, renewalDate: null }, settings: settings() }),
    });
    renderDashboard(api);
    expect(await screen.findByText('No facts yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open profile' }).getAttribute('href')).toBe('/en/career/profile');
    expect(screen.queryByText(/hiring/i)).toBeNull();
    expect(screen.queryByText(/score/i)).toBeNull();
  });

  it('shows the next deadline, a draft fact, and a billing link when a unit is zero', async () => {
    const api = testApi({
      me: vi.fn().mockResolvedValue(me),
      facts: vi.fn().mockResolvedValue({
        items: [
          fact('f-contact', 'contact', 'confirmed'),
          fact('f-summary', 'summary', 'confirmed'),
          fact('f-experience', 'experience', 'confirmed'),
          fact('f-education', 'education', 'confirmed'),
          fact('f-skill', 'skill', 'confirmed'),
          fact('f-project', 'project', 'draft'),
        ],
        profileVersion: 2,
      }),
      usage: vi.fn().mockResolvedValue(usage),
      applications: vi.fn().mockResolvedValue({
        items: [application('app-old', 'Old role', '2020-01-01'), application('app-next', 'SQL analyst', '2099-01-01')],
      }),
      resumes: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'r1',
            title: 'Librarian CV',
            language: 'en' as const,
            templateId: 'classic',
            createdAt: '2026-10-16T00:00:00.000Z',
            currentVersionId: 'v1',
          },
        ],
        documentCredit: { includedRemaining: 0, packRemaining: 0, renewalDate: null },
      }),
      resume: vi.fn().mockResolvedValue({
        id: 'r1',
        title: 'Librarian CV',
        language: 'en',
        templateId: 'classic',
        createdAt: '2026-10-16T00:00:00.000Z',
        currentVersionId: 'v1',
        version: {
          id: 'v1',
          resumeId: 'r1',
          versionNumber: 1,
          body: {
            templateId: 'classic',
            confirmation: 'confirmed',
            sections: [{ factType: 'skill', lines: [{ factId: 's1', factType: 'skill', text: 'Cataloguing', uncertain: false }] }],
          },
          factIds: ['s1'],
          opportunityRevisionId: null,
          createdAt: '2026-10-16T00:00:00.000Z',
        },
      }),
      alerts: vi.fn().mockResolvedValue({ items: [], alertItem: { includedRemaining: 1, packRemaining: 0, renewalDate: null }, settings: settings() }),
    });
    renderDashboard(api);
    const action = await screen.findByRole('link', { name: /SQL analyst/ });
    expect(action.getAttribute('href')).toBe('/en/jobs');
    expect(screen.getByText(/2099-01-01/)).toBeTruthy();
    expect(screen.queryByText(/2020-01-01/)).toBeNull();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Text interviews/).length).toBe(2);
    expect(screen.getByText('Librarian CV')).toBeTruthy();
    expect(screen.getByText('Cataloguing')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open resume studio' }).getAttribute('href')).toBe('/en/career/documents');
    expect(screen.getByRole('link', { name: 'Open billing' }).getAttribute('href')).toBe('/en/settings/billing');
    expect(screen.getByRole('link', { name: 'Practice' }).getAttribute('href')).toBe('/en/career/interviews');
    expect(screen.queryByText(/hiring/i)).toBeNull();
    expect(screen.queryByText(/score/i)).toBeNull();
  });
});

function settings() {
  return { email: true, push: false, telegram: false, digest: 'weekly' as const, quietStart: null, quietEnd: null, paused: false };
}
