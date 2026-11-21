import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type SkillGapReport, type SkillReportBalanceView } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { LearningScreen } from './LearningScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const sampleReport: SkillGapReport = {
  id: 'report-111',
  targetRole: 'Staff Distributed Systems Engineer',
  targetIndustry: 'Autonomous Robotics',
  timeBudgetHoursPerWeek: 10,
  financialBudgetCents: 5000,
  skillGaps: [
    {
      skill: 'Distributed Consensus (Raft/Paxos)',
      currentLevel: 'beginner',
      requiredLevel: 'advanced',
      importance: 'critical',
    },
    {
      skill: 'Rust Asynchronous Tokio',
      currentLevel: 'intermediate',
      requiredLevel: 'advanced',
      importance: 'preferred',
    },
  ],
  learningPlan: [
    {
      id: 'mile-1',
      title: 'Master Raft Consensus in Practice',
      description: 'Implement a replicated log with leader election in Rust.',
      targetSkill: 'Distributed Consensus (Raft/Paxos)',
      estimatedHours: 25,
      estimatedCostCents: 0,
      resources: [
        {
          title: 'The Raft Paper (Ongaro & Ousterhout)',
          url: 'https://raft.github.io/raft.pdf',
          provider: 'Stanford',
          type: 'documentation',
          isFree: true,
        },
      ],
    },
    {
      id: 'mile-2',
      title: 'Tokio Async Architecture and Actor Patterns',
      description: 'Design non-blocking actor loops with backpressure.',
      targetSkill: 'Rust Asynchronous Tokio',
      estimatedHours: 15,
      estimatedCostCents: 2900,
      resources: [
        {
          title: 'Tokio Tutorial',
          url: 'https://tokio.rs/tokio/tutorial',
          provider: 'Tokio Project',
          type: 'course',
          isFree: true,
        },
      ],
    },
  ],
  projectBrief: {
    title: 'Autonomous Fleet Consensus Engine',
    summary: 'A resilient, low-latency consensus coordinator for robot fleets.',
    estimatedHours: 40,
    requirements: [
      'Zero-loss failover under network partition simulations',
      'Under 5ms consensus commit latency on local mesh',
    ],
    deliverables: [
      'Fully working Rust codebase with integration test harness',
      'Architecture design decision record (ADR)',
    ],
    rubrics: [
      {
        id: 'rubric-1',
        name: 'Partition Fault Tolerance',
        description: 'Engine handles split brain cleanly without state drift.',
        weight: 60,
        evidenceType: 'project',
      },
      {
        id: 'rubric-2',
        name: 'Code Ergonomics and Documentation',
        description: 'Idiomatic Rust, comprehensive docstrings, and cargo tests.',
        weight: 40,
        evidenceType: 'project',
      },
    ],
  },
  progress: {
    completedMilestoneIds: ['mile-1'],
    percent: 50,
  },
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z',
};

const sampleBalance: SkillReportBalanceView = {
  includedRemaining: 5,
  packRemaining: 0,
  renewalDate: '2026-11-17T00:00:00.000Z',
};

function renderScreen(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <LearningScreen api={api} user={user} ready signInHref="/en/sign-in" />
    </NextIntlClientProvider>,
  );
}

describe('LearningScreen (CV13)', () => {
  it('shows empty state when no skill reports exist', async () => {
    const api = testApi({
      skillReports: vi.fn().mockResolvedValue({ items: [], skillReport: sampleBalance }),
    });
    renderScreen(api);

    expect(await screen.findByText('No learning plans yet')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'New skill plan' })[0]).toBeDefined();
  });

  it('renders skill gap report details, milestones, resources, and capstone rubrics', async () => {
    const api = testApi({
      skillReports: vi.fn().mockResolvedValue({ items: [sampleReport], skillReport: sampleBalance }),
    });
    renderScreen(api);

    expect(await screen.findByRole('heading', { level: 2, name: 'Staff Distributed Systems Engineer' })).toBeDefined();
    expect(screen.getAllByText('50%')[0]).toBeDefined();
    expect(screen.getAllByText('Distributed Consensus (Raft/Paxos)')[0]).toBeDefined();
    expect(screen.getByText('Critical gap')).toBeDefined();
    expect(screen.getByText('1. Master Raft Consensus in Practice')).toBeDefined();
    expect(screen.getByText(/The Raft Paper/)).toBeDefined();
    expect(screen.getByText('Autonomous Fleet Consensus Engine')).toBeDefined();
    expect(screen.getByText('Partition Fault Tolerance')).toBeDefined();
    expect(screen.getByText('60%')).toBeDefined();
  });

  it('toggles milestone completion status', async () => {
    const updatedReport: SkillGapReport = {
      ...sampleReport,
      progress: {
        completedMilestoneIds: ['mile-1', 'mile-2'],
        percent: 100,
      },
    };
    const updateLearningProgress = vi.fn().mockResolvedValue(updatedReport);
    const api = testApi({
      skillReports: vi.fn().mockResolvedValue({ items: [sampleReport], skillReport: sampleBalance }),
      updateLearningProgress,
    });
    renderScreen(api);

    expect(await screen.findByText('1. Master Raft Consensus in Practice')).toBeDefined();

    const checkboxes = screen.getAllByRole('checkbox');
    const milestone2Checkbox = checkboxes.find(
      (c) => !(c as HTMLInputElement).checked && c.getAttribute('id') !== 'includeBrief',
    );
    expect(milestone2Checkbox).toBeDefined();

    fireEvent.click(milestone2Checkbox!);
    expect(updateLearningProgress).toHaveBeenCalledWith('report-111', 'mile-2', true);
  });

  it('converts a completed milestone to career evidence in the vault', async () => {
    const convertMilestoneToEvidence = vi.fn().mockResolvedValue({
      evidenceId: 'evidence-999',
      created: true,
      message: 'Milestone converted to career evidence',
    });
    const api = testApi({
      skillReports: vi.fn().mockResolvedValue({ items: [sampleReport], skillReport: sampleBalance }),
      convertMilestoneToEvidence,
    });
    renderScreen(api);

    fireEvent.click(await screen.findByRole('button', { name: 'Add to evidence vault' }));
    // The ownership box starts empty: nothing is written for the person.
    const box = screen.getByLabelText(/In your own words/) as HTMLTextAreaElement;
    expect(box.value).toBe('');
    fireEvent.change(box, { target: { value: 'I implemented the log.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to vault' }));

    expect(convertMilestoneToEvidence).toHaveBeenCalledWith('report-111', 'mile-1', 'I implemented the log.');
    expect(await screen.findByText(/Milestone successfully recorded in your Career Evidence Vault!/i)).toBeDefined();
    expect(screen.getByText('In evidence vault')).toBeDefined();
  });

  it('explains a full vault instead of a generic failure', async () => {
    const convertMilestoneToEvidence = vi.fn().mockRejectedValue(new ApiError(409, 'capacity_exceeded', { code: 'capacity_exceeded' }));
    const api = testApi({
      skillReports: vi.fn().mockResolvedValue({ items: [sampleReport], skillReport: sampleBalance }),
      convertMilestoneToEvidence,
    });
    renderScreen(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to evidence vault' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to vault' }));
    expect(await screen.findByText(/Your Evidence Vault is full for your plan/)).toBeDefined();
  });

  it('generates a new skill report when form is submitted', async () => {
    const createSkillReport = vi.fn().mockResolvedValue({
      report: sampleReport,
      usage: {
        unit: 'skill_report',
        includedRemaining: 4,
        packRemaining: 0,
        renewalDate: '2026-11-17T00:00:00.000Z',
        ledgerState: 'committed',
      },
      jobId: 'job-skill-123',
      replayed: false,
    });
    const api = testApi({
      skillReports: vi.fn().mockResolvedValue({ items: [], skillReport: sampleBalance }),
      createSkillReport,
    });
    renderScreen(api);

    const openBtn = (await screen.findAllByRole('button', { name: 'New skill plan' }))[0];
    fireEvent.click(openBtn);

    expect(screen.getByText('Target a new role')).toBeDefined();
    // Charge notice: operation, credits required and remaining balance before paying.
    const notice = screen.getByTestId('learning-charge-notice');
    expect(notice.textContent).toContain('Skill gap report');
    expect(notice.textContent).toContain('1 skill report credit');
    expect(notice.textContent).toContain('5 reports');

    const roleInput = screen.getByLabelText(/Target role/i);
    fireEvent.change(roleInput, { target: { value: 'Staff Distributed Systems Engineer' } });

    fireEvent.click(screen.getByRole('button', { name: 'Generate learning plan (1 credit)' }));

    expect(createSkillReport).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRole: 'Staff Distributed Systems Engineer',
        includeProjectBrief: true,
      }),
      expect.any(String),
    );
  });
  it('shows unknown costs as unknown, essential credentials, bridge roles and transferable skills', async () => {
    const report: SkillGapReport = {
      ...sampleReport,
      skillGaps: [
        ...sampleReport.skillGaps,
        { skill: 'Safety Licence', currentLevel: 'none', requiredLevel: 'intermediate', importance: 'critical', kind: 'credential' },
      ],
      learningPlan: [
        { ...sampleReport.learningPlan[0], estimatedCostCents: null, costAsOf: null, prerequisites: ['Basic Rust'] },
        { ...sampleReport.learningPlan[1], estimatedCostCents: 2900, costAsOf: '2026-09' },
      ],
      bridgeRoles: [{ title: 'Site Reliability Engineer', reason: 'Builds on operations work.' }],
      transferableSkills: [{ skill: 'Rust', factIds: ['fact-1'] }],
    };
    renderScreen(
      testApi({ skillReports: vi.fn().mockResolvedValue({ items: [report], skillReport: sampleBalance }) }),
    );

    expect(await screen.findByText(/Cost unknown/)).toBeDefined();
    expect(screen.getByText(/stated 2026-09/)).toBeDefined();
    expect(screen.getByText(/Basic Rust/)).toBeDefined();
    expect(screen.getByText('Essential credential')).toBeDefined();
    expect(screen.getByText('Site Reliability Engineer')).toBeDefined();
    expect(screen.getByText('Rust')).toBeDefined();
    // The unknown cost is not counted, so the screen cannot claim the plan fits.
    const cost = screen.getByTestId('learning-plan-cost').textContent ?? '';
    expect(cost).toContain('1 step with unknown cost');
    expect(cost).toContain('Cannot tell if it fits the budget');
  });

  it('saves the ownership statement, adds the project once, and saves a rubric self-check', async () => {
    const withOwnership: SkillGapReport = {
      ...sampleReport,
      projectBrief: { ...sampleReport.projectBrief!, ownershipStatement: 'All mine.', evidenceId: null, rubricCheck: null },
    };
    const setProjectOwnership = vi.fn().mockResolvedValue(withOwnership);
    const addProjectToEvidence = vi.fn().mockResolvedValue({ evidenceId: 'ev-1', created: true });
    const saveRubricCheck = vi.fn().mockResolvedValue(withOwnership);
    const evidence = vi.fn().mockResolvedValue({
      items: [{ id: 'ev-1', title: 'Fleet engine repository' }],
    });
    renderScreen(
      testApi({
        skillReports: vi.fn().mockResolvedValue({ items: [sampleReport], skillReport: sampleBalance }),
        setProjectOwnership,
        addProjectToEvidence,
        saveRubricCheck,
        evidence,
      }),
    );

    const box = (await screen.findByLabelText('Ownership statement')) as HTMLTextAreaElement;
    expect(box.value).toBe('');
    expect(screen.getByText('AI-assisted brief')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Add finished project to vault' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(box, { target: { value: 'All mine.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save statement' }));
    expect(setProjectOwnership).toHaveBeenCalledWith('report-111', 'All mine.');

    fireEvent.click(await screen.findByRole('button', { name: 'Add finished project to vault' }));
    expect(addProjectToEvidence).toHaveBeenCalledWith('report-111');
    expect(await screen.findByText(/Project added to your Evidence Vault/)).toBeDefined();

    fireEvent.click(screen.getByLabelText('My work meets: Partition Fault Tolerance'));
    fireEvent.click(screen.getByRole('button', { name: 'Save self-check' }));
    expect(saveRubricCheck).toHaveBeenCalledWith('report-111', {
      evidenceIds: ['ev-1'],
      criteria: [
        { criterionId: 'rubric-1', met: true, note: '' },
        { criterionId: 'rubric-2', met: false, note: '' },
      ],
    });
  });

  it('blocks generation with no credits left and says so before paying', async () => {
    const createSkillReport = vi.fn();
    renderScreen(
      testApi({
        skillReports: vi.fn().mockResolvedValue({ items: [], skillReport: { ...sampleBalance, includedRemaining: 0 } }),
        createSkillReport,
      }),
    );
    fireEvent.click((await screen.findAllByRole('button', { name: 'New skill plan' }))[0]);
    fireEvent.change(screen.getByLabelText(/Target role/i), { target: { value: 'Nurse' } });
    expect(screen.getByTestId('learning-charge-notice').textContent).toContain('None left');
    expect((screen.getByRole('button', { name: 'Generate learning plan (1 credit)' }) as HTMLButtonElement).disabled).toBe(true);
    expect(createSkillReport).not.toHaveBeenCalled();
  });
});
