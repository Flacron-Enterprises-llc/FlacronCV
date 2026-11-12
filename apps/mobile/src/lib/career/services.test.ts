import { describe, expect, it } from 'vitest';
import { serviceRows, SERVICES_COPY } from './services';

describe('human review services', () => {
  it('lists every service as not bookable, with no price', () => {
    const rows = serviceRows({
      items: [{ id: 'review-not-open', name: 'Named review desk', scope: 'A person reviews selected material', priceCents: null, bookingOpen: false, note: 'Closed.' }],
    });
    expect(rows).toEqual([{ id: 'review-not-open', name: 'Named review desk', scope: 'A person reviews selected material', note: 'Closed.', bookable: false }]);
    expect(Object.keys(rows[0])).not.toContain('priceCents');
  });

  it('falls back to the closed note and handles no data', () => {
    const rows = serviceRows({ items: [{ id: 'a', name: 'A', scope: 's', priceCents: null, bookingOpen: false, note: '' }] });
    expect(rows[0].note).toBe(SERVICES_COPY.closedBody);
    expect(serviceRows(undefined)).toEqual([]);
  });
});
