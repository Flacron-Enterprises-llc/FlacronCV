import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateSpecialistMode, LocationProfile, LocationProfileList } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { draftProblem, emptyDraft, RelocationModesScreen } from './RelocationModesScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const m = messages.career.career_modes;

const sampleLocation: LocationProfile = {
  id: 'loc-111',
  workspaceId: 'ws-111',
  candidateAuthUserId: 'ada',
  place: 'Austin, TX',
  radiusMiles: 25,
  kind: 'future',
  targetTimeline: '1_to_3_months',
  isRelocation: true,
  moveDate: '2027-03-01',
  availableFrom: null,
  remoteRegion: 'United States',
  workAuthorization: 'citizen',
  licenseTransfer: 'not_stated',
  commuteMinutesMax: 30,
  remoteFlexibility: 'hybrid',
  notes: 'Domain or Downtown',
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z',
};

const sampleLocationsResponse: LocationProfileList = { items: [sampleLocation], capacity: 2, allowedRadiusMiles: 50 };

const sampleSpecialistMode: CandidateSpecialistMode & { available: boolean } = {
  candidateAuthUserId: 'ada',
  workspaceId: 'ws-111',
  mode: 'veterans',
  modes: ['veterans'],
  focusAreas: [],
  customGuidelines: null,
  updatedAt: '2026-10-17T10:00:00.000Z',
  available: true,
};

function renderScreen(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <RelocationModesScreen api={api} user={user} ready signInHref="/en/sign-in" />
    </NextIntlClientProvider>,
  );
}

describe('RelocationModesScreen (CV14)', () => {
  it('starts a new place with work authorization and licence transfer "not stated"', () => {
    const draft = emptyDraft(50, 'future');
    expect(draft.workAuthorization).toBe('not_stated');
    expect(draft.licenseTransfer).toBe('not_stated');
    expect(draftProblem({ ...draft, place: 'X', moveDate: '2026-02-31' }, 50)).toBe('date_invalid');
    expect(draftProblem({ ...draft, place: 'X', radiusMiles: 75 }, 50)).toBe('radius_limit_exceeded');
  });

  it('shows the empty state with separate current and future actions', async () => {
    renderScreen(testApi({
      locations: vi.fn().mockResolvedValue({ items: [], capacity: 1, allowedRadiusMiles: 25 }),
      specialistMode: vi.fn().mockResolvedValue(sampleSpecialistMode),
    }));
    expect(await screen.findByText(m.no_locations_title)).toBeDefined();
    expect(screen.getByText(/Using 0 of 1 location profiles/)).toBeDefined();
    expect(screen.getByRole('button', { name: m.add_future })).toBeDefined();
  });

  it('lists future places with move date and a remote region distinct from the radius', async () => {
    renderScreen(testApi({
      locations: vi.fn().mockResolvedValue(sampleLocationsResponse),
      specialistMode: vi.fn().mockResolvedValue(sampleSpecialistMode),
    }));
    expect(await screen.findByRole('heading', { level: 4, name: 'Austin, TX' })).toBeDefined();
    expect(screen.getByText(m.group_future)).toBeDefined();
    expect(screen.getByText(/~25 miles/)).toBeDefined();
    expect(screen.getByText('United States')).toBeDefined();
    expect(screen.getByText(/Mar 1, 2027/)).toBeDefined();
    expect(screen.getByText(/≤ 30 min • Hybrid preferred/)).toBeDefined();
  });

  it('creates a place without assuming work authorization', async () => {
    const createLocation = vi.fn().mockResolvedValue({ ...sampleLocation, id: 'loc-222', place: 'Seattle, WA', kind: 'current' });
    renderScreen(testApi({
      locations: vi.fn().mockResolvedValue(sampleLocationsResponse),
      specialistMode: vi.fn().mockResolvedValue(sampleSpecialistMode),
      createLocation,
    }));
    fireEvent.click(await screen.findByRole('button', { name: m.add_current }));
    expect((screen.getByLabelText(m.field_work_auth) as HTMLSelectElement).value).toBe('not_stated');
    fireEvent.change(screen.getByLabelText(/Location \(City, State \/ Metro\)/i), { target: { value: 'Seattle, WA' } });
    // (An impossible date never reaches here: browsers clear it, and draftProblem refuses it, tested above.)
    fireEvent.change(screen.getByLabelText(m.field_move_date), { target: { value: '2027-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: m.save_location }));
    expect(createLocation).toHaveBeenCalledWith(
      expect.objectContaining({ place: 'Seattle, WA', kind: 'current', workAuthorization: 'not_stated', licenseTransfer: 'not_stated', moveDate: '2027-01-15' }),
    );
  });

  it('asks before deleting a place', async () => {
    const deleteLocation = vi.fn().mockResolvedValue({ success: true });
    renderScreen(testApi({
      locations: vi.fn().mockResolvedValue(sampleLocationsResponse),
      specialistMode: vi.fn().mockResolvedValue(sampleSpecialistMode),
      deleteLocation,
    }));
    fireEvent.click(await screen.findByRole('button', { name: m.delete }));
    expect(deleteLocation).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: m.delete }));
    expect(await screen.findByText(m.location_deleted_success)).toBeDefined();
    expect(deleteLocation).toHaveBeenCalledWith('loc-111');
  });

  it('selects several of the nine modes, shows their checklists, and saves them', async () => {
    const setSpecialistMode = vi.fn().mockResolvedValue({ ...sampleSpecialistMode, modes: ['veterans', 'military_spouses'] });
    renderScreen(testApi({
      locations: vi.fn().mockResolvedValue(sampleLocationsResponse),
      specialistMode: vi.fn().mockResolvedValue(sampleSpecialistMode),
      setSpecialistMode,
    }));
    fireEvent.click(await screen.findByRole('tab', { name: m.tab_specialist }));
    expect(screen.getByText(m.mode_students_graduates_name)).toBeDefined();
    expect(screen.getByText(m.mode_trades_licensed_name)).toBeDefined();
    expect(screen.getByText(m.check_translate_military_skills)).toBeDefined();
    fireEvent.click(screen.getByText(m.mode_military_spouses_name));
    expect(screen.getByText(m.check_moving_dates)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: m.save_specialist_mode }));
    expect(setSpecialistMode).toHaveBeenCalledWith({ modes: ['veterans', 'military_spouses'], customGuidelines: null });
  });

  it('shows the upgrade note when the plan has no specialist modes', async () => {
    renderScreen(testApi({
      locations: vi.fn().mockResolvedValue(sampleLocationsResponse),
      specialistMode: vi.fn().mockResolvedValue({ ...sampleSpecialistMode, modes: [], mode: null, available: false }),
    }));
    fireEvent.click(await screen.findByRole('tab', { name: m.tab_specialist }));
    expect(screen.getByText(m.upgrade_required_heading)).toBeDefined();
  });
});
