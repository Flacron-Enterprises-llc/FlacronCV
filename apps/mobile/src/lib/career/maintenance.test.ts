import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import { checkCredential, checkExpiryDate, checkTitle, dueCredentials, formatExpiry, isEmpty, maintenanceErrorMessage } from './maintenance';

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

describe('view helpers', () => {
  it('formats a calendar day without a time-zone shift', () => {
    expect(formatExpiry('2027-03-01')).toBe('1 March 2027');
    expect(formatExpiry('bad')).toBe('bad');
  });

  it('lists due credentials and detects an empty view', () => {
    const view = {
      achievements: [],
      promotionGoals: [],
      credentials: [
        { id: '1', name: 'A', expiresOn: '2026-01-01', due: true },
        { id: '2', name: 'B', expiresOn: '2030-01-01', due: false },
      ],
    };
    expect(dueCredentials(view).map((c) => c.id)).toEqual(['1']);
    expect(isEmpty(view)).toBe(false);
    expect(isEmpty({ achievements: [], promotionGoals: [], credentials: [] })).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });
});

describe('maintenanceErrorMessage', () => {
  it('never claims a save', () => {
    expect(maintenanceErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'expiresOn' }))).toMatch(/YYYY-MM-DD/);
    expect(maintenanceErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'title' }))).toMatch(/Nothing was saved/);
    expect(maintenanceErrorMessage(new Error('x'))).toMatch(/not saved/);
  });
});
