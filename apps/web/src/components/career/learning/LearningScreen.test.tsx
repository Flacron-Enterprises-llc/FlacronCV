import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { SkillGapReport, SkillReportBalanceView } from '@flacroncv/career-api-client';
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
    expect(screen.getAllByRole('button', { name: 'New Skill Plan' })[0]).toBeDefined();
  });

  it('renders skill gap report details, milestones, resources, and capstone rubrics', async () => {
    const api = testApi({
      skillReports: vi.fn().mockResolvedValue({ items: [sampleReport], skillReport: sampleBalance }),
    });
    renderScreen(api);

    expect(await screen.findByRole('heading', { level: 2, name: 'Staff Distributed Systems Engineer' })).toBeDefined();
    expect(screen.getAllByText('50%')[0]).toBeDefined();
    expect(screen.getAllByText('Distributed Consensus (Raft/Paxos)')[0]).toBeDefined();
    expect(screen.getByText('Critical Gap')).toBeDefined();
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
      message: 'Milestone converted to career evidence',
    });
    const api = testApi({
      skillReports: vi.fn().mockResolvedValue({ items: [sampleReport], skillReport: sampleBalance }),
      convertMilestoneToEvidence,
    });
    renderScreen(api);

    const convertBtn = await screen.findByRole('button', { name: 'Add to Evidence Vault' });
    fireEvent.click(convertBtn);

    expect(convertMilestoneToEvidence).toHaveBeenCalledWith('report-111', 'mile-1');
    expect(await screen.findByText(/Milestone successfully recorded in your Career Evidence Vault!/i)).toBeDefined();
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

    const openBtn = (await screen.findAllByRole('button', { name: 'New Skill Plan' }))[0];
    fireEvent.click(openBtn);

    expect(screen.getByText('Target a New Role')).toBeDefined();

    const roleInput = screen.getByLabelText(/Target Role/i);
    fireEvent.change(roleInput, { target: { value: 'Staff Distributed Systems Engineer' } });

    fireEvent.click(screen.getByRole('button', { name: 'Generate Learning Plan (1 Credit)' }));

    expect(createSkillReport).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRole: 'Staff Distributed Systems Engineer',
        includeProjectBrief: true,
      }),
      expect.any(String),
    );
  });
});
