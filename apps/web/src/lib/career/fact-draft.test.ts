import { describe, expect, it } from 'vitest';
import { changedPatch, factTitle, toDraft } from './fact-draft';
import { profileLoadFailure } from './profile-load';
import { ApiError } from '@flacroncv/career-api-client';
import { extractResumeText, ResumeExtractError } from './extract-resume';

describe('fact draft', () => {
  it('sends only the field that changed, and keeps a flagged field out of the patch', () => {
    const stored = { name: 'SQL', category: null };
    const draft = toDraft('skill', stored);
    draft.category = 'Data';
    const result = changedPatch('skill', stored, draft, 'draft');
    expect(result).toEqual({ ok: true, patch: { category: 'Data' } });
  });

  it('reports a bad date instead of a patch', () => {
    const result = changedPatch('experience', { position: null, company: null, location: null, startDate: null, endDate: null, current: null, responsibilities: null }, { ...toDraft('experience', {}), startDate: 'March 2020' }, 'draft');
    expect(result.ok).toBe(false);
  });

  it('needs the required fields before a confirm patch', () => {
    const result = changedPatch('skill', { name: null, category: null }, toDraft('skill', { name: null, category: null }), 'confirmed');
    expect(result.ok).toBe(false);
  });

  it('titles a role from the position and the employer', () => {
    expect(factTitle('experience', { position: 'Analyst', company: 'Acme' })).toBe('Analyst · Acme');
    expect(factTitle('skill', { name: null })).toBe('');
  });
});

describe('profile load failure', () => {
  it('distinguishes permission, signed out, and unavailable', () => {
    expect(profileLoadFailure(new ApiError(403, 'permission_denied', { code: 'permission_denied' }))).toBe('permission');
    expect(profileLoadFailure(new ApiError(401, 'unauthenticated', { code: 'unauthenticated' }))).toBe('signed-out');
    expect(profileLoadFailure(new ApiError(0, 'network_error', { code: 'network_error' }))).toBe('unavailable');
  });
});

describe('extractResumeText', () => {
  const parsers = {
    pdf: async () => '  Ada Lovelace \n',
    docx: async () => '',
  };

  it('reads a pdf through the injected parser and trims the text', async () => {
    const file = new File(['%PDF'], 'ada.pdf', { type: 'application/pdf' });
    await expect(extractResumeText(file, parsers)).resolves.toEqual({ text: 'Ada Lovelace', format: 'pdf' });
  });

  it('rejects an unsupported type, an empty read, and a file over 5 MB without calling a parser', async () => {
    const pdf = viCalls();
    await expect(extractResumeText(new File(['x'], 'notes.txt', { type: 'text/plain' }), pdf.parsers)).rejects.toMatchObject({
      code: 'unsupported',
    });
    await expect(extractResumeText(new File(['x'], 'empty.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), parsers)).rejects.toBeInstanceOf(ResumeExtractError);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' });
    await expect(extractResumeText(big, pdf.parsers)).rejects.toMatchObject({ code: 'too_large' });
    expect(pdf.calls).toBe(0);
  });
});

function viCalls() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    parsers: {
      pdf: async () => {
        calls += 1;
        return 'x';
      },
      docx: async () => {
        calls += 1;
        return 'x';
      },
    },
  };
}
