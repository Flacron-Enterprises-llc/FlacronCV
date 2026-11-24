import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import {
  allowanceLine,
  changedPatch,
  checkImportText,
  checkPreferences,
  countsLine,
  factFields,
  factTitle,
  fieldErrorMap,
  fromDraft,
  fromPreferencesDraft,
  importFailure,
  isFactType,
  missingFieldsLine,
  missingSectionsLine,
  newFactValue,
  preferencesDraftsEqual,
  preferencesSummary,
  revisionLine,
  toDraft,
  toggle,
  toPreferencesDraft,
  uncertainNote,
  unplacedErrors,
} from './profile';

describe('fact drafts', () => {
  it('round-trips a stored fact through the form', () => {
    const draft = toDraft('project', { name: 'Site', technologies: ['React', 'Node'], url: null });
    expect(draft.technologies).toBe('React, Node');
    expect(draft.url).toBe('');
    expect(fromDraft('project', draft).technologies).toEqual(['React', 'Node']);
  });

  it('maps booleans to "true" / blank', () => {
    expect(toDraft('experience', { current: true }).current).toBe('true');
    expect(fromDraft('experience', { current: '' }).current).toBeNull();
  });

  it('sends only changed fields, and null when nothing changed', () => {
    const stored = { name: 'TypeScript', category: null };
    expect(changedPatch('skill', stored, toDraft('skill', stored), 'draft')).toEqual({ ok: true, patch: null });
    expect(changedPatch('skill', stored, { name: 'TypeScript', category: 'Languages' }, 'draft')).toEqual({
      ok: true,
      patch: { category: 'Languages' },
    });
  });

  it('applies the shared checks: dates, date order, current role, required on confirm', () => {
    const bad = changedPatch('experience', {}, { position: 'Dev', company: 'X', startDate: '2021', endDate: '2020' }, 'draft');
    expect(bad).toEqual({ ok: false, errors: [{ field: 'endDate', reason: 'date_order' }] });
    const date = changedPatch('experience', {}, { position: 'Dev', company: 'X', startDate: 'March 2020' }, 'draft');
    expect(date.ok).toBe(false);
    const current = changedPatch('experience', {}, { position: 'Dev', company: 'X', current: 'true', endDate: '2022' }, 'draft');
    expect(current).toEqual({ ok: false, errors: [{ field: 'endDate', reason: 'current_with_end_date' }] });
    const confirm = changedPatch('skill', {}, { name: '' }, 'confirmed');
    expect(confirm).toEqual({ ok: false, errors: [{ field: 'name', reason: 'required' }] });
  });

  it('adds https to a bare web address', () => {
    const result = changedPatch('contact', {}, { fullName: 'A', linkedin: 'linkedin.com/in/a' }, 'draft');
    expect(result.ok && result.patch?.linkedin).toBe('https://linkedin.com/in/a');
  });

  it('refuses a new fact with nothing filled in, accepts a partial draft', () => {
    expect(newFactValue('skill', { name: '  ' }, 'draft')).toEqual({ ok: false, empty: true });
    const partial = newFactValue('experience', { position: 'Dev' }, 'draft');
    expect(partial.ok).toBe(true);
    expect(newFactValue('experience', { position: 'Dev' }, 'confirmed')).toEqual({
      ok: false,
      errors: [{ field: 'company', reason: 'required' }],
    });
  });

  it('labels fields with the required mark and titles facts like the web', () => {
    const fields = factFields('skill');
    expect(fields.map((f) => f.label)).toEqual(['Name (required)', 'Category']);
    expect(factTitle('experience', { position: 'Dev', company: 'Acme' })).toBe('Dev · Acme');
    expect(factTitle('skill', {})).toBe('Skill');
    expect(isFactType('reference')).toBe(true);
    expect(isFactType('nope')).toBe(false);
  });

  it('maps field errors to messages and keeps unplaced ones', () => {
    const map = fieldErrorMap([
      { field: 'email', reason: 'invalid_email' },
      { field: 'email', reason: 'too_long' },
      { field: '', reason: 'weird' },
    ]);
    expect(map.email).toBe('Enter a valid email address.');
    expect(map['']).toBe('This value is not usable.');
    expect(unplacedErrors('contact', map)).toBe('This value is not usable.');
    expect(unplacedErrors('contact', { email: 'x' })).toBeNull();
  });

  it('describes uncertainty, missing fields, counts and revisions', () => {
    expect(uncertainNote('unparsed_date', 'Summer 2019')).toBe('The date could not be stored as written. The resume said “Summer 2019”.');
    expect(missingFieldsLine(['company'])).toBe('Still needed before you can confirm: Employer');
    expect(missingFieldsLine([])).toBeNull();
    expect(
      countsLine([
        { factType: 'contact', confirmation: 'confirmed' },
        { factType: 'summary', confirmation: 'confirmed' },
        { factType: 'experience', confirmation: 'confirmed' },
        { factType: 'education', confirmation: 'confirmed' },
        { factType: 'skill', confirmation: 'draft' },
      ]),
    ).toBe('4 confirmed, 1 still to review. Still to confirm: Skill');
    expect(revisionLine({ revision: 2, change: 'edited' })).toBe('Version 2: edited');
  });
});

describe('resume import', () => {
  it('shows the allowance and the reset day', () => {
    expect(allowanceLine({ limit: 3, remaining: 2, resetsAt: '2026-11-13T00:00:00.000Z' })).toBe('2 imports left today');
    expect(allowanceLine({ limit: 3, remaining: 1, resetsAt: '2026-11-13T00:00:00.000Z' })).toBe('1 import left today');
    expect(allowanceLine({ limit: 3, remaining: 0, resetsAt: '2026-11-13T00:00:00.000Z' })).toBe(
      'The daily import limit is 3. It resets on 2026-11-13 UTC.',
    );
  });

  it('cleans pasted text and refuses empty or oversized text', () => {
    expect(checkImportText('  Jane\r\nDev  \t\n')).toEqual({ ok: true, text: 'Jane\nDev' });
    expect(checkImportText('   ').ok).toBe(false);
    expect(checkImportText('x'.repeat(100_001)).ok).toBe(false);
  });

  it('turns failures into a clean message, never a success', () => {
    const allowance = { limit: 3, resetsAt: '2026-11-13T00:00:00.000Z' };
    const unavailable = importFailure(new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' }), allowance);
    expect(unavailable.kind).toBe('unavailable');
    expect(unavailable.kind === 'unavailable' && unavailable.body).toMatch(/AI provider, which is not configured/);
    expect(importFailure(new ApiError(429, 'import_daily_limit', { code: 'import_daily_limit', limit: 5, resetsAt: 'R' }), allowance)).toEqual({
      kind: 'limit',
      limit: 5,
      resetsAt: 'R',
    });
    expect(importFailure(new ApiError(429, 'import_daily_limit', { code: 'import_daily_limit' }), allowance)).toEqual({
      kind: 'limit',
      limit: 3,
      resetsAt: allowance.resetsAt,
    });
    expect(importFailure(new Error('boom'), allowance).kind).toBe('failed');
    expect(importFailure(new ApiError(403, 'ai_consent_declined', { code: 'ai_consent_declined' }), allowance)).toMatchObject({ body: expect.stringMatching(/permission/) });
    expect(missingSectionsLine(['education', 'skill'])).toBe('The resume had no Education, Skill. Nothing was added for them.');
    expect(missingSectionsLine([])).toBeNull();
  });
});

describe('preferences', () => {
  const stored = {
    targetRoles: ['Engineer', 'Lead'],
    locations: ['Paris'],
    arrangements: ['remote' as const],
    schedules: ['full_time' as const],
    seniority: 'senior' as const,
    minimumPay: { amount: 60000, currency: 'EUR', period: 'year' as const },
    learningHoursPerWeek: 4,
    careerGoals: 'Lead a team',
  };

  it('round-trips stored preferences through the form', () => {
    const draft = toPreferencesDraft(stored);
    expect(draft.targetRoles).toBe('Engineer, Lead');
    expect(fromPreferencesDraft(draft)).toEqual(stored);
    expect(checkPreferences(draft)).toEqual({ ok: true, value: stored });
  });

  it('starts empty and saves empty as the web does', () => {
    const draft = toPreferencesDraft(undefined);
    expect(fromPreferencesDraft(draft)).toEqual({
      targetRoles: [],
      locations: [],
      arrangements: [],
      schedules: [],
      seniority: null,
      minimumPay: null,
      learningHoursPerWeek: null,
      careerGoals: null,
    });
  });

  it('upper-cases the currency and rejects bad pay or hours', () => {
    const draft = { ...toPreferencesDraft(stored), currency: 'usd' };
    expect(fromPreferencesDraft(draft).minimumPay?.currency).toBe('USD');
    const badPay = checkPreferences({ ...draft, amount: '12.5' });
    expect(badPay.ok === false && badPay.field).toBe('minimumPay');
    const badCurrency = checkPreferences({ ...draft, currency: 'US' });
    expect(badCurrency.ok === false && badCurrency.field).toBe('minimumPay');
    const badHours = checkPreferences({ ...draft, hours: '90' });
    expect(badHours.ok === false && badHours.message).toMatch(/0 to 80/);
  });

  it('detects edits regardless of selection order, and summarises', () => {
    const a = toPreferencesDraft(stored);
    expect(preferencesDraftsEqual(a, { ...a, schedules: toggle(toggle(a.schedules, 'contract'), 'contract') })).toBe(true);
    expect(preferencesDraftsEqual(a, { ...a, arrangements: toggle(a.arrangements, 'hybrid') })).toBe(false);
    expect(preferencesSummary(stored)).toContain('Minimum pay: 60000 EUR a year');
    expect(preferencesSummary(undefined)).toEqual([]);
  });
});
