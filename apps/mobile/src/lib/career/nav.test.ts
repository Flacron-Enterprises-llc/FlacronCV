import { describe, expect, it } from 'vitest';
import { careerLinkRows, CAREER_SECTIONS, linkLabel, linkState, mobileRoute, planIncludes, stateLabel } from './nav';

const allOn = {
  evidenceItems: true,
  portfolioPages: true,
  mapSessions: true,
  actionPacks: true,
  assistedForms: true,
  applicationAnalytics: true,
  voiceMinutes: true,
  skillReports: true,
  scenarioReports: true,
  staffSeats: true,
  coachingResponses: true,
};

describe('career area states (website CareerNav)', () => {
  it('shows a switched-off area as coming soon', () => {
    expect(linkState('/career/learning', { features: {}, careerPlan: 'career_pro' })).toBe('soon');
    expect(linkState('/career/learning', { features: { skillReports: true }, careerPlan: 'career_pro' })).toBe('available');
  });

  it('keeps forms, recruiting and services coming soon whatever the switches say', () => {
    for (const href of ['/career/forms', '/career/recruiting', '/career/services'] as const) {
      expect(linkState(href, { features: allOn, careerPlan: 'business' })).toBe('soon');
    }
  });

  it('marks an area outside the plan', () => {
    expect(linkState('/career/interviews/voice', { features: allOn, careerPlan: 'free' })).toBe('plan');
    expect(linkState('/career/learning-loop', { features: allOn, careerPlan: 'free' })).toBe('plan');
    expect(linkState('/career/business', { features: allOn, careerPlan: 'career_pro' })).toBe('plan');
    expect(linkState('/career/business', { features: allOn, careerPlan: 'business' })).toBe('available');
    expect(linkState('/career/evidence', { features: allOn, careerPlan: 'free' })).toBe('available');
    // Every plan includes coaching replies (Free 5 a month); the switch alone decides.
    expect(linkState('/career/coach', { features: allOn, careerPlan: 'free' })).toBe('available');
    expect(linkState('/career/coach', { features: {}, careerPlan: 'career_pro' })).toBe('soon');
  });

  it('never refuses an unknown plan or an area without an allowance', () => {
    expect(planIncludes('/career/scenarios', 'mystery')).toBe(true);
    expect(planIncludes('/career/scenarios', undefined)).toBe(true);
    expect(linkState('/career/profile', undefined)).toBe('available');
    expect(linkState('/career/developer', { features: {}, careerPlan: 'free' })).toBe('available');
  });

  it('maps website paths to app routes', () => {
    expect(mobileRoute('/career')).toBe('/(dashboard)/career');
    expect(mobileRoute('/career/business')).toBe('/(dashboard)/career/business');
  });

  it('lists every area with a translated label and state badge', () => {
    const rows = careerLinkRows({ features: allOn, careerPlan: 'starter' });
    expect(rows.map((row) => row.key)).toEqual(CAREER_SECTIONS.map((section) => section.key));
    expect(rows.flatMap((row) => row.links)).toHaveLength(23);
    for (const row of rows.flatMap((section) => section.links)) expect(linkLabel(row.key)).not.toContain('careerBusiness');
    expect(linkLabel('groupTeams')).toBe('More');
    expect(stateLabel('soon')).toBe('Coming soon');
    expect(stateLabel('plan')).toBe('Not in your plan');
    expect(stateLabel('available')).toBeNull();
  });
});
