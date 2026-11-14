import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/routing', () => ({ Link: () => null, usePathname: () => '/career' }));
vi.mock('./CareerServices', () => ({ useCareerAccess: () => ({ data: undefined }) }));
import { CAREER_SECTIONS, LINK_ALLOWANCE, LINK_FEATURE, linkState, linkSwitchedOn } from './CareerNav';

describe('career navigation states (spec section 21)', () => {
  it('reads the operator switches from /access', () => {
    expect(linkSwitchedOn('/career/evidence', { evidenceItems: false })).toBe(false);
    expect(linkSwitchedOn('/career/evidence', {})).toBe(false);
    expect(linkSwitchedOn('/career/evidence', { evidenceItems: true })).toBe(true);
    expect(linkSwitchedOn('/career/profile', {})).toBe(true);
    expect(linkSwitchedOn('/career/data', undefined)).toBe(true);
  });

  it('only maps links that exist in the menu', () => {
    const links = new Set<string>(CAREER_SECTIONS.flatMap((s) => s.links.map(([href]) => href as string)));
    for (const href of [...Object.keys(LINK_FEATURE), ...Object.keys(LINK_ALLOWANCE)]) expect(links.has(href)).toBe(true);
  });

  it('labels every page available, coming soon, or not in the plan instead of hiding it', () => {
    const on = { staffSeats: true, assistedForms: true, evidenceItems: true, scenarioReports: true };
    expect(linkState('/career/business', { features: on, careerPlan: 'professional' })).toBe('plan');
    expect(linkState('/career/business', { features: on, careerPlan: 'business' })).toBe('available');
    expect(linkState('/career/business', { features: {}, careerPlan: 'business' })).toBe('soon');
    expect(linkState('/career/forms', { features: on, careerPlan: 'business' })).toBe('soon');
    expect(linkState('/career/recruiting', { features: on, careerPlan: 'business' })).toBe('soon');
    expect(linkState('/career/services', { features: on, careerPlan: 'business' })).toBe('soon');
    expect(linkState('/career/evidence', { features: on, careerPlan: 'free' })).toBe('available');
    expect(linkState('/career/scenarios', { features: on, careerPlan: 'free' })).toBe('plan');
    expect(linkState('/career/profile', { features: {}, careerPlan: 'free' })).toBe('available');
    expect(linkState('/career/scenarios', { features: on })).toBe('available');
  });
});
