import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { ResumeVersion } from '../../../../../packages/career-api-client/src/types';
import {
  changedLines,
  createPaidKeys,
  createResumeFailure,
  creditLine,
  EMPTY_WRITING_CONTEXT,
  isRevisionConflict,
  isTargetedWritingType,
  takesWritingContext,
  WRITING_TYPE_OPTIONS,
  writingContextInput,
  writingTypeLabel,
  keyIsSpent,
  LETTER_TEMPLATE_OPTIONS,
  letterTemplateName,
  paidFailure,
  readabilityIssueText,
  readabilityLines,
  RESUME_TEMPLATE_OPTIONS,
  resumeTemplateName,
  resumeTitleError,
  templatePatch,
  versionMeta,
  opportunityParam,
} from './documents';

function version(over: Partial<ResumeVersion> = {}): ResumeVersion {
  return {
    id: 'v1',
    resumeId: 'r1',
    versionNumber: 2,
    body: {
      templateId: 'editorial',
      confirmation: 'draft',
      sections: [
        { factType: 'experience', lines: [{ factId: 'a', factType: 'experience', text: 'Analyst', uncertain: false }] },
        { factType: 'skill', lines: [{ factId: 'b', factType: 'skill', text: 'SQL', uncertain: true }] },
      ],
    },
    factIds: ['a', 'b'],
    opportunityRevisionId: null,
    createdAt: '2026-11-02T09:27:32.536Z',
    ...over,
  };
}

const err = (status: number, code: string, body: Record<string, unknown> = {}) => new ApiError(status, code, { code, ...body } as never);

describe('templates', () => {
  it('names every resume and letter template like the website', () => {
    expect(RESUME_TEMPLATE_OPTIONS).toHaveLength(15);
    expect(RESUME_TEMPLATE_OPTIONS.every((t) => t.name.length > 0)).toBe(true);
    expect(LETTER_TEMPLATE_OPTIONS).toHaveLength(8);
    expect(resumeTemplateName('slate-gold')).toBe('Slate');
    expect(resumeTemplateName('unknown')).toBe('unknown');
    expect(letterTemplateName('minimalist')).toBe('Minimalist letter');
    expect(letterTemplateName(undefined)).toBe('');
  });
});

describe('resumeTitleError', () => {
  it('requires 1-200 characters', () => {
    expect(resumeTitleError('  ')).not.toBeNull();
    expect(resumeTitleError('x'.repeat(201))).not.toBeNull();
    expect(resumeTitleError('Analyst CV')).toBeNull();
  });
});

describe('creditLine', () => {
  it('adds included and pack credits', () => {
    expect(creditLine({ includedRemaining: 59, packRemaining: 1, renewalDate: null })).toBe('60 document credits remaining.');
    expect(creditLine({ includedRemaining: 1, packRemaining: 0, renewalDate: null })).toBe('1 document credit remaining.');
    expect(creditLine(undefined)).toBeNull();
  });
});

describe('readability', () => {
  it('words each issue', () => {
    expect(readabilityIssueText({ code: 'empty' })).toBe('This version has no lines.');
    expect(readabilityIssueText({ code: 'missing_section', section: 'education' })).toBe('Education is missing.');
    expect(readabilityIssueText({ code: 'unconfirmed_version' })).toMatch(/not confirmed/);
  });
  it('collapses uncertain lines into a count', () => {
    expect(
      readabilityLines([
        { code: 'uncertain_line', factId: 'a' },
        { code: 'uncertain_line', factId: 'b' },
        { code: 'missing_section', section: 'skill' },
      ]),
    ).toEqual(['Skill is missing.', '2 lines are still marked uncertain.']);
    expect(readabilityLines([])).toEqual([]);
  });
});

describe('changedLines / templatePatch', () => {
  it('keeps only lines that differ from the saved text', () => {
    expect(changedLines(version(), { a: 'Analyst', b: 'SQL, Python', zz: 'gone' })).toEqual([{ factId: 'b', text: 'SQL, Python' }]);
    expect(changedLines(null, { a: 'x' })).toEqual([]);
  });
  it('saves typed lines with the template, never for a read-only copy', () => {
    expect(templatePatch(version(), 'modern', { a: 'Lead analyst' }, 4)).toEqual({ templateId: 'modern', lines: [{ factId: 'a', text: 'Lead analyst' }], expectedRevision: 4 });
    expect(templatePatch(version({ document: {} as never }), 'modern', { a: 'Lead analyst' }, 4).lines).toEqual([]);
  });
});

describe('paid keys', () => {
  it('reuses a key for a retry after a lost response or 5xx', () => {
    let n = 0;
    const keys = createPaidKeys(() => `k${++n}`);
    const first = keys.keyFor('generate:r1');
    keys.settle('generate:r1', err(0, 'network_error'));
    expect(keys.keyFor('generate:r1')).toBe(first);
    keys.settle('generate:r1', err(500, 'internal'));
    expect(keys.keyFor('generate:r1')).toBe(first);
  });
  it('drops the key after success, a 4xx or provider_unavailable', () => {
    let n = 0;
    const keys = createPaidKeys(() => `k${++n}`);
    keys.keyFor('a');
    keys.settle('a');
    expect(keys.has('a')).toBe(false);
    keys.keyFor('b');
    keys.settle('b', err(503, 'provider_unavailable', { released: true }));
    expect(keys.has('b')).toBe(false);
    keys.keyFor('c');
    keys.settle('c', err(402, 'quota_exhausted'));
    expect(keys.has('c')).toBe(false);
    expect(keyIsSpent(new Error('x'))).toBe(false);
    expect(isRevisionConflict(err(409, 'revision_conflict'))).toBe(true);
    expect(isRevisionConflict(err(409, 'capacity_exceeded'))).toBe(false);
  });
  it('keeps actions apart', () => {
    let n = 0;
    const keys = createPaidKeys(() => `k${++n}`);
    expect(keys.keyFor('tailor:r1:o1')).not.toBe(keys.keyFor('tailor:r1:o2'));
  });
});

describe('paidFailure', () => {
  it('explains the unconfigured AI provider and that no credit was used', () => {
    const f = paidFailure(err(503, 'provider_unavailable', { released: true, reason: 'ai_not_configured' }));
    expect(f.body).toMatch(/Needs the AI provider, which is not configured/);
    expect(f.body).toMatch(/No document credit was used/);
  });
  it('separates unusable output, missing facts, missing listing, quota and capacity', () => {
    expect(paidFailure(err(503, 'provider_unavailable', { released: true, reason: 'unsupported_employer' })).title).toBe('The draft was not usable');
    expect(paidFailure(err(400, 'validation_error', { reason: 'no_confirmed_facts' })).title).toBe('Add facts first');
    expect(paidFailure(err(404, 'not_found')).title).toBe('Listing not found');
    expect(paidFailure(err(402, 'quota_exhausted'), { includedRemaining: 0, packRemaining: 0, renewalDate: '2026-12-02T09:16:05.969Z' }).body).toMatch(/2026-12-02/);
    expect(paidFailure(err(409, 'capacity_exceeded', { limit: 10 })).body).toMatch(/10 resume versions/);
    expect(paidFailure(err(0, 'network_error')).body).toMatch(/No connection/);
  });
  it('says a referral or thank-you note needs a target, and that nothing was charged', () => {
    const f = paidFailure(err(400, 'validation_error', { field: 'context', reason: 'missing_target' }));
    expect(f.body).toMatch(/needs a saved opportunity/);
    expect(f.body).toMatch(/Nothing was charged/);
  });
  it('words a failed CV creation', () => {
    expect(createResumeFailure(err(409, 'capacity_exceeded', { limit: 3 }))).toMatch(/3 career CVs/);
    expect(createResumeFailure(err(400, 'validation_error'))).toMatch(/Check the name/);
  });
});

describe('versionMeta', () => {
  it('shows day, layout and state', () => {
    expect(versionMeta(version())).toBe('2026-11-02 · Editorial · Draft');
  });
});

describe('writing types and notes', () => {
  it('labels every writing type the API accepts, new ones included', () => {
    expect(WRITING_TYPE_OPTIONS.map((o) => o.id)).toEqual(['cover_letter', 'bio', 'linkedin', 'outreach', 'referral_request', 'thank_you']);
    expect(writingTypeLabel('referral_request')).toBe('Referral request');
    expect(writingTypeLabel('thank_you')).toBe('Thank-you note');
    expect(writingTypeLabel('future_type')).toBe('future_type');
    expect(isTargetedWritingType('thank_you')).toBe(true);
    expect(isTargetedWritingType('bio')).toBe(false);
    expect(takesWritingContext('cover_letter')).toBe(false);
  });

  it('sends only trimmed notes, and the interview date only for thank-you notes', () => {
    const notes = { ...EMPTY_WRITING_CONTEXT, organization: '  Acme   Ltd ', contactName: 'Sam', interviewDate: '2026-11-20' };
    expect(writingContextInput('bio', EMPTY_WRITING_CONTEXT, false)).toEqual({ ok: true, context: undefined });
    expect(writingContextInput('cover_letter', notes, false)).toEqual({ ok: true, context: undefined });
    expect(writingContextInput('outreach', notes, false)).toEqual({ ok: true, context: { organization: 'Acme Ltd', contactName: 'Sam' } });
    expect(writingContextInput('thank_you', notes, false)).toEqual({
      ok: true,
      context: { organization: 'Acme Ltd', contactName: 'Sam', interviewDate: '2026-11-20' },
    });
  });

  it('refuses a missing target, an impossible date and over-long notes before anything is charged', () => {
    const missing = writingContextInput('referral_request', EMPTY_WRITING_CONTEXT, false);
    expect(missing.ok ? null : missing.message).toMatch(/Nothing was charged/);
    expect(writingContextInput('referral_request', EMPTY_WRITING_CONTEXT, true)).toEqual({ ok: true, context: undefined });
    const date = writingContextInput('thank_you', { ...EMPTY_WRITING_CONTEXT, role: 'Analyst', interviewDate: '2026-02-31' }, false);
    expect(date.ok ? null : date.message).toMatch(/real date/);
    const long = writingContextInput('bio', { ...EMPTY_WRITING_CONTEXT, organization: 'x'.repeat(121) }, false);
    expect(long.ok ? null : long.message).toMatch(/120/);
  });
});

describe('the listing parameter', () => {
  it('accepts only a well-formed listing id', () => {
    expect(opportunityParam('opp_123-a')).toBe('opp_123-a');
    expect(opportunityParam(['abc', 'def'])).toBe('abc');
    expect(opportunityParam('../etc')).toBeNull();
    expect(opportunityParam('')).toBeNull();
    expect(opportunityParam('x'.repeat(101))).toBeNull();
    expect(opportunityParam(undefined)).toBeNull();
  });
});
