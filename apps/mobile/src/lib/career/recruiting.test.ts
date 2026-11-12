import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import { isDiscoverable, optInSaveError, RECRUITING_COPY, statusLine } from './recruiting';

describe('recruiting opt-in', () => {
  it('reads the current choice from the opted-in list', () => {
    const search = { items: [{ candidateAuthUserId: 'other', label: 'Opted-in candidate' }, { candidateAuthUserId: 'me', label: 'Opted-in candidate' }] };
    expect(isDiscoverable(search, 'me')).toBe(true);
    expect(isDiscoverable(search, 'someone')).toBe(false);
    expect(isDiscoverable({ items: [] }, 'me')).toBe(false);
    expect(isDiscoverable(undefined, 'me')).toBeNull();
    expect(isDiscoverable(search, null)).toBeNull();
  });

  it('describes the state honestly', () => {
    expect(statusLine(true)).toMatch(/discoverable/);
    expect(statusLine(false)).toMatch(/not discoverable/);
    expect(statusLine(null)).toMatch(/could not be read/);
  });

  it('keeps the website consent wording', () => {
    expect(RECRUITING_COPY.consent).toBe('Employers may see that I opted in. My email stays private.');
    expect(RECRUITING_COPY.help).toBe('Search shows only people who opted in, and it does not show their email.');
  });

  it('maps errors without a purchase route', () => {
    expect(optInSaveError(new ApiError(409, 'not_purchasable', { code: 'not_purchasable' }))).toMatch(/not for sale/);
    expect(optInSaveError(new Error('x'))).toBe('That change was not saved. Try again.');
  });
});
