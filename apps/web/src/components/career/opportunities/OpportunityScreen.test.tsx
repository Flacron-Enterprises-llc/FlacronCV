import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityDetail } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { OpportunityDetailScreen } from './OpportunityDetailScreen';
import { OpportunityScreen } from './OpportunityScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const listing: OpportunityDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'job',
  provider: 'adzuna',
  title: 'Ledger analyst',
  organization: 'Babbage Works',
  status: 'open',
  label: 'open',
  sourceUrl: 'https://example.test/adzuna/adz-1',
  checkedAt: '2020-01-01T00:00:00.000Z',
  deadline: null,
  locations: ['London'],
  compensation: { minimum: null, maximum: null, currency: null, period: null },
  sponsorship: 'unknown',
  description: 'Keep the ledger.',
  resumeAnalysis: { includedRemaining: 3, packRemaining: 0, renewalDate: '2026-11-16T00:00:00.000Z' },
};

function renderSearch(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <OpportunityScreen api={api} user={user} ready signInHref="/en/sign-in" locale="en" />
    </NextIntlClientProvider>,
  );
}

describe('OpportunityScreen', () => {
  it('does not search until asked, then shows missing pay as not stated', async () => {
    const opportunities = vi.fn(async () => ({ items: [listing] }));
    renderSearch(testApi({ opportunities }));
    expect(await screen.findByText('Search or paste a listing')).toBeTruthy();
    expect(opportunities).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'ledger' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search listings' }));
    expect(await screen.findByText('Ledger analyst')).toBeTruthy();
    expect(screen.getAllByText('Not stated').length).toBeGreaterThan(0);
    expect(opportunities).toHaveBeenCalledWith({ q: 'ledger' });
    expect(screen.queryByText(/score|hiring/i)).toBeNull();
  });
});

describe('OpportunityDetailScreen', () => {
  it('shows a stale listing and does not invent pay', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <OpportunityDetailScreen
          api={testApi({ opportunity: vi.fn(async () => listing) })}
          user={user}
          ready
          signInHref="/en/sign-in"
          opportunityId={listing.id}
          nowMs={Date.parse('2026-10-17T00:00:00Z')}
        />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText('This listing has not been checked recently')).toBeTruthy();
    expect(screen.getByText('Keep the ledger.')).toBeTruthy();
    expect(screen.getAllByText('Not stated').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Original listing' }).getAttribute('href')).toBe(listing.sourceUrl);
  });

  it('asks before an analysis and does not show the overlap number', async () => {
    const createMatch = vi.fn(async () => ({
      match: {
        id: 'm1',
        fit: 'partial' as const,
        overlap: 0.42,
        reasons: [{ code: 'confirmed_overlap' as const, factId: 's1', token: 'sql' }],
        gaps: [],
        unknowns: [{ code: 'pay' as const }],
        profileVersion: 1,
        opportunityId: listing.id,
        opportunityRevisionId: 'rev',
        resumeVersionId: 'v1',
        createdAt: '2026-10-16T00:00:00.000Z',
      },
      usage: {
        unit: 'resume_analysis',
        includedGranted: 3,
        includedRemaining: 2,
        packRemaining: 0,
        packHeld: 0,
        renewalDate: '2026-11-16T00:00:00.000Z',
        ledgerState: 'committed',
      },
      jobId: 'j1',
      replayed: false,
    }));
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <OpportunityDetailScreen
          api={testApi({
            opportunity: vi.fn(async () => listing),
            resumes: vi.fn(async () => ({
              items: [{ id: 'r1', title: 'Ada', language: 'en' as const, templateId: 'classic', createdAt: '2026-10-16T00:00:00.000Z', currentVersionId: 'v1' }],
              documentCredit: { includedRemaining: 3, packRemaining: 0, renewalDate: null },
            })),
            createMatch,
          })}
          user={user}
          ready
          signInHref="/en/sign-in"
          opportunityId={listing.id}
          nowMs={Date.parse('2026-10-17T00:00:00Z')}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Compare with my resume' }));
    expect(await screen.findByText(/not a hiring probability/)).toBeTruthy();
    expect(createMatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 analysis' }));
    expect(await screen.findByText('Partial overlap with your confirmed facts')).toBeTruthy();
    expect(screen.getByText('Your confirmed facts include sql.')).toBeTruthy();
    expect(screen.getByText('Pay was not stated.')).toBeTruthy();
    expect(screen.queryByText('0.42')).toBeNull();
    expect(createMatch).toHaveBeenCalledTimes(1);
  });

  it('explains a fee warning and records the report once', async () => {
    const warned: OpportunityDetail = {
      ...listing,
      checkedAt: '2026-10-16T00:00:00.000Z',
      description: 'Send a wire transfer before the interview.',
      trustSignals: {
        moderationStatus: 'unflagged',
        isVerified: false,
        isSuppressed: false,
        signals: [{
          key: 'suspicious_fee',
          severity: 'alert',
          message: 'server wording that must not be shown when a translation exists',
        }],
        reportCount: 0,
        sourcesCount: 1,
        sourceConfidence: 'candidate_supplied',
        viewerReport: null,
      },
    };
    let release: (value: { reportId: string; status: 'reported'; reviewStatus: 'pending'; reason: 'suspicious_fee' }) => void = () => undefined;
    const reportOpportunity = vi.fn(() => new Promise<{ reportId: string; status: 'reported'; reviewStatus: 'pending'; reason: 'suspicious_fee' }>((resolve) => {
      release = resolve;
    }));
    const opportunity = vi.fn()
      .mockResolvedValueOnce(warned)
      .mockResolvedValueOnce({
        ...warned,
        trustSignals: {
          ...warned.trustSignals!,
          reportCount: 1,
          viewerReport: {
            reportId: 'r1',
            reason: 'suspicious_fee',
            status: 'pending',
            reviewAction: null,
            createdAt: '2026-10-17T00:00:00.000Z',
          },
        },
      });
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <OpportunityDetailScreen
          api={testApi({ opportunity, reportOpportunity })}
          user={user}
          ready
          signInHref="/en/sign-in"
          opportunityId={listing.id}
          nowMs={Date.parse('2026-10-17T00:00:00Z')}
        />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText('The text mentions an upfront fee or payment. Check the original listing before you apply.')).toBeTruthy();
    expect(screen.queryByText(/fraud|guaranteed/i)).toBeNull();
    expect(screen.queryByText('server wording that must not be shown when a translation exists')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'suspicious_fee' } });
    const form = screen.getByLabelText('Reason').closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form as HTMLFormElement);
    fireEvent.submit(form as HTMLFormElement);
    expect(reportOpportunity).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Your report is waiting for review.')).toBeNull();
    release({ reportId: 'r1', status: 'reported', reviewStatus: 'pending', reason: 'suspicious_fee' });
    expect(await screen.findByText('Your report is waiting for review.')).toBeTruthy();
    expect(opportunity).toHaveBeenCalledTimes(2);
  });
});
