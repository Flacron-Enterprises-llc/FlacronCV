import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type PaidScope, type ScenarioResult } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { ScopeScreen, type ScopeMode } from './ScopeScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

function renderMode(mode: ScopeMode, api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ScopeScreen mode={mode} api={api} user={user} ready signInHref="/en/sign-in" />
    </NextIntlClientProvider>,
  );
}

function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const paid = {
  usage: { unit: 'scenario_report', includedRemaining: 0, packRemaining: 0, renewalDate: '2026-11-01', ledgerState: 'committed' },
  jobId: 'job-1',
  replayed: false,
};

describe('ScopeScreen', () => {
  it('says a switched-off tool is not open yet instead of offering a retry', async () => {
    const off = async () => {
      throw new ApiError(403, 'feature_unavailable', { code: 'feature_unavailable', feature: 'mapSessions' });
    };
    renderMode('map', testApi({ mapOpportunities: off }));
    expect(await screen.findByText('This tool is not open yet')).toBeTruthy();
    expect(screen.queryByText('This page could not be loaded')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('shows unknown pay only after the comparison is saved', async () => {
    const pending = gate<PaidScope<ScenarioResult>>();
    const createScenario = vi.fn(() => pending.promise);
    renderMode('scenarios', testApi({ createScenario }));
    fireEvent.click(await screen.findByRole('button', { name: 'Compare' }));
    expect(screen.queryByText('Pay unknown')).toBeNull();
    pending.resolve({
      ...paid,
      result: {
        id: '11111111-1111-4111-8111-111111111111',
        tradeoff: 'This is not a promise of earnings or employment.',
        options: [{ name: 'Stay', costCents: 0, months: 12, destination: 'London', wageCents: null, wageLabel: 'unknown', source: 'user' }],
      },
    });
    expect(await screen.findByText('Pay unknown')).toBeTruthy();
    expect(screen.getByText('This is not a promise of earnings or employment.')).toBeTruthy();
  });

  it('shows the observed interview rate from the recorded sample', async () => {
    renderMode('loop', testApi({
      learningLoop: async () => ({
        sampleSize: 11,
        recordedApplications: 10,
        unrecorded: 1,
        noResponse: 8,
        interviews: 2,
        offers: 1,
        interviewRatePercent: 20,
        statement: '2 interviews from 10 recorded applications is a 20 percent observed interview rate in that sample, not a future hiring probability.',
        suggestion: null,
        level: 'breakdowns',
      }),
    }));
    expect(await screen.findByText(/20 percent observed interview rate/)).toBeTruthy();
  });

  it('says the form was not sent only after review', async () => {
    const pending = gate<{ id: string; externalSubmitted: false; message: string }>();
    const fill = gate<{
      site: string;
      submit: false;
      extension: 'unpacked_local';
      distribution: 'unpublished';
      fields: Record<string, string>;
      message: string;
    }>();
    renderMode('forms', testApi({
      createForm: async () => ({ ...paid, result: { id: 'form-1', site: 'example-jobs.test', externalSubmitted: false, reviewed: false } }),
      reviewForm: () => pending.promise,
      fillForm: () => fill.promise,
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare the form' }));
    fireEvent.click(await screen.findByRole('button', { name: 'I reviewed it' }));
    const fillMessage =
      'A local unpacked Chrome extension can fill this site after you start it. FlacronCV does not send the form. Other sites and a store listing are not published.';
    expect(screen.queryByText(fillMessage)).toBeNull();
    pending.resolve({ id: 'form-1', externalSubmitted: false, message: 'FlacronCV does not send this form.' });
    fill.resolve({
      site: 'example-jobs.test',
      submit: false,
      extension: 'unpacked_local',
      distribution: 'unpublished',
      fields: { full_name: '', email: '', phone: '', notes: '' },
      message: fillMessage,
    });
    expect(await screen.findByText(fillMessage)).toBeTruthy();
  });

  it('keeps the listing list when the map allowance is used up', async () => {
    renderMode('map', testApi({
      mapOpportunities: async () => ({ items: [{ id: 'job-1', title: 'Analyst', approximate: true, coordinates: null }], tiles: null, attribution: null, provider: null }),
      startMap: async () => {
        throw new ApiError(402, 'quota_exhausted', { code: 'quota_exhausted', unit: 'map_session', remaining: 0 });
      },
    }));
    expect(await screen.findByText('Analyst')).toBeTruthy();
    expect(screen.getByText(/No map tiles are connected/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start 15 minutes' }));
    expect(await screen.findByText('The allowance is used up')).toBeTruthy();
    expect(screen.getByText('Analyst')).toBeTruthy();
    expect(screen.queryByText(/This session is/)).toBeNull();
  });

  it('saves a promotion goal without calling it a confirmed fact', async () => {
    const pending = gate<{ id: string; desiredTitle: string }>();
    renderMode('maintenance', testApi({
      maintenance: async () => ({
        achievements: [],
        promotionGoals: [],
        credentials: [{ id: 'cred-1', name: 'First aid', expiresOn: '2026-11-01', due: true }],
      }),
      addPromotionGoal: () => pending.promise,
    }));
    expect(await screen.findByText('First aid is due within 90 days')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
    expect(screen.queryByText(/not a confirmed fact/)).toBeNull();
    pending.resolve({ id: 'goal-1', desiredTitle: 'Staff engineer' });
    expect(await screen.findByText(/not a confirmed fact/)).toBeTruthy();
  });

  it('keeps booking closed and does not show a purchased review', async () => {
    const bookHumanService = vi.fn(async () => {
      throw new ApiError(409, 'not_purchasable', { code: 'not_purchasable' });
    });
    renderMode('services', testApi({
      humanServices: async () => ({
        items: [{ id: 'review-not-open', name: 'Named review desk', scope: 'A person reviews selected material', priceCents: null, bookingOpen: false, note: 'This is not AI feedback. Booking stays closed until commercial terms are set.' }],
      }),
      bookHumanService,
    }));
    expect(await screen.findByText(/This is not AI feedback/)).toBeTruthy();
    expect(screen.queryByText('This is not for sale')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Request a booking' }));
    expect(await screen.findByText('This is not for sale')).toBeTruthy();
    expect(bookHumanService).toHaveBeenCalledWith('review-not-open');
  });

  it('lists an opted-in label and not an email', async () => {
    renderMode('recruiting', testApi({
      recruitingSearch: async () => ({ items: [{ candidateAuthUserId: 'ada', label: 'Opted-in candidate' }] }),
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Search opted-in people' }));
    expect(await screen.findByText('Opted-in candidate')).toBeTruthy();
    expect(document.body.textContent).not.toContain('@');
  });

  it('hides a candidate the counselor is not assigned to', async () => {
    renderMode('business', testApi({
      businessCandidate: async () => {
        throw new ApiError(403, 'permission_denied', { code: 'permission_denied' });
      },
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open candidate' }));
    expect(await screen.findByText('This record is not available')).toBeTruthy();
  });

  it('keeps three routes and sends one comparison when Compare is clicked twice', async () => {
    const pending = gate<PaidScope<ScenarioResult>>();
    const createScenario = vi.fn(() => pending.promise);
    renderMode('scenarios', testApi({ createScenario }));
    const add = await screen.findByRole('button', { name: 'Add a route' });
    fireEvent.click(add);
    fireEvent.click(add);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByLabelText(/Route/)).toHaveLength(3);
    const compare = screen.getByRole('button', { name: 'Compare' });
    fireEvent.click(compare);
    fireEvent.click(compare);
    expect(createScenario).toHaveBeenCalledTimes(1);
    pending.resolve({
      ...paid,
      result: {
        id: '11111111-1111-4111-8111-111111111111',
        tradeoff: 'This is not a promise of earnings or employment.',
        options: [{ name: 'Stay', costCents: 0, months: 12, destination: 'London', wageCents: null, wageLabel: 'unknown', source: 'user' }],
      },
    });
    expect(await screen.findByText('Pay unknown')).toBeTruthy();
  });

  it('shows the staff allowance message after the seat is refused', async () => {
    renderMode('business', testApi({
      addStaff: async () => {
        throw new ApiError(409, 'capacity_exceeded', { code: 'capacity_exceeded', field: 'staffSeats', limit: 3 });
      },
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add staff' }));
    expect(await screen.findByText('The allowance is used up')).toBeTruthy();
  });

  it('shows an API key only after it is created', async () => {
    const pending = gate<{ id: string; token: string; prefix: string }>();
    renderMode('developer', testApi({ createDeveloperKey: () => pending.promise }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create an API key' }));
    expect(screen.queryByText(/Copy this key now/)).toBeNull();
    pending.resolve({ id: 'key-1', token: 'flc_once', prefix: 'flc_once' });
    expect(await screen.findByText(/flc_once/)).toBeTruthy();
  });
});
