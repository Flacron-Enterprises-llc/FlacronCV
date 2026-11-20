import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/routing', () => ({ Link: () => null, usePathname: () => '/career' }));
vi.mock('./CareerServices', () => ({ useCareerAccess: () => ({ data: undefined }) }));
import { LINK_ALLOWANCE, LINK_FEATURE, NAV_GROUPS, PAGE_TABS, linkState, linkSwitchedOn, pageTabs, sidebarGroups } from './CareerNav';

const ALL_ON = {
  evidenceItems: true,
  portfolioPages: true,
  actionPacks: true,
  applicationAnalytics: true,
  coachingResponses: true,
  voiceMinutes: true,
  skillReports: true,
  scenarioReports: true,
  staffSeats: true,
};
const hrefs = (groups: ReturnType<typeof sidebarGroups>) => groups.flatMap((g) => g.links.map((l) => l.href));

describe('career navigation states', () => {
  it('reads the operator switches from /access', () => {
    expect(linkSwitchedOn('/career/evidence', { evidenceItems: false })).toBe(false);
    expect(linkSwitchedOn('/career/evidence', {})).toBe(false);
    expect(linkSwitchedOn('/career/evidence', { evidenceItems: true })).toBe(true);
    expect(linkSwitchedOn('/career/profile', {})).toBe(true);
    expect(linkSwitchedOn('/career/data', undefined)).toBe(true);
  });

  it('only maps pages the sidebar or a page tab can reach', () => {
    const links = new Set<string>([
      ...NAV_GROUPS.flatMap((g) => g.links.map((l) => l.href as string)),
      ...PAGE_TABS.flatMap((f) => f.tabs.map((t) => t.href as string)),
    ]);
    for (const href of [...Object.keys(LINK_FEATURE), ...Object.keys(LINK_ALLOWANCE)]) expect(links.has(href)).toBe(true);
  });

  it('decides available, not open yet, or a higher plan', () => {
    const on = { staffSeats: true, assistedForms: true, evidenceItems: true, scenarioReports: true };
    expect(linkState('/career/business', { features: on, careerPlan: 'professional' })).toBe('plan');
    expect(linkState('/career/business', { features: on, careerPlan: 'business' })).toBe('available');
    expect(linkState('/career/business', { features: {}, careerPlan: 'business' })).toBe('soon');
    expect(linkState('/career/forms', { features: on, careerPlan: 'business' })).toBe('soon');
    expect(linkState('/career/evidence', { features: on, careerPlan: 'free' })).toBe('available');
    expect(linkState('/career/scenarios', { features: on, careerPlan: 'free' })).toBe('plan');
    expect(linkState('/career/profile', { features: {}, careerPlan: 'free' })).toBe('available');
    expect(linkState('/career/scenarios', { features: on })).toBe('available');
  });
});

describe('sidebar groups', () => {
  it('lists only the V1 pages without career access', () => {
    for (const access of [undefined, { enabled: false }]) {
      const groups = sidebarGroups(access);
      expect(hrefs(groups)).toEqual(['/cv', '/cover-letters', '/cv/new/pick-template', '/jobs']);
      expect(groups.map((g) => g.key)).toEqual(['documents', 'job_search']);
    }
  });

  it('leaves out pages that are not open yet instead of labelling them "coming soon"', () => {
    const list = hrefs(sidebarGroups({ enabled: true, features: { ...ALL_ON, evidenceItems: false }, careerPlan: 'business' }));
    expect(list).not.toContain('/career/evidence');
    expect(list).not.toContain('/career/forms');
    expect(list).not.toContain('/career/recruiting');
    expect(list).not.toContain('/career/services');
    expect(list).toContain('/career/profile');
  });

  it('keeps higher-plan pages with a lock, but team tools only for plans with them', () => {
    const groups = sidebarGroups({ enabled: true, features: ALL_ON, careerPlan: 'free' });
    const scenarios = groups.flatMap((g) => g.links).find((l) => l.href === '/career/scenarios');
    expect(scenarios?.state).toBe('plan');
    expect(groups.map((g) => g.key)).not.toContain('business');
    const business = sidebarGroups({ enabled: true, features: ALL_ON, careerPlan: 'business' });
    expect(business[0]).toEqual({ key: 'home', links: [{ href: '/career', key: 'overview', career: true, state: 'available' }] });
    expect(business.find((g) => g.key === 'business')?.links.map((l) => l.href)).toEqual(['/career/business', '/career/developer']);
  });

  it('puts each destination in the sidebar once', () => {
    const list = hrefs(sidebarGroups({ enabled: true, features: ALL_ON, careerPlan: 'business' }));
    expect(new Set(list).size).toBe(list.length);
    expect(list).not.toContain('/career/interviews/voice');
    expect(list).not.toContain('/career/opportunities/map');
  });
});

describe('page tabs', () => {
  it('shows text/voice tabs only when voice is open', () => {
    expect(pageTabs('/career/interviews', { enabled: true, features: ALL_ON })?.map((t) => t.href)).toEqual(['/career/interviews', '/career/interviews/voice']);
    expect(pageTabs('/career/interviews/voice', { enabled: true, features: ALL_ON })).not.toBeNull();
    expect(pageTabs('/career/interviews', { enabled: true, features: { ...ALL_ON, voiceMinutes: false } })).toBeNull();
  });

  it('hides the map tab while maps are off, and has no tabs elsewhere', () => {
    expect(pageTabs('/career/opportunities', { enabled: true, features: ALL_ON })).toBeNull();
    expect(pageTabs('/career/opportunities', { enabled: true, features: { ...ALL_ON, mapSessions: true } })?.length).toBe(2);
    expect(pageTabs('/career/profile', { enabled: true, features: ALL_ON })).toBeNull();
    expect(pageTabs('/career/interviews', undefined)).toBeNull();
  });
});
