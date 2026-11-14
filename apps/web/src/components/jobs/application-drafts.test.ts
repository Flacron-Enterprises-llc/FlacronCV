import { describe, expect, it } from 'vitest';
import { ApiError } from '@flacroncv/career-api-client';
import { draftContextOf, problemOf } from './application-drafts';

describe('application drafts: what the career writing API is given', () => {
  it('sends the application’s own company, role, first contact and interview day', () => {
    expect(
      draftContextOf({
        company: ' Acme Ltd ',
        position: 'Data analyst',
        contactName: 'Old mirror',
        interviewDate: '2026-11-20T09:30:00.000Z',
        contacts: [{ id: 'c1', name: 'Dana Lee', role: 'Hiring manager', email: null, phone: null, notes: null }],
      }),
    ).toEqual({ organization: 'Acme Ltd', role: 'Data analyst', contactName: 'Dana Lee', contactRole: 'Hiring manager', interviewDate: '2026-11-20' });
  });

  it('leaves out what the person did not enter instead of sending blanks', () => {
    expect(draftContextOf({ company: 'Acme', position: '  ', contactName: null, interviewDate: null, contacts: [] })).toEqual({ organization: 'Acme' });
  });

  it('explains a missing target separately from an unsupported draft type', () => {
    expect(problemOf(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'context', reason: 'missing_target' } as never))).toBe('missing_target');
    expect(problemOf(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'type' } as never))).toBe('unsupported');
  });
});
