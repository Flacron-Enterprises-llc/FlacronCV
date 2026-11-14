import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import { countLine, optInCount, optInSaveError, RECRUITING_COPY, statusLine } from './recruiting';

describe('recruiting opt-in', () => {
  it('reads only a count from the search', () => {
    expect(optInCount({ count: 3 })).toBe(3);
    expect(optInCount({ count: 0 })).toBe(0);
    expect(optInCount(undefined)).toBeNull();
    expect(optInCount({ count: -1 })).toBeNull();
    expect(optInCount({ count: Number.NaN })).toBeNull();
  });

  it('words the count with plurals', () => {
    expect(countLine(0)).toBe('No one has opted in yet.');
    expect(countLine(1)).toBe('1 person has opted in.');
    expect(countLine(4)).toBe('4 people have opted in.');
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
