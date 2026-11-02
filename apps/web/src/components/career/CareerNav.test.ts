import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/routing', () => ({ Link: () => null, usePathname: () => '/career' }));
vi.mock('./CareerServices', () => ({ useCareerAccess: () => ({ data: undefined }) }));
import { CAREER_SECTIONS, LINK_FEATURE, linkSwitchedOn } from './CareerNav';

describe('career navigation follows the operator switches from /access', () => {
  it('hides a page whose switch is off or missing, keeps pages without a switch', () => {
    expect(linkSwitchedOn('/career/evidence', { evidenceItems: false })).toBe(false);
    expect(linkSwitchedOn('/career/evidence', {})).toBe(false);
    expect(linkSwitchedOn('/career/evidence', { evidenceItems: true })).toBe(true);
    expect(linkSwitchedOn('/career/profile', {})).toBe(true);
    expect(linkSwitchedOn('/career/plans', undefined)).toBe(true);
  });

  it('only maps links that exist in the menu', () => {
    const links = new Set<string>(CAREER_SECTIONS.flatMap((s) => s.links.map(([href]) => href as string)));
    for (const href of Object.keys(LINK_FEATURE)) expect(links.has(href)).toBe(true);
  });
});
