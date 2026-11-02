import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ResumeDetail, type ResumeVersion, type WritingDocument } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { ResumeScreen, downloadName } from './ResumeScreen';

/** Data-safety regressions in the resume studio (third-pass audit). */

const user: SignedInUser = { uid: 'ada', email: 'ada@example.test', emailVerified: true, getIdToken: async () => 'token' };
const version: ResumeVersion = {
  id: 'v1',
  resumeId: 'r1',
  versionNumber: 1,
  body: { templateId: 'classic', confirmation: 'draft', sections: [{ factType: 'skill', lines: [{ factId: 's1', factType: 'skill', text: 'SQL', uncertain: false }] }] },
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
  revision: 1,
};
const credit = { includedRemaining: 3, packRemaining: 0, renewalDate: '2026-11-16T00:00:00.000Z' };
const letter: WritingDocument = {
  id: 'd1',
  type: 'cover_letter',
  title: 'Cover letter',
  body: 'Original text',
  factIds: ['s1'],
  opportunityRevisionId: null,
  confirmation: 'draft',
  templateId: 'classic',
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
  revision: 4,
};
const usage = { unit: 'document_credit', includedGranted: 3, includedRemaining: 2, packRemaining: 0, packHeld: 0, renewalDate: '', ledgerState: 'committed' };
const generated = () => ({ version: { ...version, id: 'v2', versionNumber: 2 }, usage, jobId: 'j', replayed: false });

function renderScreen(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ResumeScreen api={api} user={user} ready signInHref="/en/sign-in" />
    </NextIntlClientProvider>,
  );
}

describe('ResumeScreen data safety', () => {
  it('saves after a generation with the revision the generation produced (no false conflict)', async () => {
    let done = false;
    const updateResumeVersion = vi.fn(async () => ({ ...version, id: 'v2', versionNumber: 2 }));
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => ({ ...detail, revision: done ? 2 : 1 })),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        generateResume: vi.fn(async () => {
          done = true;
          return generated() as never;
        }),
        updateResumeVersion,
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Generate a new version' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use 1 credit' }));
    expect(await screen.findByText('Version 2')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'SQL, edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(updateResumeVersion).toHaveBeenCalled());
    expect((updateResumeVersion.mock.calls[0] as unknown[])[1]).toMatchObject({ expectedRevision: 2 });
  });

  it('reuses the idempotency key after a lost response, but not after a released provider failure', async () => {
    const keys: string[] = [];
    const generateResume = vi
      .fn()
      .mockImplementationOnce(async (_r: string, _i: string, key: string) => {
        keys.push(key);
        throw new ApiError(0, 'network_error', { code: 'network_error' });
      })
      .mockImplementationOnce(async (_r: string, _i: string, key: string) => {
        keys.push(key);
        throw new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable', released: true });
      })
      .mockImplementationOnce(async (_r: string, _i: string, key: string) => {
        keys.push(key);
        return generated();
      });
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        generateResume,
      }),
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      fireEvent.click(await screen.findByRole('button', { name: 'Generate a new version' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Use 1 credit' }));
      await vi.waitFor(() => expect(generateResume).toHaveBeenCalledTimes(attempt + 1));
    }
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('sends the letter revision and keeps the typed text when another tab saved first', async () => {
    const updateWriting = vi.fn().mockRejectedValue(new ApiError(409, 'revision_conflict', { code: 'revision_conflict' }));
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        writingDocuments: vi.fn(async () => ({ items: [letter], documentCredit: credit })),
        updateWriting,
      }),
    );
    fireEvent.change(await screen.findByLabelText('Writing draft'), { target: { value: 'My careful rewrite' } });
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/your save was refused/)).toBeTruthy();
    expect(updateWriting).toHaveBeenCalledWith('d1', { body: 'My careful rewrite', expectedRevision: 4 });
    expect(screen.getByLabelText('Writing draft')).toHaveProperty('value', 'My careful rewrite');
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('changing the letter layout saves the typed text with it instead of wiping it', async () => {
    const updateWriting = vi.fn(async (_id: string, patch: { body?: string; templateId?: string }) => ({
      ...letter,
      body: patch.body ?? letter.body,
      templateId: patch.templateId ?? letter.templateId,
      revision: 5,
    }));
    renderScreen(
      testApi({
        resumes: vi.fn(async () => ({ items: [detail], documentCredit: credit })),
        resume: vi.fn(async () => detail),
        resumeVersions: vi.fn(async () => ({ items: [version] })),
        writingDocuments: vi.fn(async () => ({ items: [letter], documentCredit: credit })),
        updateWriting,
      }),
    );
    fireEvent.change(await screen.findByLabelText('Writing draft'), { target: { value: 'Typed, not saved' } });
    fireEvent.change(screen.getByLabelText(messages.career.resume.letter_template), { target: { value: 'modern' } });
    await vi.waitFor(() => expect(updateWriting).toHaveBeenCalled());
    expect(updateWriting).toHaveBeenCalledWith('d1', { templateId: 'modern', body: 'Typed, not saved', expectedRevision: 4 });
    expect(await screen.findByDisplayValue('Typed, not saved')).toBeTruthy();
  });

  it('names downloads after the document and keeps file names safe', () => {
    expect(downloadName('Marie Curie — CV', 'resume', 'pdf')).toBe('Marie Curie — CV.pdf');
    expect(downloadName('a/b:c*?', 'resume', 'docx')).toBe('a b c.docx');
    expect(downloadName('   ', 'letter', 'txt')).toBe('letter.txt');
  });
});
