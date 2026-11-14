import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { ApiError } from '@flacroncv/career-api-client';
import { JobStatus, normalizeJobApplication } from '@flacroncv/shared-types';
import en from '../../../public/locales/en/common.json';
import JobBoard from './JobBoard';
import ApplicationDrafts from './ApplicationDrafts';

let switchOn = false;
let access: { data?: { enabled: boolean } } = {};
const createWriting = vi.fn();
vi.mock('@/components/career/CareerServices', () => ({
  isCareerEnabled: () => switchOn,
  useCareerAccess: () => access,
  useCareerApi: () => ({ createWriting }),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const job = (id: string, status: string) =>
  normalizeJobApplication({
    id,
    userId: 'u1',
    company: 'Acme',
    position: `Role ${id}`,
    status,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    deletedAt: null,
  });

function wrap(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

const actions = () => ({
  onEdit: vi.fn(),
  onArchive: vi.fn(),
  onDelete: vi.fn(),
  onStatus: vi.fn(),
  onChecklist: vi.fn(),
  onCalendar: vi.fn(),
  onRefreeze: vi.fn(),
});

afterEach(() => {
  switchOn = false;
  access = {};
  createWriting.mockReset();
});

describe('JobBoard', () => {
  it('shows one column per stage with counts, legacy statuses included', () => {
    wrap(
      <JobBoard
        jobs={[job('a', 'wishlist'), job('b', 'offer'), job('c', 'withdrawn')]}
        cvTitles={new Map()}
        letterTitles={new Map()}
        busyId={null}
        {...actions()}
      />,
    );
    for (const name of ['Saved', 'Preparing', 'Applied', 'Interviewing', 'Offered', 'Rejected', 'Withdrawn']) {
      expect(screen.getByRole('heading', { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    expect(screen.getAllByText('Nothing here yet')).toHaveLength(4);
  });

  it('moves a card with the select (keyboard / touch path)', () => {
    const a = actions();
    wrap(<JobBoard jobs={[job('a', 'saved')]} cvTitles={new Map()} letterTitles={new Map()} busyId={null} {...a} />);
    fireEvent.change(screen.getByLabelText('Stage of Role a'), { target: { value: 'applied' } });
    expect(a.onStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), JobStatus.APPLIED);
  });

  it('moves a card by drag and drop', () => {
    const a = actions();
    wrap(<JobBoard jobs={[job('a', 'saved')]} cvTitles={new Map()} letterTitles={new Map()} busyId={null} {...a} />);
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      get types() {
        return [...data.keys()];
      },
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(screen.getByText('Role a').closest('[draggable]')!, { dataTransfer });
    const column = screen.getByRole('heading', { name: /^Interviewing/ }).closest('section')!;
    fireEvent.dragOver(column, { dataTransfer });
    fireEvent.drop(column, { dataTransfer });
    expect(a.onStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), JobStatus.INTERVIEWING);
  });
});

describe('ApplicationDrafts', () => {
  it('renders nothing when the career switch is off or there is no career access', () => {
    const { container, rerender } = wrap(<ApplicationDrafts job={job('a', 'saved')} />);
    expect(container.textContent).toBe('');
    switchOn = true;
    access = { data: { enabled: false } };
    rerender(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ApplicationDrafts job={job('a', 'saved')} />
      </NextIntlClientProvider>,
    );
    expect(container.textContent).toBe('');
  });

  it('creates a referral draft and keeps the idempotency key across a lost response', async () => {
    switchOn = true;
    access = { data: { enabled: true } };
    createWriting
      .mockRejectedValueOnce(new ApiError(0, 'network_error', {} as never))
      .mockResolvedValueOnce({ document: { id: 'w1', body: 'Hi Sam, would you refer me?' } });
    wrap(<ApplicationDrafts job={job('a', 'saved')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Draft referral request' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByDisplayValue('Hi Sam, would you refer me?')).toBeTruthy());

    expect(createWriting).toHaveBeenCalledTimes(2);
    expect(createWriting.mock.calls[0][0]).toEqual({
      type: 'referral_request',
      opportunityId: null,
      context: { organization: 'Acme', role: 'Role a' },
    });
    expect(createWriting.mock.calls[0][1]).toBe(createWriting.mock.calls[1][1]);
  });

  it('says honestly when the drafting provider is not connected', async () => {
    switchOn = true;
    access = { data: { enabled: true } };
    createWriting.mockRejectedValueOnce(new ApiError(503, 'provider_unavailable', {} as never));
    wrap(<ApplicationDrafts job={job('a', 'interviewing')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Draft thank-you note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was charged');
  });
});
