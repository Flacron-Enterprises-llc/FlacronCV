import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type {
  CandidateSpecialistMode,
  LocationProfile,
  LocationProfileList,
} from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { RelocationModesScreen } from './RelocationModesScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const sampleLocation: LocationProfile = {
  id: 'loc-111',
  workspaceId: 'ws-111',
  candidateAuthUserId: 'ada',
  place: 'Austin, TX',
  radiusMiles: 25,
  targetTimeline: '1_to_3_months',
  isRelocation: true,
  workAuthorization: 'citizen',
  commuteMinutesMax: 30,
  remoteFlexibility: 'hybrid',
  notes: 'Domain or Downtown',
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z',
};

const sampleLocationsResponse: LocationProfileList = {
  items: [sampleLocation],
  capacity: 2,
  allowedRadiusMiles: 50,
};

const sampleSpecialistMode: CandidateSpecialistMode = {
  candidateAuthUserId: 'ada',
  workspaceId: 'ws-111',
  mode: 'technical_engineering',
  focusAreas: ['Distributed Systems', 'Rust Async'],
  customGuidelines: 'Focus on consensus protocols.',
  updatedAt: '2026-10-17T10:00:00.000Z',
};

function renderScreen(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <RelocationModesScreen api={api} user={user} ready signInHref="/en/sign-in" />
    </NextIntlClientProvider>,
  );
}

describe('RelocationModesScreen (CV14)', () => {
  it('shows empty state when no location profiles exist', async () => {
    const api = testApi({
      locations: vi.fn().mockResolvedValue({
        items: [],
        capacity: 1,
        allowedRadiusMiles: 25,
      }),
      specialistMode: vi.fn().mockResolvedValue(sampleSpecialistMode),
    });
    renderScreen(api);

    expect(await screen.findByText('No location profiles configured')).toBeDefined();
    expect(screen.getByText(/Using 0 of 1 location profiles/)).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Add Location Profile' })[0]).toBeDefined();
  });

  it('renders configured location profile cards with relocation badges and details', async () => {
    const api = testApi({
      locations: vi.fn().mockResolvedValue(sampleLocationsResponse),
      specialistMode: vi.fn().mockResolvedValue(sampleSpecialistMode),
    });
    renderScreen(api);

    expect(await screen.findByRole('heading', { level: 3, name: 'Austin, TX' })).toBeDefined();
    expect(screen.getByText('Relocation Target')).toBeDefined();
    expect(screen.getByText(/~25 miles/)).toBeDefined();
    expect(screen.getByText(/1 to 3 Months/)).toBeDefined();
    expect(screen.getByText(/Citizen/)).toBeDefined();
    expect(screen.getByText(/≤ 30 min • Hybrid Preferred/)).toBeDefined();
  });

  it('creates a new location profile through the form', async () => {
    const createLocation = vi.fn().mockResolvedValue({
      ...sampleLocation,
      id: 'loc-222',
      place: 'Seattle, WA',
      radiusMiles: 50,
    });
    const api = testApi({
      locations: vi.fn().mockResolvedValue(sampleLocationsResponse),
      specialistMode: vi.fn().mockResolvedValue(sampleSpecialistMode),
      createLocation,
    });
    renderScreen(api);

    const addBtn = await screen.findByRole('button', { name: 'Add Location Profile' });
    fireEvent.click(addBtn);

    expect(screen.getByText('Add New Location or Relocation Destination')).toBeDefined();

    const placeInput = screen.getByLabelText(/Location \(City, State \/ Metro\)/i);
    fireEvent.change(placeInput, { target: { value: 'Seattle, WA' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Location Profile' }));

    expect(createLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        place: 'Seattle, WA',
      }),
    );
  });

  it('deletes a location profile when requested', async () => {
    const deleteLocation = vi.fn().mockResolvedValue({ success: true });
    const api = testApi({
      locations: vi.fn().mockResolvedValue(sampleLocationsResponse),
      specialistMode: vi.fn().mockResolvedValue(sampleSpecialistMode),
      deleteLocation,
    });
    renderScreen(api);

    const deleteBtn = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteBtn);

    expect(deleteLocation).toHaveBeenCalledWith('loc-111');
    expect(await screen.findByText('Location profile removed.')).toBeDefined();
  });

  it('switches to specialist mode tab and saves specialist configuration', async () => {
    const setSpecialistMode = vi.fn().mockResolvedValue({
      ...sampleSpecialistMode,
      mode: 'executive_leadership',
      customGuidelines: 'Focus on board interactions and revenue.',
    });
    const api = testApi({
      locations: vi.fn().mockResolvedValue(sampleLocationsResponse),
      specialistMode: vi.fn().mockResolvedValue(sampleSpecialistMode),
      setSpecialistMode,
    });
    renderScreen(api);

    const specialistTab = await screen.findByRole('button', { name: 'Specialist Career Modes' });
    fireEvent.click(specialistTab);

    expect(screen.getAllByText('Specialist Career Modes')[0]).toBeDefined();
    expect(screen.getByText('Technical & Engineering')).toBeDefined();
    expect(screen.getByText('Executive & Leadership')).toBeDefined();

    // Select Executive & Leadership
    const execBtn = screen.getByText('Executive & Leadership');
    fireEvent.click(execBtn);

    const guidelinesInput = screen.getByLabelText(/Custom Prompt Guidelines/i);
    fireEvent.change(guidelinesInput, {
      target: { value: 'Focus on board interactions and revenue.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Specialist Mode' }));

    expect(setSpecialistMode).toHaveBeenCalledWith({
      mode: 'executive_leadership',
      customGuidelines: 'Focus on board interactions and revenue.',
    });
  });
});
