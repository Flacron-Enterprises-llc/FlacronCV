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
    expect(screen.getAllByRole('button', { name: 'Generate an action pack' })[0]).toBeDefined();
  });

  it('renders existing action pack bundle with fit, resume, letter, checklist, and next steps', async () => {
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [samplePack], actionPack: sampleBalance }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
    });
    renderScreen(api);

    expect(await screen.findByRole('heading', { level: 3, name: 'Lead Systems Architect' })).toBeDefined();
    expect(screen.getAllByText('Strong fit')[0]).toBeDefined();
    expect(screen.getAllByText('Acme Robotics')[0]).toBeDefined();
    expect(screen.getByText(/Why you qualify/)).toBeDefined();
    expect(screen.getByText('Direct Rust systems engineering match')).toBeDefined();
    expect(screen.getByText('Preparation checklist')).toBeDefined();
    expect(screen.getByText('Tailor resume summary to highlight robotics')).toBeDefined();
    expect(screen.getByText('Tailored cover letter')).toBeDefined();
    expect(screen.getByText('Tailored resume content')).toBeDefined();
    expect(screen.getByText('Recommended next steps')).toBeDefined();
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
    fireEvent.click((await screen.findAllByRole('button', { name: 'Generate an action pack' }))[0]);
    fireEvent.change(screen.getByLabelText(/Select opportunity/i), { target: { value: sampleOpportunity.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Run action engine (1 credit)' }));
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

    const openBtn = (await screen.findAllByRole('button', { name: 'Generate an action pack' }))[0];
    fireEvent.click(openBtn);

    expect(screen.getByText('Target an opportunity')).toBeDefined();
    expect(screen.getByText(/Uses 1 action pack credit/)).toBeDefined();

    const select = screen.getByLabelText(/Select opportunity/i);
    fireEvent.change(select, { target: { value: sampleOpportunity.id } });

    fireEvent.click(screen.getByRole('button', { name: 'Run action engine (1 credit)' }));

    expect(createActionPack).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: sampleOpportunity.id,
      }),
      expect.any(String),
    );
  });

  it('shows the operation, the credits required and the balance before generating', async () => {
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [], actionPack: { ...sampleBalance, includedRemaining: 3, packRemaining: 1 } }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
    });
    renderScreen(api);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Generate an action pack' }))[0]);
    expect(screen.getByText(/Action pack: fit, gaps, tailored résumé/)).toBeTruthy();
    expect(screen.getByText('1 action pack credit')).toBeTruthy();
    expect(screen.getByText('4 credits left')).toBeTruthy();
    expect(screen.getByText(/retrying it is free/)).toBeTruthy();
  });

  it('blocks a paid run when no credits are left', async () => {
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [], actionPack: { ...sampleBalance, includedRemaining: 0, packRemaining: 0 } }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
    });
    renderScreen(api);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Generate an action pack' }))[0]);
    fireEvent.change(screen.getByLabelText(/Select opportunity/i), { target: { value: sampleOpportunity.id } });
    expect(screen.getByText(/no action pack credits left/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run action engine (1 credit)' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers a free retry for an unfinished pack and shows the finished letter', async () => {
    const partial: ActionPack = { ...samplePack, status: 'partial', coverLetter: null, letterAttempts: 1, componentErrors: { coverLetter: 'unusable_output' } };
    const retry = vi.fn().mockResolvedValue({
      actionPack: { ...samplePack, status: 'complete', letterAttempts: 2 },
      usage: { unit: 'action_pack', includedRemaining: 9, packRemaining: 0, renewalDate: '2026-11-17T00:00:00.000Z', ledgerState: 'committed' },
      jobId: 'job-1',
      replayed: false,
    });
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [partial], actionPack: sampleBalance }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
      retryActionPackComponent: retry,
    });
    renderScreen(api);
    expect(await screen.findByText('This pack is not finished yet')).toBeTruthy();
    expect(screen.getByText('No cover letter yet.')).toBeTruthy();
    expect(screen.getByText('2 retries left')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry the cover letter (no new credit)' }));
    expect(retry).toHaveBeenCalledWith(partial.id, 'coverLetter');
    expect(await screen.findByText(/One credit was used for the whole pack/)).toBeTruthy();
    expect(screen.getByText(/I am thrilled to apply/)).toBeTruthy();
  });

  it('removes an unfinished pack when the person cancels it', async () => {
    const partial: ActionPack = { ...samplePack, status: 'partial', coverLetter: null, letterAttempts: 1 };
    const cancel = vi.fn().mockResolvedValue({ released: true });
    const actionPacks = vi
      .fn()
      .mockResolvedValueOnce({ items: [partial], actionPack: { ...sampleBalance, includedRemaining: 9 } })
      .mockResolvedValue({ items: [], actionPack: sampleBalance });
    const api = testApi({
      actionPacks,
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
      cancelActionPack: cancel,
    });
    renderScreen(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel this pack and return the credit' }));
    expect(cancel).toHaveBeenCalledWith(partial.id);
    expect(await screen.findByText('No action packs yet')).toBeTruthy();
  });

  it('edits the cover letter and saves it without a charge', async () => {
    const update = vi.fn().mockResolvedValue({
      ...samplePack,
      coverLetter: { ...samplePack.coverLetter!, body: 'My own words.' },
      editedComponents: ['coverLetter'],
    });
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [samplePack], actionPack: sampleBalance }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
      updateActionPack: update,
    });
    renderScreen(api);
    await screen.findByText('Tailored cover letter');
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    // Order on screen: fit, checklist, letter, résumé, next steps.
    fireEvent.click(editButtons[2]!);
    fireEvent.change(screen.getByLabelText('Letter text'), { target: { value: 'My own words.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(update).toHaveBeenCalledWith(samplePack.id, { coverLetter: { title: 'Cover Letter - Acme Robotics', body: 'My own words.' } });
    expect(await screen.findByText('My own words.')).toBeTruthy();
    expect(screen.getByText('Edited by you')).toBeTruthy();
  });

  it('copies the bundle into Documents and links there', async () => {
    const save = vi.fn().mockResolvedValue({
      actionPack: { ...samplePack, savedDocuments: { resumeId: 'r1', resumeVersionId: 'v1', letterDocumentId: 'w1' } },
      savedDocuments: { resumeId: 'r1', resumeVersionId: 'v1', letterDocumentId: 'w1' },
    });
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [samplePack], actionPack: sampleBalance }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
      saveActionPackDocuments: save,
    });
    renderScreen(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Save résumé and letter to Documents' }));
    expect(save).toHaveBeenCalledWith(samplePack.id);
    expect(await screen.findByText(/saved in Documents/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Documents' }).getAttribute('href')).toBe('/en/career/documents');
    expect(screen.getByRole('button', { name: 'Update the copies in Documents' })).toBeTruthy();
  });

  it('says DOCX needs a paid plan when the export is refused', async () => {
    const exportPack = vi.fn().mockRejectedValue(new ApiError(403, 'plan_upgrade_required', { code: 'plan_upgrade_required' }));
    const api = testApi({
      actionPacks: vi.fn().mockResolvedValue({ items: [samplePack], actionPack: sampleBalance }),
      opportunities: vi.fn().mockResolvedValue({ items: [sampleOpportunity], total: 1 }),
      exportActionPack: exportPack,
    });
    renderScreen(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Letter DOCX' }));
    expect(exportPack).toHaveBeenCalledWith(samplePack.id, 'coverLetter', 'docx');
    expect(await screen.findByText(/DOCX downloads need a paid plan/)).toBeTruthy();
  });
});
