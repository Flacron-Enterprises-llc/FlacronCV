import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type MatchResult, type OpportunityDetail } from '@flacroncv/career-api-client';
import type { JobApplication } from '@flacroncv/shared-types';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import type { JobTracker } from '@/lib/career/v1-jobs';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { OpportunityDetailScreen } from './OpportunityDetailScreen';
import { OpportunityScreen } from './OpportunityScreen';

const user: SignedInUser = { uid: 'ada', email: 'ada@example.test', emailVerified: true, getIdToken: async () => 'token' };

const listing: OpportunityDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'job',
  provider: 'adzuna',
  title: 'Ledger analyst',
  organization: 'Babbage Works',
  status: 'open',
  label: 'open',
  sourceUrl: 'https://example.test/adzuna/adz-1',
  checkedAt: '2026-10-16T00:00:00.000Z',
  deadline: '2026-12-01',
  locations: ['Remote'],
  arrangement: 'remote',
  remoteRestriction: 'US residents only',
  compensation: { minimum: null, maximum: null, currency: null, period: null },
  sponsorship: 'unknown',
  description: 'Keep the ledger.',
  saved: false,
  resumeAnalysis: { includedRemaining: 3, packRemaining: 0, renewalDate: null },
};

const scholarship: OpportunityDetail = {
  ...listing,
  id: '33333333-3333-4333-8333-333333333333',
  category: 'scholarship',
  title: 'Data Futures Award',
  arrangement: null,
  remoteRestriction: null,
  locations: ['Montreal'],
  details: {
    stipend: null, studentEligibility: null, funding: 'Full tuition', clientScope: null, duration: null,
    compensationBasis: null, eventDate: null, registration: null, eligibility: null,
  },
};

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    {node}
  </NextIntlClientProvider>
);

const nowMs = Date.parse('2026-10-17T00:00:00Z');

describe('opportunity search filters', () => {
  it('sends the chosen category and pay filter, says which filter was not applied, and shows a no-results state', async () => {
    const opportunities = vi.fn(async (query: Record<string, unknown>) =>
      query.category ? { items: [], notApplied: [{ filter: 'radiusMiles' as const, reason: 'no_place' as const }] } : { items: [] },
    );
    render(wrap(<OpportunityScreen api={testApi({ opportunities })} user={user} ready signInHref="/en/sign-in" locale="en" />));
    await screen.findByText('Search or paste a listing');
    fireEvent.change(screen.getByLabelText('Category', { selector: 'select' }), { target: { value: 'internship' } });
    fireEvent.change(screen.getByLabelText('Minimum stated pay'), { target: { value: '40000' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include expired listings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search listings' }));
    await waitFor(() => expect(opportunities).toHaveBeenLastCalledWith({ q: '', category: 'internship', minPay: 40000 }));
    expect(await screen.findByText('No listings')).toBeTruthy();
    expect(screen.getByText('The distance was not applied: add a place to measure from.')).toBeTruthy();
  });

  it('shows a scholarship by its funding and deadline, not by pay or sponsorship, and says remote is not worldwide', async () => {
    const opportunities = vi.fn(async () => ({ items: [scholarship, listing] }));
    render(wrap(<OpportunityScreen api={testApi({ opportunities })} user={user} ready signInHref="/en/sign-in" locale="en" />));
    expect(await screen.findByText('Full tuition')).toBeTruthy();
    expect(screen.getByText('Not stated in the listing: Eligibility')).toBeTruthy();
    expect(screen.getByText('US residents only')).toBeTruthy();
    expect(screen.queryByText(/Remote does not always mean worldwide/)).toBeNull();
  });
});

describe('opportunity detail actions', () => {
  function tracker(jobs: Partial<JobApplication>[] = []): JobTracker & { create: ReturnType<typeof vi.fn> } {
    return { list: vi.fn(async () => jobs as JobApplication[]), create: vi.fn(async () => ({}) as JobApplication) };
  }

  it('saves the listing and adds it to the Job Tracker once, as saved, with its source link and deadline', async () => {
    const saveOpportunity = vi.fn(async () => ({ opportunityId: listing.id, saved: true as const }));
    const jobs = tracker();
    render(
      wrap(
        <OpportunityDetailScreen
          api={testApi({ opportunity: vi.fn(async () => listing), saveOpportunity })}
          user={user}
          ready
          signInHref="/en/sign-in"
          opportunityId={listing.id}
          nowMs={nowMs}
          tracker={jobs}
        />,
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeTruthy();
    expect(saveOpportunity).toHaveBeenCalledWith(listing.id);
    fireEvent.click(screen.getByRole('button', { name: 'Track in Job Tracker' }));
    expect(await screen.findByText('Added to your Job Tracker as saved.')).toBeTruthy();
    expect(jobs.create).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'Babbage Works', position: 'Ledger analyst', jobUrl: listing.sourceUrl, status: 'saved', opportunityId: listing.id, deadline: '2026-12-01', jobDescriptionSource: 'opportunity' }),
    );
    expect(screen.getByRole('link', { name: 'Tailor a résumé for this listing' }).getAttribute('href')).toBe(`/en/career/documents?opportunityId=${listing.id}`);
    expect(screen.getByRole('link', { name: 'Build an action pack' }).getAttribute('href')).toBe(`/en/career/action-pack?opportunityId=${listing.id}`);
  });

  it('does not add a listing the tracker already holds', async () => {
    const jobs = tracker([{ id: 'j1', jobUrl: listing.sourceUrl, opportunityId: null, deletedAt: null }]);
    render(wrap(<OpportunityDetailScreen api={testApi({ opportunity: vi.fn(async () => listing) })} user={user} ready signInHref="/en/sign-in" opportunityId={listing.id} nowMs={nowMs} tracker={jobs} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Track in Job Tracker' }));
    expect(await screen.findByText('This listing is already in your Job Tracker.')).toBeTruthy();
    expect(jobs.create).not.toHaveBeenCalled();
  });

  it('lets the person choose the résumé, then shows qualification, preferences and unknowns separately with a label', async () => {
    const match: MatchResult = {
      id: 'm1', fit: 'strong', overlap: 0.8,
      reasons: [{ code: 'confirmed_overlap', factId: 's1', token: 'ledger' }],
      gaps: [{ code: 'credential_missing', token: 'CPA' }],
      unknowns: [{ code: 'pay' }],
      preferenceFit: [
        { dimension: 'location', status: 'meets', detail: 'remote' },
        { dimension: 'remote_restriction', status: 'check', detail: 'US residents only' },
        { dimension: 'pay', status: 'not_set' },
      ],
      label: 'stretch', labelReasons: ['skills_overlap', 'credential_missing'],
      profileVersion: 1, opportunityId: listing.id, opportunityRevisionId: 'rev', resumeVersionId: 'v2', createdAt: '2026-10-16T00:00:00.000Z',
    };
    const createMatch = vi.fn(async () => ({
      match,
      usage: { unit: 'resume_analysis', includedGranted: 3, includedRemaining: 2, packRemaining: 0, packHeld: 0, renewalDate: '2026-11-16T00:00:00.000Z', ledgerState: 'committed' },
      jobId: null,
      replayed: false,
    }));
    const resumes = vi.fn(async () => ({
      items: [
        { id: 'r1', title: 'General CV', language: 'en' as const, templateId: 'classic', createdAt: '2026-10-16T00:00:00.000Z', currentVersionId: 'v1' },
        { id: 'r2', title: 'Finance CV', language: 'en' as const, templateId: 'classic', createdAt: '2026-10-16T00:00:00.000Z', currentVersionId: 'v2' },
      ],
      documentCredit: { includedRemaining: 3, packRemaining: 0, renewalDate: null },
    }));
    render(wrap(<OpportunityDetailScreen api={testApi({ opportunity: vi.fn(async () => listing), resumes, createMatch })} user={user} ready signInHref="/en/sign-in" opportunityId={listing.id} nowMs={nowMs} tracker={tracker()} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Compare with my resume' }));
    fireEvent.change(await screen.findByLabelText('Résumé to compare'), { target: { value: 'v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 analysis' }));
    expect(await screen.findByRole('heading', { name: 'Stretch opportunity' })).toBeTruthy();
    expect(createMatch).toHaveBeenCalledWith({ opportunityId: listing.id, resumeVersionId: 'v2', mode: 'explicit' }, expect.any(String));
    expect(screen.getByText('Qualification fit')).toBeTruthy();
    expect(screen.getByText('The listing requires CPA, which is not in your confirmed certifications.')).toBeTruthy();
    expect(screen.getByText('Your preferences')).toBeTruthy();
    expect(screen.getByText(/Remote limit: “US residents only”/)).toBeTruthy();
    expect(screen.getByText('1 preference is not set, so it was not compared.')).toBeTruthy();
    expect(screen.getByText('Not stated or not confirmed')).toBeTruthy();
    expect(screen.queryByText('0.8')).toBeNull();
  });

  it('shows the plan that includes comparisons instead of a generic failure', async () => {
    const createMatch = vi.fn().mockRejectedValue(new ApiError(403, 'plan_upgrade_required', { code: 'plan_upgrade_required', feature: 'resumeAnalyses', minimumPlan: 'starter' }));
    const resumes = vi.fn(async () => ({
      items: [{ id: 'r1', title: 'CV', language: 'en' as const, templateId: 'classic', createdAt: '2026-10-16T00:00:00.000Z', currentVersionId: 'v1' }],
      documentCredit: { includedRemaining: 0, packRemaining: 0, renewalDate: null },
    }));
    render(wrap(<OpportunityDetailScreen api={testApi({ opportunity: vi.fn(async () => listing), resumes, createMatch })} user={user} ready signInHref="/en/sign-in" opportunityId={listing.id} nowMs={nowMs} tracker={tracker()} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Compare with my resume' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use 1 analysis' }));
    expect(await screen.findByText('Résumé comparisons start on the Starter plan. Nothing was used.')).toBeTruthy();
  });
});
