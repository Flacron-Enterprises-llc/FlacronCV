import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type BusinessMemberships, type BusinessOverview, type PaidScope, type ScenarioResult } from '@flacroncv/career-api-client';
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

const CANDIDATE = '22222222-2222-4222-8222-222222222222';
const overview: BusinessOverview = {
  workspaceId: 'ws-own',
  role: 'owner',
  scope: { candidates: 'all', manageWorkspace: true, reports: true, billing: true, queue: true },
  staff: [],
  candidates: [{ id: CANDIDATE, email: 'person@example.test', status: 'active', inviteState: 'accepted', shareProfile: false, expiresAt: null, counselorIds: [] }],
  capacity: { staffSeats: 3, staffUsed: 0, activeCandidates: 50, candidatesUsed: 1 },
};
const memberships: BusinessMemberships = { ownsWorkspace: true, ownWorkspaceId: 'ws-own', staffOf: [], candidateOf: [] };
const businessApi = (extra: Parameters<typeof testApi>[0] = {}) =>
  testApi({
    businessMemberships: async () => memberships,
    businessOverview: async () => overview,
    businessQueue: async () => ({ items: [] }),
    businessUsage: async () => ({ units: [], seats: overview.capacity, invoices: [] }),
    businessReport: async () => ({
      candidates: { invited: 0, active: 1, archived: 0 },
      staff: { manager: 0, counselor: 0, billing_admin: 0 },
      assignments: 0,
      sharingCandidates: 0,
      queue: { open: 0, recommended: 0, closed: 0 },
    }),
    ...extra,
  });

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

  it('starts with empty routes, asks before using the credit with the balance, and labels each figure by its source', async () => {
    const pending = gate<PaidScope<ScenarioResult>>();
    const createScenario = vi.fn(() => pending.promise);
    renderMode('scenarios', testApi({
      createScenario,
      scenarios: async () => ({ items: [], remaining: 3 }),
      locations: async () => ({ items: [], capacity: 1, allowedRadiusMiles: 25 }),
      skillReports: async () => { throw new ApiError(403, 'plan_upgrade_required', { code: 'plan_upgrade_required' }); },
    }));
    expect(((await screen.findByLabelText('Route name')) as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByText('Enter a name and a destination for at least one route.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Route name'), { target: { value: 'Move' } });
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Lyon' } });
    fireEvent.change(screen.getByLabelText('Expected yearly pay'), { target: { value: '48000' } });
    fireEvent.change(screen.getByLabelText('Figures come from'), { target: { value: 'market' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByText(messages.career.scope.scenario_market_needs_source)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Source name'), { target: { value: 'INSEE' } });
    fireEvent.change(screen.getByLabelText('Source date'), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(createScenario).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/You have 3 left; 2 after this/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use 1 comparison' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use 1 comparison' }));
    expect(createScenario).toHaveBeenCalledTimes(1);
    expect(createScenario).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'Move', destination: 'Lyon', costCents: null, months: null, wageCents: 4_800_000, source: 'market', sourceName: 'INSEE', sourceDate: '2026-06-30' })],
      expect.any(String),
      { title: undefined },
    );
    const base = { requirements: null, locationProfileId: null, skillReportId: null, uncertainty: 'unknown' as const };
    pending.resolve({
      ...paid,
      result: {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Move / Stay',
        tradeoff: 'server text',
        locationProfileIds: [],
        skillReportIds: [],
        createdAt: '2026-11-14T10:00:00Z',
        updatedAt: '2026-11-14T10:00:00Z',
        options: [
          { ...base, name: 'Move', costCents: null, months: null, destination: 'Lyon', wageCents: 4_800_000, wageLabel: 'market_data', source: 'market', sourceName: 'INSEE', sourceDate: '2026-06-30' },
          { ...base, name: 'Stay', costCents: 0, months: 12, destination: 'Leeds', wageCents: null, wageLabel: 'unknown', source: 'user', sourceName: null, sourceDate: null },
        ],
      },
    });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('48,000')).toBeTruthy();
    expect(within(table).getByText('Market data')).toBeTruthy();
    expect(within(table).getAllByText('Pay unknown').length).toBeGreaterThan(0);
    expect(within(table).getByText('Leeds')).toBeTruthy();
    expect(screen.queryByText('server text')).toBeNull();
    // The new comparison is listed and can be reopened.
    expect(screen.getByText('Move / Stay')).toBeTruthy();
  });

  it('reopens a saved comparison and saves edited assumptions without a charge', async () => {
    const saved: ScenarioResult = {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Stay or go',
      tradeoff: 't',
      locationProfileIds: [],
      skillReportIds: [],
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
      options: [{ name: 'Stay', costCents: 0, months: 12, destination: 'Leeds', wageCents: null, wageLabel: 'unknown', source: 'user', sourceName: null, sourceDate: null, uncertainty: 'unknown', requirements: null, locationProfileId: null, skillReportId: null }],
    };
    const updateScenario = vi.fn(async () => ({ ...saved, options: [{ ...saved.options[0], months: 6 }] }));
    const createScenario = vi.fn();
    renderMode('scenarios', testApi({
      scenarios: async () => ({ items: [saved], remaining: 0 }),
      locations: async () => ({ items: [], capacity: 1, allowedRadiusMiles: 25 }),
      skillReports: async () => ({ items: [], skillReport: { includedRemaining: 0, packRemaining: 0, renewalDate: null } }),
      updateScenario,
      createScenario,
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect((screen.getByLabelText('Route name') as HTMLInputElement).value).toBe('Stay');
    fireEvent.change(screen.getByLabelText('Months'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: messages.career.scope.scenario_save_edits }));
    expect(await screen.findByText(messages.career.scope.scenario_updated)).toBeTruthy();
    expect(updateScenario).toHaveBeenCalledWith(saved.id, expect.objectContaining({ options: [expect.objectContaining({ months: 6 })] }));
    expect(createScenario).not.toHaveBeenCalled();
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

  it('shows the map as coming soon without a session button while no tiles are connected, and keeps the list', async () => {
    const startMap = vi.fn();
    renderMode('map', testApi({
      mapOpportunities: async () => ({ items: [{ id: 'job-1', title: 'Analyst', approximate: true, coordinates: null }], tiles: null, attribution: null, provider: null, available: false }),
      startMap,
    }));
    expect(await screen.findByText('Analyst')).toBeTruthy();
    expect(screen.getByText(messages.career.scope.map_soon_body)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start 15 minutes' })).toBeNull();
    expect(startMap).not.toHaveBeenCalled();
  });

  it('adds goals and credentials, refuses impossible dates, and confirms a promotion only on request', async () => {
    const addCredential = vi.fn(async (name: string, expiresOn: string) => ({
      id: 'cred-2', name, expiresOn, due: false, issuer: '', region: '', reviewOn: null, factId: null, evidenceId: null,
    }));
    const confirmPromotion = vi.fn(async () => ({ id: 'goal-0', desiredTitle: 'Team lead', targetDate: null, status: 'confirmed' as const, confirmedFactId: 'f1', confirmedAt: '2026-11-14T10:00:00Z' }));
    renderMode('maintenance', testApi({
      maintenance: async () => ({
        achievements: [],
        promotionGoals: [{ id: 'goal-0', desiredTitle: 'Team lead', targetDate: null, status: 'open', confirmedFactId: null, confirmedAt: null }],
        credentials: [{ id: 'cred-1', name: 'First aid', expiresOn: '2026-11-01', due: true, issuer: '', region: '', reviewOn: null, factId: null, evidenceId: null }],
        reminders: [{ credentialId: 'cred-1', name: 'First aid', issuer: '', region: '', kind: 'expiry', date: '2026-11-01', daysLeft: -13, expired: true }],
      }),
      facts: async () => ({ items: [], profileVersion: 0 }),
      evidence: async () => ({ items: [] }),
      addPromotionGoal: async (desiredTitle: string) => ({ id: 'goal-1', desiredTitle, targetDate: null, status: 'open' as const, confirmedFactId: null, confirmedAt: null }),
      addCredential,
      confirmPromotion,
    }));
    expect(await screen.findByText('Team lead')).toBeTruthy();
    expect(screen.getAllByText('First aid').length).toBeGreaterThan(0);
    expect(screen.getByText('Renew soon')).toBeTruthy();
    expect(screen.getByText(/Expired on/)).toBeTruthy();
    const goal = screen.getByLabelText('Promotion goal') as HTMLInputElement;
    fireEvent.change(goal, { target: { value: 'Staff engineer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
    expect(await screen.findByText('Staff engineer')).toBeTruthy();
    expect(goal.value).toBe('');
    fireEvent.change(screen.getByLabelText('Credential'), { target: { value: 'Forklift' } });
    const date = screen.getByLabelText('Expires on') as HTMLInputElement;
    expect(date.type).toBe('date');
    fireEvent.change(date, { target: { value: '2027-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save credential' }));
    expect(await screen.findByText('Forklift saved.')).toBeTruthy();
    expect(addCredential).toHaveBeenCalledWith('Forklift', '2027-12-31', expect.objectContaining({ name: 'Forklift', expiresOn: '2027-12-31' }));
    // The promotion is never confirmed without an explicit choice.
    fireEvent.click(screen.getAllByRole('button', { name: messages.career.scope.promotion_got_it })[0]);
    fireEvent.click(screen.getByRole('button', { name: messages.career.scope.promotion_confirm_go }));
    expect(await screen.findByText(messages.career.scope.promotion_need_role)).toBeTruthy();
    expect(confirmPromotion).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(messages.career.scope.promotion_company), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: messages.career.scope.promotion_confirm_go }));
    expect(await screen.findByText(messages.career.scope.promotion_confirmed)).toBeTruthy();
    expect(confirmPromotion).toHaveBeenCalledWith('goal-0', { company: 'Acme', startDate: null });
  });

  it('shows human review as coming soon with its button disabled', async () => {
    const bookHumanService = vi.fn();
    renderMode('services', testApi({
      humanServices: async () => ({
        items: [{ id: 'review-not-open', name: 'Named review desk', scope: 'A person reviews selected material', priceCents: null, bookingOpen: false, note: 'server note' }],
      }),
      bookHumanService,
    }));
    expect(await screen.findByText(messages.career.scope.services_soon_body)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Request a booking' }) as HTMLButtonElement).disabled).toBe(true);
    expect(bookHumanService).not.toHaveBeenCalled();
  });

  it('loads the saved opt-in and shows only a count of opted-in people', async () => {
    renderMode('recruiting', testApi({
      recruitingOptIn: async () => ({ discoverable: true }),
      recruitingSearch: async () => ({ count: 1 }),
    }));
    expect(((await screen.findByRole('checkbox')) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: messages.career.scope.count_opt_ins }));
    expect(await screen.findByText('1 person has opted in.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('@');
  });

  it('explains the Business plan to someone with no workspace role', async () => {
    renderMode('business', testApi({ businessMemberships: async () => ({ ownsWorkspace: false, ownWorkspaceId: 'ws', staffOf: [], candidateOf: [] }) }), 'professional');
    expect(await screen.findByText(messages.career.scope.business_plan_title)).toBeTruthy();
  });

  it('opens candidates from the list and explains a refusal beside the list', async () => {
    renderMode('business', businessApi({
      businessCandidate: async () => {
        throw new ApiError(403, 'permission_denied', { code: 'permission_denied' });
      },
    }), 'business');
    expect((await screen.findAllByText('person@example.test')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Open candidate' }));
    expect(await screen.findByText(messages.career.scope.permission_body)).toBeTruthy();
  });

  it('invites staff by email and shows a copyable link while email is not connected', async () => {
    const inviteStaff = vi.fn(async () => ({ id: 's1', invitePath: '/career/business/join?token=bst_abc', expiresAt: '2026-11-28T10:00:00Z', delivered: false }));
    renderMode('business', businessApi({ inviteStaff }), 'business');
    const emails = await screen.findAllByLabelText(messages.career.scope.email);
    fireEvent.change(emails[emails.length - 1], { target: { value: 'coach@example.test' } });
    fireEvent.change(screen.getByLabelText(messages.career.scope.staff_role), { target: { value: 'billing_admin' } });
    expect(screen.getByText(messages.career.scope.role_billing_admin_scope)).toBeTruthy();
    const invites = screen.getAllByRole('button', { name: messages.career.scope.invite });
    fireEvent.click(invites[invites.length - 1]);
    expect(await screen.findByText(/bst_abc/)).toBeTruthy();
    expect(screen.getByText(/Email is not connected yet/)).toBeTruthy();
    expect(inviteStaff).toHaveBeenCalledWith('coach@example.test', 'billing_admin', undefined);
  });

  it('shows the staff allowance message beside the invite', async () => {
    renderMode('business', businessApi({
      inviteStaff: async () => {
        throw new ApiError(409, 'capacity_exceeded', { code: 'capacity_exceeded', field: 'staffSeats', limit: 3 });
      },
    }), 'business');
    const emails = await screen.findAllByLabelText(messages.career.scope.email);
    fireEvent.change(emails[emails.length - 1], { target: { value: 'x@example.test' } });
    const invites = screen.getAllByRole('button', { name: messages.career.scope.invite });
    fireEvent.click(invites[invites.length - 1]);
    expect(await screen.findByText(messages.career.scope.quota_body)).toBeTruthy();
  });

  it('enables only the developer actions the account has, loads the saved brand, and creates a test key', async () => {
    const pending = gate<{ id: string; token: string; prefix: string; environment: 'test' | 'live' }>();
    const createDeveloperKey = vi.fn(() => pending.promise);
    renderMode('developer', testApi({
      developerStatus: async () => ({ apiPackage: true, whiteLabel: false, brand: { brandName: 'North', attribution: 'Source: FlacronCV' }, keys: [], rateLimits: { test: 30, live: 120 } }),
      createDeveloperKey,
    }));
    expect(((await screen.findByLabelText('Brand name')) as HTMLInputElement).value).toBe('North');
    expect((screen.getByRole('button', { name: 'Save brand' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(messages.career.scope.white_label_missing)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create an API key' }));
    expect(createDeveloperKey).toHaveBeenCalledWith('test');
    expect(screen.queryByText(/Copy this key now/)).toBeNull();
    pending.resolve({ id: 'key-1', token: 'flc_test_once', prefix: 'flc_test_once', environment: 'test' });
    expect(await screen.findByText('flc_test_once')).toBeTruthy();
  });

});
