import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ActionPack, type ActionPackBalanceView, type OpportunityItem } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { ActionPackScreen } from './ActionPackScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const sampleOpportunity: OpportunityItem = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'jobs',
  provider: 'adzuna',
  title: 'Lead Systems Architect',
  organization: 'Acme Robotics',
  status: 'open',
  label: 'open',
  sourceUrl: 'https://example.test/jobs/1234',
  checkedAt: '2026-10-17T00:00:00.000Z',
  deadline: null,
  locations: ['San Francisco, CA'],
  compensation: {
    minimum: 180000,
    maximum: 220000,
    currency: 'USD',
    period: 'annual',
  },
  sponsorship: 'stated_no',
};

const samplePack: ActionPack = {
  id: '33333333-3333-4333-8333-333333333333',
  opportunityId: sampleOpportunity.id,
  opportunityRevisionId: '22222222-2222-4222-8222-222222222222',
  vacancySnapshot: {
    title: 'Lead Systems Architect',
    organization: 'Acme Robotics',
    description: 'Building distributed realtime autonomous systems in Rust and PostgreSQL.',
    sourceUrl: 'https://example.test/jobs/1234',
    deadline: null,
    checkedAt: '2026-10-17T00:00:00.000Z',
    revisionId: '22222222-2222-4222-8222-222222222222',
  },
  profileSnapshot: [
    {
      id: 'fact-1',
      factType: 'skill',
      value: { name: 'Rust' },
    },
  ],
  fit: {
    fit: 'strong',
    overlap: 92,
    reasons: ['Direct Rust systems engineering match'],
    gaps: [],
    unknowns: [],
  },
  tailoredResume: {
    title: 'Lead Systems Architect',
    lines: [
      {
        factId: 'fact-1',
        factType: 'skill',
        text: 'Rust distributed systems engineering',
        uncertain: false,
      },
    ],
    factIds: ['fact-1'],
  },
  coverLetter: {
    title: 'Cover Letter - Acme Robotics',
    body: 'Dear Acme Robotics Team,\n\nI am thrilled to apply for the Lead Systems Architect role.',
    factIds: ['fact-1'],
  },
  checklist: [
    {
      id: 'step-1',
      label: 'Tailor resume summary to highlight robotics',
      done: true,
    },
    {
      id: 'step-2',
      label: 'Review autonomous systems portfolio samples',
      done: false,
    },
  ],
  nextSteps: [
    'Submit the prepared application pack directly via the official company portal.',
    'Review your linked evidence items in the Evidence Vault.',
  ],
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z',
};

const sampleBalance: ActionPackBalanceView = {
  includedRemaining: 10,
  packRemaining: 0,
  renewalDate: '2026-11-17T00:00:00.000Z',
};

function renderScreen(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ActionPackScreen api={api} user={user} ready signInHref="/en/sign-in" />
    </NextIntlClientProvider>,
  );
}

describe('ActionPackScreen (CV12)', () => {
  it('shows empty state when no action packs have been generated yet', async () => {
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [], actionPack: sampleBalance }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
    });
    renderScreen(api);

    expect(await screen.findByText('No action packs yet')).toBeDefined();
    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Generate Action Pack' })[0]).toBeDefined();
  });

  it('renders existing action pack bundle with fit, resume, letter, checklist, and next steps', async () => {
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [samplePack], actionPack: sampleBalance }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
    });
    renderScreen(api);

    expect(await screen.findByRole('heading', { level: 3, name: 'Lead Systems Architect' })).toBeDefined();
    expect(screen.getAllByText('Strong Fit')[0]).toBeDefined();
    expect(screen.getAllByText('Acme Robotics')[0]).toBeDefined();
    expect(screen.getByText(/Why You Qualify/)).toBeDefined();
    expect(screen.getByText('Direct Rust systems engineering match')).toBeDefined();
    expect(screen.getByText('Preparation Checklist')).toBeDefined();
    expect(screen.getByText('Tailor resume summary to highlight robotics')).toBeDefined();
    expect(screen.getByText('Tailored Cover Letter')).toBeDefined();
    expect(screen.getByText('Tailored Resume Content')).toBeDefined();
    expect(screen.getByText('Recommended Next Steps')).toBeDefined();
  });

  it('toggles checklist items without extra debits', async () => {
    const updatedPack: ActionPack = {
      ...samplePack,
      checklist: [
        samplePack.checklist[0]!,
        { ...samplePack.checklist[1]!, done: true },
      ],
    };
    const updateChecklist = vi.fn().mockResolvedValue(updatedPack);
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [samplePack], actionPack: sampleBalance }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
      updateActionPackChecklist: updateChecklist,
    });
    renderScreen(api);

    const checkbox = await screen.findByRole('checkbox', {
      name: /Review autonomous systems portfolio samples/i,
    });
    expect(checkbox).toBeDefined();
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect(updateChecklist).toHaveBeenCalledWith(
      samplePack.id,
      'step-2',
      true,
    );
  });

  it('says action packs are not open yet when the feature is switched off', async () => {
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [], actionPack: sampleBalance }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
      createActionPack: vi.fn().mockRejectedValue(new ApiError(403, 'feature_unavailable', { code: 'feature_unavailable', feature: 'actionPacks' })),
    });
    renderScreen(api);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Generate Action Pack' }))[0]);
    fireEvent.change(screen.getByLabelText(/Select Opportunity/i), { target: { value: sampleOpportunity.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Run Action Engine (1 Credit)' }));
    expect(await screen.findByText(/Action packs are not open yet in this preview/)).toBeTruthy();
  });

  it('generates a new action pack bundle when selected and submitted', async () => {
    const createActionPack = vi.fn().mockResolvedValue({
      actionPack: samplePack,
      usage: {
        unit: 'action_pack',
        includedRemaining: 9,
        packRemaining: 0,
        renewalDate: '2026-11-17T00:00:00.000Z',
        ledgerState: 'committed',
      },
      jobId: 'job-123',
      replayed: false,
    });
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [], actionPack: sampleBalance }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
      createActionPack,
    });
    renderScreen(api);

    const openBtn = (await screen.findAllByRole('button', { name: 'Generate Action Pack' }))[0];
    fireEvent.click(openBtn);

    expect(screen.getByText('Target an Opportunity')).toBeDefined();
    expect(screen.getByText(/Uses 1 Action Pack credit/)).toBeDefined();

    const select = screen.getByLabelText(/Select Opportunity/i);
    fireEvent.change(select, { target: { value: sampleOpportunity.id } });

    fireEvent.click(screen.getByRole('button', { name: 'Run Action Engine (1 Credit)' }));

    expect(createActionPack).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: sampleOpportunity.id,
      }),
      expect.any(String),
    );
  });
});
