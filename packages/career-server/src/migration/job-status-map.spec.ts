import { mapJob } from './migration.service';
import { careerStatusFromV1 } from '../integration/v1-plan-bridge';

/** V1 job-tracker statuses (current and legacy) → career statuses. Pure; no database. */
describe('V1 job status mapping', () => {
  it.each([
    ['saved', 'saved'],
    ['preparing', 'preparing'],
    ['applied', 'applied'],
    ['interviewing', 'interviewing'],
    ['offered', 'offered'],
    ['rejected', 'rejected'],
    ['withdrawn', 'withdrawn'],
    ['wishlist', 'saved'],
    ['offer', 'offered'],
    ['accepted', 'offered'],
  ])('live bridge: %s → %s', (v1, career) => {
    expect(careerStatusFromV1(v1)).toBe(career);
  });

  it('live bridge drops unknown or missing statuses', () => {
    expect(careerStatusFromV1('archived')).toBeNull();
    expect(careerStatusFromV1(undefined)).toBeNull();
  });

  it.each(['saved', 'preparing', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'])(
    'migration keeps current status %s',
    (status) => {
      expect(mapJob({ status, notes: 'n', outcome: null })).toEqual({ status, notes: 'n' });
    },
  );

  it('migration maps legacy statuses like normalizeJobStatus', () => {
    expect(mapJob({ status: 'wishlist', notes: '' })).toEqual({ status: 'saved', notes: '' });
    expect(mapJob({ status: 'offer', notes: '' })).toEqual({ status: 'offered', notes: '' });
    expect(mapJob({ status: 'accepted', notes: '' })).toEqual({ status: 'offered', notes: 'V1 status: accepted' });
  });

  it('an offered job with outcome accepted maps exactly like legacy accepted', () => {
    expect(mapJob({ status: 'offered', notes: 'Great team', outcome: 'accepted' })).toEqual(
      mapJob({ status: 'accepted', notes: 'Great team' }),
    );
    expect(mapJob({ status: 'offered', notes: 'Great team', outcome: 'accepted' })).toEqual({
      status: 'offered',
      notes: 'Great team\nV1 status: accepted',
    });
  });

  it('other outcomes do not add an acceptance note; unknown statuses fall to saved', () => {
    expect(mapJob({ status: 'offered', notes: '', outcome: 'declined' })).toEqual({ status: 'offered', notes: '' });
    expect(mapJob({ status: 'mystery', notes: '' })).toEqual({ status: 'saved', notes: '' });
  });
});
