import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type PaidScope, type ScenarioResult } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { ScopeScreen, type ScopeMode } from './ScopeScreen';
import { payToCents } from './ScenariosPanel';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

function renderMode(mode: ScopeMode, api = testApi(), careerPlan?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ScopeScreen mode={mode} api={api} user={user} ready signInHref="/en/sign-in" careerPlan={careerPlan} />
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

const overview = { staff: [], candidates: [{ id: '22222222-2222-4222-8222-222222222222', email: 'person@example.test' }] };

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

  it('converts whole-currency pay to cents and refuses text', () => {
    expect(payToCents('55,000')).toBe(5_500_000);
    expect(payToCents(' ')).toBeNull();
    expect(Number.isNaN(payToCents('lots'))).toBe(true);
  });

  it('starts with empty routes, asks before using the credit, and shows a result table', async () => {
    const pending = gate<PaidScope<ScenarioResult>>();
    const createScenario = vi.fn(() => pending.promise);
    renderMode('scenarios', testApi({ createScenario }));
    expect(((await screen.findByLabelText('Route name')) as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByText('Enter a name and a destination for at least one route.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Route name'), { target: { value: 'Move' } });
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Lyon' } });
    fireEvent.change(screen.getByLabelText('Expected yearly pay'), { target: { value: '48000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(createScenario).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use 1 comparison' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use 1 comparison' }));
    expect(createScenario).toHaveBeenCalledTimes(1);
    expect(createScenario).toHaveBeenCalledWith(
      [{ name: 'Move', destination: 'Lyon', costCents: 0, months: 12, wageCents: 4_800_000, source: 'user' }],
      expect.any(String),
    );
    pending.resolve({
      ...paid,
      result: {
        id: '11111111-1111-4111-8111-111111111111',
        tradeoff: 'server text',
        options: [
          { name: 'Move', costCents: 0, months: 12, destination: 'Lyon', wageCents: 4_800_000, wageLabel: 'user_supplied', source: 'user' },
          { name: 'Stay', costCents: 0, months: 12, destination: 'Leeds', wageCents: null, wageLabel: 'unknown', source: 'user' },
        ],
      },
    });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('48,000')).toBeTruthy();
    expect(within(table).getByText('Pay unknown')).toBeTruthy();
    expect(within(table).getByText('Leeds')).toBeTruthy();
    expect(screen.queryByText('server text')).toBeNull();
  });

  it('words the observed interview rate on the client', async () => {
    renderMode('loop', testApi({
      learningLoop: async () => ({
        sampleSize: 11,
        recordedApplications: 10,
        unrecorded: 1,
        noResponse: 8,
        interviews: 2,
        offers: 1,
        interviewRatePercent: 20,
        statement: 'server sentence',
        suggestion: null,
        level: 'breakdowns',
      }),
    }));
    expect(await screen.findByText(/2 interviews from 10 recorded applications: a 20% observed interview rate/)).toBeTruthy();
    expect(screen.queryByText('server sentence')).toBeNull();
  });

  it('shows form filling as coming soon without test-site internals', async () => {
    renderMode('forms');
    expect(await screen.findByText('Form filling is coming soon')).toBeTruthy();
    expect(document.body.textContent).not.toContain('example-jobs.test');
    expect(document.body.textContent).not.toMatch(/unpacked|Chrome extension/i);
  });

  it('asks before a map session and keeps the list when the allowance is used up', async () => {
    renderMode('map', testApi({
      mapOpportunities: async () => ({ items: [{ id: 'job-1', title: 'Analyst', approximate: true, coordinates: null }], tiles: null, attribution: null, provider: null }),
      startMap: async () => {
        throw new ApiError(402, 'quota_exhausted', { code: 'quota_exhausted', unit: 'map_session', remaining: 0 });
      },
    }));
    expect(await screen.findByText('Analyst')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start 15 minutes' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Start 15 minutes' }));
    expect(await screen.findByText(messages.career.scope.quota_used_body)).toBeTruthy();
    expect(screen.getByText('Analyst')).toBeTruthy();
  });

  it('lists saved goals and every credential, confirms saves and clears the inputs', async () => {
    const addCredential = vi.fn(async (name: string, expiresOn: string) => ({ id: 'cred-2', name, expiresOn, due: false }));
    renderMode('maintenance', testApi({
      maintenance: async () => ({
        achievements: [],
        promotionGoals: [{ id: 'goal-0', desiredTitle: 'Team lead' }],
        credentials: [{ id: 'cred-1', name: 'First aid', expiresOn: '2026-11-01', due: true }],
      }),
      addPromotionGoal: async (desiredTitle: string) => ({ id: 'goal-1', desiredTitle }),
      addCredential,
    }));
    expect(await screen.findByText('Team lead')).toBeTruthy();
    expect(screen.getByText('First aid')).toBeTruthy();
    expect(screen.getByText('Renew soon')).toBeTruthy();
    const goal = screen.getByLabelText('Promotion goal') as HTMLInputElement;
    fireEvent.change(goal, { target: { value: 'Staff engineer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
    expect(await screen.findByText('Staff engineer')).toBeTruthy();
    expect(screen.getByText(/not a confirmed fact/)).toBeTruthy();
    expect(goal.value).toBe('');
    fireEvent.change(screen.getByLabelText('Credential'), { target: { value: 'Forklift' } });
    const date = screen.getByLabelText('Expires on') as HTMLInputElement;
    expect(date.type).toBe('date');
    fireEvent.change(date, { target: { value: '2027-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save credential' }));
    expect(await screen.findByText('Forklift saved.')).toBeTruthy();
    expect(addCredential).toHaveBeenCalledWith('Forklift', '2027-12-31');
    expect(screen.getByText('Forklift')).toBeTruthy();
    expect(date.value).toBe('');
  });

  it('shows a closed booking as closed with its button disabled', async () => {
    const bookHumanService = vi.fn();
    renderMode('services', testApi({
      humanServices: async () => ({
        items: [{ id: 'review-not-open', name: 'Named review desk', scope: 'A person reviews selected material', priceCents: null, bookingOpen: false, note: 'server note' }],
      }),
      bookHumanService,
    }));
    expect(await screen.findByText('Closed')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Request a booking' }) as HTMLButtonElement).disabled).toBe(true);
    expect(bookHumanService).not.toHaveBeenCalled();
  });

  it('loads the saved opt-in and counts opted-in people without showing an email', async () => {
    renderMode('recruiting', testApi({
      recruitingOptIn: async () => ({ discoverable: true }),
      recruitingSearch: async () => ({ items: [{ candidateAuthUserId: 'ada', label: 'Opted-in candidate' }] }),
    }));
    expect(((await screen.findByRole('checkbox')) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Search opted-in people' }));
    expect(await screen.findByText('1 person has opted in.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('@');
  });

  it('sends a non-Business plan to the plans page instead of a workspace it cannot use', async () => {
    const businessOverview = vi.fn();
    renderMode('business', testApi({ businessOverview }), 'professional');
    expect(await screen.findByText(messages.career.scope.business_plan_title)).toBeTruthy();
    expect(businessOverview).not.toHaveBeenCalled();
  });

  it('opens candidates from the list and explains a refusal beside the list', async () => {
    renderMode('business', testApi({
      businessOverview: async () => overview,
      businessCandidate: async () => {
        throw new ApiError(403, 'permission_denied', { code: 'permission_denied' });
      },
    }), 'business');
    expect((await screen.findAllByText('person@example.test')).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/Candidate id/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open candidate' }));
    expect(await screen.findByText(messages.career.scope.permission_body)).toBeTruthy();
  });

  it('shows the staff allowance message beside Add staff', async () => {
    renderMode('business', testApi({
      businessOverview: async () => overview,
      addStaff: async () => {
        throw new ApiError(409, 'capacity_exceeded', { code: 'capacity_exceeded', field: 'staffSeats', limit: 3 });
      },
    }), 'business');
    fireEvent.change(await screen.findByLabelText(messages.career.scope.staff_user), { target: { value: 'uid-1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add staff' })[0]);
    expect(await screen.findByText(messages.career.scope.quota_body)).toBeTruthy();
  });

  it('enables only the developer actions the account has, and loads the saved brand', async () => {
    const pending = gate<{ id: string; token: string; prefix: string }>();
    renderMode('developer', testApi({
      developerStatus: async () => ({ apiPackage: true, whiteLabel: false, brand: { brandName: 'North', attribution: 'Source: FlacronCV' } }),
      createDeveloperKey: () => pending.promise,
    }));
    expect(((await screen.findByLabelText('Brand name')) as HTMLInputElement).value).toBe('North');
    expect((screen.getByRole('button', { name: 'Save brand' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(messages.career.scope.white_label_missing)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create an API key' }));
    expect(screen.queryByText(/Copy this key now/)).toBeNull();
    pending.resolve({ id: 'key-1', token: 'flc_once', prefix: 'flc_once' });
    expect(await screen.findByText(/flc_once/)).toBeTruthy();
  });
});
