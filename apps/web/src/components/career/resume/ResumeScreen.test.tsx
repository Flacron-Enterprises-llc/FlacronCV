import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ResumeDetail, type ResumeVersion } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import frMessages from '../../../../public/locales/fr/common.json';
import { ResumeScreen } from './ResumeScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const version: ResumeVersion = {
  id: 'v1',
  resumeId: 'r1',
  versionNumber: 1,
  body: {
    templateId: 'classic',
    confirmation: 'draft',
    sections: [{ factType: 'skill', lines: [{ factId: 's1', factType: 'skill', text: 'SQL', uncertain: true }] }],
  },
  factIds: ['s1'],
  opportunityRevisionId: null,
  createdAt: '2026-10-16T00:00:00.000Z',
};

const detail: ResumeDetail = {
  id: 'r1',
  title: 'Ada',
  language: 'en',
  templateId: 'classic',
  createdAt: '2026-10-16T00:00:00.000Z',
  currentVersionId: 'v1',
  version,
};

const credit = { includedRemaining: 3, packRemaining: 0, renewalDate: '2026-11-16T00:00:00.000Z' };

function renderScreen(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ResumeScreen api={api} user={user} ready signInHref="/en/sign-in" />
    </NextIntlClientProvider>,
  );
}

describe('ResumeScreen', () => {
  it('shows a page heading when signed out', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <ResumeScreen api={testApi()} user={null} ready signInHref="/en/sign-in" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Resume studio' })).toBeTruthy();
    expect(screen.getByText('Named resume versions and exports for this account.')).toBeTruthy();
    expect(screen.getByText('Sign in to see your resumes')).toBeTruthy();
  });

  it('creates a resume from an empty studio without a credit', async () => {
    const createResume = vi.fn(async () => detail);
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [], documentCredit: credit })),
        createResume,
      }),
    );
    expect(await screen.findByText('No resume yet')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Resume name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create resume' }));
    expect(await screen.findByText('Still to review')).toBeTruthy();
    expect(createResume).toHaveBeenCalledWith({ title: 'Ada', language: 'en' });
  });

  it('asks before spending a credit, then sends one idempotency key', async () => {
    const keys: string[] = [];
    const generateResume = vi.fn(async (_resumeId: string, _instructions: string, key: string) => {
      keys.push(key);
      return {
        version: { ...version, id: 'v2', versionNumber: 2, body: { ...version.body, confirmation: 'confirmed' as const } },
        usage: {
          unit: 'document_credit',
          includedGranted: 3,
          includedRemaining: 2,
          packRemaining: 0,
          packHeld: 0,
          renewalDate: credit.renewalDate ?? '',
          ledgerState: 'committed',
        },
        jobId: 'j',
        replayed: false,
      };
    });
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        generateResume,
      }),
    );
    expect(await screen.findByText('Still to review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Generate a new version' }));
    expect(await screen.findByText('This uses 1 document credit')).toBeTruthy();
    expect(generateResume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 credit' }));
    expect(await screen.findByText('Version 2')).toBeTruthy();
    expect(generateResume).toHaveBeenCalledTimes(1);
    expect(keys).toHaveLength(1);
    expect(keys[0]?.length).toBeGreaterThan(0);
  });

  it('asks for a confirmed job or school and does not spend a credit', async () => {
    const generateResume = vi.fn(async () => {
      throw new ApiError(400, 'validation_error', {
        code: 'validation_error',
        field: 'facts',
        reason: 'need_experience_or_education',
      });
    });
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        generateResume,
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Generate a new version' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use 1 credit' }));
    expect(await screen.findByText('Add a confirmed job or school on your profile first. No credit was used.')).toBeTruthy();
    expect(screen.getByLabelText('Skill')).toHaveProperty('value', 'SQL');
  });

  it('keeps the typed line when generation fails and says the credit was not used', async () => {
    const generateResume = vi.fn(async () => {
      throw new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable', released: true });
    });
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        generateResume,
      }),
    );
    const field = await screen.findByLabelText('Skill');
    fireEvent.change(field, { target: { value: 'SQL, reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate a new version' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use 1 credit' }));
    expect(await screen.findByText('No document credit was used.')).toBeTruthy();
    expect(screen.getByLabelText('Skill')).toHaveProperty('value', 'SQL, reviewed');
  });

  it('shows the plan message for DOCX and leaves the resume on screen', async () => {
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        exportResume: vi.fn(async () => {
          throw new ApiError(403, 'plan_upgrade_required', { code: 'plan_upgrade_required', feature: 'docxExport', minimumPlan: 'starter' });
        }),
      }),
    );
    expect(await screen.findByLabelText('Skill')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download DOCX' }));
    expect(await screen.findByText('DOCX export is not included in your current plan')).toBeTruthy();
    expect(screen.getByLabelText('Skill')).toHaveProperty('value', 'SQL');
  });

  it('lists parsing issues and does not show a score', async () => {
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        readability: vi.fn(async () => ({
          versionId: 'v1',
          label: 'flacroncv_readability',
          issues: [{ code: 'missing_section', section: 'contact' }],
        })),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Check readability' }));
    expect(await screen.findByText('This is not an employer score and it is not a job fit.')).toBeTruthy();
    expect(screen.getByText('contact is missing.')).toBeTruthy();
    expect(screen.queryByText(/\d+%|hiring probability/i)).toBeNull();
  });

  it('asks before a letter, then saves an edit without another credit', async () => {
    const keys: string[] = [];
    const createWriting = vi.fn(async (_input: { type: string; opportunityId: string | null }, key: string) => {
      keys.push(key);
      return {
        document: {
          id: 'd1',
          type: 'cover_letter' as const,
          title: 'Cover letter',
          body: 'SQL',
          factIds: ['s1'],
          opportunityRevisionId: null,
          confirmation: 'draft' as const,
          templateId: 'classic',
          createdAt: '2026-10-16T00:00:00.000Z',
          updatedAt: '2026-10-16T00:00:00.000Z',
        },
        usage: {
          unit: 'document_credit',
          includedGranted: 3,
          includedRemaining: 2,
          packRemaining: 0,
          packHeld: 0,
          renewalDate: credit.renewalDate ?? '',
          ledgerState: 'committed',
        },
        jobId: 'j1',
        replayed: false,
      };
    });
    const updateWriting = vi.fn(async () => ({
      id: 'd1',
      type: 'cover_letter' as const,
      title: 'Cover letter',
      body: 'SQL, as I would tell it',
      factIds: ['s1'],
      opportunityRevisionId: null,
      confirmation: 'draft' as const,
      templateId: 'classic',
      createdAt: '2026-10-16T00:00:00.000Z',
      updatedAt: '2026-10-16T00:00:00.000Z',
    }));
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        createWriting,
        updateWriting,
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Write from confirmed facts' }));
    expect(await screen.findByText(/confirmed facts only/)).toBeTruthy();
    expect(createWriting).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Write with 1 credit' }));
    const draft = await screen.findByLabelText('Writing draft');
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error('writing draft');
    expect(draft.value).toBe('SQL');
    expect(createWriting).toHaveBeenCalledTimes(1);
    expect(createWriting.mock.calls[0]?.[0]).toEqual({
      type: 'cover_letter',
      opportunityId: null,
      templateId: 'classic',
    });
    expect(keys).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Writing draft'), { target: { value: 'SQL, as I would tell it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByDisplayValue('SQL, as I would tell it')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download text' })).toBeTruthy();
    expect(updateWriting).toHaveBeenCalledWith('d1', { body: 'SQL, as I would tell it' });
    expect(createWriting).toHaveBeenCalledTimes(1);
  });

  it('labels lines by section and previews a saved letter without the sample person or recipient', async () => {
    const withContact: ResumeVersion = {
      ...version,
      body: {
        ...version.body,
        sections: [
          { factType: 'contact', lines: [{ factId: 'c1', factType: 'contact', text: 'Béa Martin · bea@example.test', uncertain: false }] },
          ...version.body.sections,
        ],
      },
    };
    const letter = {
      id: 'd1',
      type: 'cover_letter' as const,
      title: 'Cover letter',
      body: 'Dear Harbourfront team,\n\nI ran SQL workshops.\n\nSincerely,\nBéa Martin',
      factIds: ['s1'],
      opportunityRevisionId: null,
      confirmation: 'draft' as const,
      templateId: 'modern',
      createdAt: '2026-10-16T00:00:00.000Z',
      updatedAt: '2026-10-16T00:00:00.000Z',
    };
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [{ ...detail, version: withContact }], documentCredit: credit })),
        resume: vi.fn(async () => ({ ...detail, version: withContact })),
        resumeVersions: vi.fn(async () => ({ items: [withContact] })),
        writingDocuments: vi.fn(async () => ({ items: [letter], documentCredit: credit })),
      }),
    );
    expect(await screen.findByLabelText('Skill')).toBeTruthy();
    expect(screen.getByLabelText('Contact')).toBeTruthy();
    expect(screen.queryByText('skill', { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Saved drafts' }));
    expect(await screen.findByText('I ran SQL workshops.')).toBeTruthy();
    for (const sample of ['Hiring committee, Northbridge Civic Library', 'Dear hiring committee,', 'ada.review@example.test']) {
      expect(screen.queryByText(sample, { exact: false })).toBeNull();
    }
    expect(screen.getAllByText('Béa Martin').length).toBeGreaterThan(0);
  });

  it('says the credit was returned when a letter invents current work', async () => {
    const createWriting = vi.fn(async () => {
      throw new ApiError(503, 'provider_unavailable', {
        code: 'provider_unavailable',
        released: true,
        reason: 'current_role_unsupported',
      });
    });
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        createWriting,
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Write from confirmed facts' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Write with 1 credit' }));
    expect(
      await screen.findByText(
        'The draft described a role, employer, or date that is not in your confirmed facts. The credit was returned. Saved documents were not replaced.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Writing draft')).toBeNull();
  });

  it('saves typed lines when the layout changes', async () => {
    const updateResumeVersion = vi.fn(async (_id: string, patch: { templateId?: string; lines?: Array<{ factId: string; text: string }> }) => ({
      ...version,
      body: {
        ...version.body,
        templateId: patch.templateId ?? version.body.templateId,
        sections: version.body.sections.map((section) => ({
          ...section,
          lines: section.lines.map((line) => {
            const edited = patch.lines?.find((item) => item.factId === line.factId);
            return edited ? { ...line, text: edited.text, uncertain: false } : line;
          }),
        })),
      },
    }));
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        updateResumeVersion,
      }),
    );
    const field = await screen.findByLabelText('Skill');
    fireEvent.change(field, { target: { value: 'SQL, reviewed' } });
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'modern' } });
    expect(await screen.findByText(/keeps every saved section/)).toBeTruthy();
    expect(updateResumeVersion).toHaveBeenCalledWith('v1', {
      templateId: 'modern',
      lines: [{ factId: 's1', text: 'SQL, reviewed' }],
    });
    expect(screen.getByLabelText('Skill')).toHaveProperty('value', 'SQL, reviewed');
  });

  it('explains a save from another tab or device and reloads instead of overwriting it', async () => {
    const updateResumeVersion = vi.fn().mockRejectedValue(new ApiError(409, 'revision_conflict', { code: 'revision_conflict', currentRevision: 7 }));
    const resume = vi.fn(async () => detail);
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume,
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        updateResumeVersion,
      }),
    );
    fireEvent.change(await screen.findByLabelText('Skill'), { target: { value: 'SQL, edited twice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('another tab or device');
    expect(alert.textContent).not.toMatch(/other FlacronCV site|both sites/);
    const before = resume.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Reload the latest version' }));
    await vi.waitFor(() => expect(resume.mock.calls.length).toBeGreaterThan(before));
  });

  it('clears a saved status after edits and does not show it after a failed save', async () => {
    const updateResumeVersion = vi
      .fn()
      .mockResolvedValueOnce({ ...version, body: { ...version.body, sections: [{ factType: 'skill', lines: [{ factId: 's1', factType: 'skill', text: 'SQL, reviewed', uncertain: false }] }] } })
      .mockRejectedValueOnce(new ApiError(400, 'validation_error', { code: 'validation_error', field: 's1', reason: 'invalid' }));
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        updateResumeVersion,
      }),
    );
    fireEvent.change(await screen.findByLabelText('Skill'), { target: { value: 'SQL, reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Skill'), { target: { value: '' } });
    expect(screen.queryByText('Saved')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Could not save. Your typed lines are still here.')).toBeTruthy();
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('stacks the studio in one column', async () => {
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
      }),
    );
    const layout = await screen.findByTestId('resume-layout');
    expect(layout.className).toContain('grid-cols-1');
  });

  it('creates a French CV from the French studio', async () => {
    const createResume = vi.fn(async () => ({ ...detail, language: 'fr' as const }));
    render(
      <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="UTC">
        <ResumeScreen
          api={testApi({ resumes: vi.fn(async () => ({ items: [], documentCredit: credit })), createResume })}
          user={user}
          ready
          signInHref="/fr/sign-in"
        />
      </NextIntlClientProvider>,
    );
    const name = await screen.findByLabelText(frMessages.career.resume.name_label);
    expect(name).toHaveProperty('value', 'CV');
    fireEvent.change(name, { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: frMessages.career.resume.create }));
    await vi.waitFor(() => expect(createResume).toHaveBeenCalled());
    expect(createResume).toHaveBeenCalledWith({ title: 'Ada', language: 'fr' });
  });

  it('previews the contact name, contact line, and CV headings that the export prints', async () => {
    const withContact: ResumeVersion = {
      ...version,
      body: {
        ...version.body,
        sections: [
          { factType: 'contact', lines: [{ factId: 'c1', factType: 'contact', text: 'Ada Review · ada@example.test', uncertain: false }] },
          { factType: 'experience', lines: [{ factId: 'e1', factType: 'experience', text: 'Coordinator · Northbridge · 2021-01 · 2024-06', uncertain: false }] },
          ...version.body.sections,
        ],
      },
    };
    const libraryDetail = { ...detail, title: 'Library CV', version: withContact };
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [libraryDetail], documentCredit: credit })),
        resume: vi.fn(async () => libraryDetail),
        resumeVersions: vi.fn(async () => ({ items: [withContact] })),
      }),
    );
    const preview = await screen.findByRole('complementary', { name: 'Preview' });
    expect(await within(preview).findByText('Ada Review')).toBeTruthy();
    expect(within(preview).getByText('ada@example.test')).toBeTruthy();
    expect(within(preview).getByText('Skills')).toBeTruthy();
    expect(within(preview).getByText('Experience')).toBeTruthy();
    expect(within(preview).getByText('Jan 2021 – Jun 2024')).toBeTruthy();
    expect(within(preview).queryByText('Library CV')).toBeNull();
  });
});
