import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import {
  checkAchievement,
  checkCredential,
  checkCredentialDraft,
  checkExpiryDate,
  checkGoal,
  checkOptionalDate,
  checkTitle,
  credentialDraft,
  credentialLines,
  deleteErrorMessage,
  dueCredentials,
  EMPTY_CREDENTIAL,
  errorField,
  formatExpiry,
  goalStatusLabel,
  isBlankDraft,
  isEmpty,
  linkLabels,
  maintenanceErrorMessage,
  reminderText,
} from './maintenance';

const cred = (id: string, expiresOn: string, due: boolean) => ({
  id,
  name: id,
  issuer: '',
  region: '',
  expiresOn,
  reviewOn: null as string | null,
  due,
  factId: null,
  evidenceId: null,
});

describe('checkTitle', () => {
  it('trims and enforces 1-200 characters like the server', () => {
    expect(checkTitle('  Lead analyst ', 'goal')).toEqual({ ok: true, value: 'Lead analyst' });
    expect(checkTitle('   ', 'goal').ok).toBe(false);
    expect(checkTitle('x'.repeat(200), 'goal').ok).toBe(true);
    expect(checkTitle('x'.repeat(201), 'goal').ok).toBe(false);
  });
});

describe('checkExpiryDate', () => {
  it('accepts a real YYYY-MM-DD day, past or future', () => {
    expect(checkExpiryDate('2027-03-31')).toEqual({ ok: true, value: '2027-03-31' });
    expect(checkExpiryDate(' 2020-01-01 ')).toEqual({ ok: true, value: '2020-01-01' });
    expect(checkExpiryDate('2028-02-29').ok).toBe(true);
  });

  it('refuses other formats and impossible days', () => {
    for (const bad of ['31/03/2027', '2027-3-31', '2027-03-31T00:00', '', 'soon']) expect(checkExpiryDate(bad).ok).toBe(false);
    for (const bad of ['2027-02-29', '2027-13-01', '2027-04-31', '2027-00-10', '0000-01-01']) expect(checkExpiryDate(bad).ok).toBe(false);
  });

  it('checks the name first, then the date', () => {
    expect(checkCredential(' ', '2027-01-01')).toMatchObject({ ok: false, field: 'name' });
    expect(checkCredential('First aid', '2027-02-30')).toMatchObject({ ok: false, field: 'expiresOn' });
    expect(checkCredential(' First aid ', '2027-02-28')).toEqual({ ok: true, name: 'First aid', expiresOn: '2027-02-28' });
  });
});

describe('optional dates and drafts', () => {
  it('treats blank as not set and refuses impossible days', () => {
    expect(checkOptionalDate('  ')).toEqual({ ok: true, value: null });
    expect(checkOptionalDate('2027-06-30')).toEqual({ ok: true, value: '2027-06-30' });
    expect(checkOptionalDate('2027-06-31').ok).toBe(false);
    expect(checkOptionalDate('30/06/2027').ok).toBe(false);
  });

  it('builds the achievement, goal and credential bodies', () => {
    expect(checkAchievement({ title: ' Shipped v2 ', details: ' On time ', achievedOn: '' })).toEqual({
      ok: true,
      input: { title: 'Shipped v2', details: 'On time', achievedOn: null },
    });
    expect(checkAchievement({ title: 'x', details: '', achievedOn: '2026-02-30' })).toMatchObject({ ok: false, errors: { achievedOn: expect.any(String) } });
    expect(checkAchievement({ title: '', details: 'x'.repeat(2001), achievedOn: '' })).toMatchObject({
      ok: false,
      errors: { title: expect.any(String), details: expect.any(String) },
    });
    expect(checkGoal({ desiredTitle: 'Lead', targetDate: '2027-01-15' })).toEqual({ ok: true, input: { desiredTitle: 'Lead', targetDate: '2027-01-15' } });
    expect(checkGoal({ desiredTitle: 'Lead', targetDate: '2027-13-01' }).ok).toBe(false);
    expect(checkCredentialDraft({ ...EMPTY_CREDENTIAL, name: 'Gas Safe', expiresOn: '2028-01-01', region: ' England ' })).toEqual({
      ok: true,
      input: { name: 'Gas Safe', expiresOn: '2028-01-01', reviewOn: null, issuer: '', region: 'England' },
    });
    expect(checkCredentialDraft({ ...EMPTY_CREDENTIAL, name: 'Gas Safe', expiresOn: '2028-02-30' })).toMatchObject({
      ok: false,
      errors: { expiresOn: expect.any(String) },
    });
    expect(isBlankDraft(EMPTY_CREDENTIAL)).toBe(true);
    expect(isBlankDraft({ ...EMPTY_CREDENTIAL, issuer: 'x' })).toBe(false);
  });

  it('round-trips a credential into the edit form', () => {
    const c = { ...cred('1', '2028-01-01', false), issuer: 'Board', reviewOn: '2027-10-01' };
    expect(credentialDraft(c)).toEqual({ name: '1', expiresOn: '2028-01-01', reviewOn: '2027-10-01', issuer: 'Board', region: '' });
  });
});

describe('view helpers', () => {
  it('formats a calendar day without a time-zone shift', () => {
    expect(formatExpiry('2027-03-01')).toBe('1 March 2027');
    expect(formatExpiry('bad')).toBe('bad');
  });

  it('lists due credentials and detects an empty view', () => {
    const view = { achievements: [], promotionGoals: [], credentials: [cred('1', '2026-01-01', true), cred('2', '2030-01-01', false)] };
    expect(dueCredentials(view).map((c) => c.id)).toEqual(['1']);
    expect(isEmpty(view)).toBe(false);
    expect(isEmpty({ achievements: [], promotionGoals: [], credentials: [] })).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });

  it('words reminders by kind and days left', () => {
    expect(reminderText({ kind: 'expiry', date: '2027-03-01', daysLeft: 12, expired: false })).toBe('Expires in 12 days (1 March 2027)');
    expect(reminderText({ kind: 'expiry', date: '2027-03-01', daysLeft: 0, expired: false })).toBe('Expires today (1 March 2027)');
    expect(reminderText({ kind: 'expiry', date: '2027-03-01', daysLeft: -3, expired: true })).toBe('Expired on 1 March 2027');
    expect(reminderText({ kind: 'review', date: '2027-03-01', daysLeft: 1, expired: false })).toBe('Review due in 1 day (1 March 2027)');
    expect(reminderText({ kind: 'review', date: '2027-03-01', daysLeft: -1, expired: false })).toBe('Review was due on 1 March 2027');
  });

  it('shows only the known credential details and read-only links', () => {
    expect(credentialLines({ expiresOn: '2027-03-01', reviewOn: null, issuer: '', region: '' })).toEqual(['Expires 1 March 2027']);
    expect(credentialLines({ expiresOn: '2027-03-01', reviewOn: '2027-01-01', issuer: 'Board', region: 'Ontario' })).toEqual([
      'Expires 1 March 2027',
      'Review by 1 January 2027',
      'Issued by Board',
      'Valid in Ontario',
    ]);
    expect(linkLabels({ factId: 'f', evidenceId: null })).toEqual(['Linked to a profile fact']);
    expect(linkLabels({ factId: null, evidenceId: null })).toEqual([]);
    expect(goalStatusLabel('confirmed')).toBe('Achieved');
  });
});

describe('maintenanceErrorMessage', () => {
  it('never claims a save', () => {
    expect(maintenanceErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'expiresOn' }))).toMatch(/YYYY-MM-DD/);
    expect(maintenanceErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'title' }))).toMatch(/Nothing was saved/);
    expect(maintenanceErrorMessage(new Error('x'))).toMatch(/not saved/);
  });

  it('names refused dates, achieved goals and missing entries', () => {
    expect(maintenanceErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'reviewOn', reason: 'invalid' }))).toMatch(
      /does not exist/,
    );
    expect(
      maintenanceErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'status', reason: 'already_confirmed' })),
    ).toMatch(/already achieved/);
    expect(maintenanceErrorMessage(new ApiError(404, 'not_found', { code: 'not_found' }))).toMatch(/no longer exists/);
    expect(deleteErrorMessage(new Error('x'))).toMatch(/not deleted/);
  });

  it('points a server refusal at its form field', () => {
    expect(errorField(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'achievedOn' }))).toBe('achievedOn');
    expect(errorField(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'factId' }))).toBeNull();
    expect(errorField(new Error('x'))).toBeNull();
  });
});
