import { describe, expect, it } from 'vitest';
import { suggestNextAction } from './dashboard';
import type { DashboardApplication } from './dashboard';
import type { FactCounts } from './facts';

const complete: FactCounts = { confirmed: 5, draft: 0, uncertain: 0, missingCore: [] };
const missing: FactCounts = { confirmed: 1, draft: 1, uncertain: 0, missingCore: ['skill'] };
const today = '2026-10-17';

function card(partial: Partial<DashboardApplication> & Pick<DashboardApplication, 'id'>): DashboardApplication {
  return {
    opportunityId: 'opp',
    status: 'saved',
    title: 'SQL analyst',
    deadline: null,
    ...partial,
  };
}

describe('dashboard', () => {
  it('sends an incomplete profile to the profile before a deadline', () => {
    const action = suggestNextAction({
      counts: missing,
      applications: [card({ id: 'a', deadline: '2026-11-01' })],
      alertCount: 2,
      today,
    });
    expect(action.kind).toBe('profile');
    expect(JSON.stringify(action)).not.toContain('hiring');
  });

  it('picks the soonest open deadline and skips a past or closed one', () => {
    const action = suggestNextAction({
      counts: complete,
      applications: [
        card({ id: 'past', title: 'Old', deadline: '2020-01-01' }),
        card({ id: 'closed', status: 'rejected', title: 'No', deadline: '2026-10-18' }),
        card({ id: 'later', status: 'applied', title: 'Later', deadline: '2026-12-01' }),
        card({ id: 'soon', title: 'SQL analyst', deadline: '2026-11-01' }),
      ],
      alertCount: 1,
      today,
    });
    expect(action).toMatchObject({ kind: 'application', applicationId: 'soon', deadline: '2026-11-01', title: 'SQL analyst' });
    expect(JSON.stringify(action)).not.toContain('hiring');
  });

  it('uses an alert, then interview practice, then search', () => {
    expect(suggestNextAction({ counts: complete, applications: [], alertCount: 1, today }).kind).toBe('alerts');
    const interview = suggestNextAction({
      counts: complete,
      applications: [card({ id: 'i', opportunityId: 'opp-1', status: 'interviewing' })],
      alertCount: 0,
      today,
    });
    expect(interview).toMatchObject({ kind: 'interview', opportunityId: 'opp-1' });
    const ready = suggestNextAction({ counts: complete, applications: [], alertCount: 0, today });
    expect(ready.kind).toBe('search');
    expect(JSON.stringify(ready)).not.toContain('score');
  });
});
