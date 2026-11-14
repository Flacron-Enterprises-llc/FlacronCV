/**
 * CV "References" entries (name, title, company, email, phone, relationship)
 * must render as references on every layout.
 *
 * Before the fix a reference WITH a company fell into the experience branch
 * (`item.position || item.company`): no name, a "Present" date and a bare
 * company line. One WITHOUT a company fell into the generic branch and lost
 * everything but the name.
 *
 * The snapshot block at the bottom pins every OTHER section type: those
 * snapshots were recorded from the code as it was before the reference fix,
 * so they prove experience / education / projects / certifications / languages
 * / awards / custom / volunteer / publications render byte-identically.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CV, CVSection, CVLayout } from '@flacroncv/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

import { ItemRenderer, getTokens } from '../shared';
import ClassicLayout from '../ClassicLayout';
import SidebarLayout from '../SidebarLayout';
import TopBarLayout from '../TopBarLayout';
import CompactLayout from '../CompactLayout';
import SlateGoldLayout from '../SlateGoldLayout';
import { buildSampleCV } from '@/lib/previewSampleCV';

const LAYOUTS: Array<[CVLayout, React.ComponentType<{ cv: CV; sections: CVSection[] }>]> = [
  ['classic', ClassicLayout],
  ['sidebar', SidebarLayout],
  ['top-bar', TopBarLayout],
  ['compact', CompactLayout],
  ['slate-gold', SlateGoldLayout],
];

function section(type: string, title: string, items: any[], id = type): CVSection {
  return {
    id, type: type as any, title, isVisible: true, order: 0, items,
    createdAt: new Date(0), updatedAt: new Date(0),
  };
}

const REF_WITH_COMPANY = {
  id: 'r1', order: 0, name: 'Jane Doe', title: 'CTO', company: 'Acme Corp',
  email: 'jane@acme.example', phone: '+1 555 0100', relationship: 'Former manager',
};
const REF_WITHOUT_COMPANY = {
  id: 'r2', order: 1, name: 'Sam Lee', title: 'Senior Engineer', company: '',
  email: 'sam@example.com', phone: '', relationship: 'Colleague',
};
const REF_NAME_ONLY = {
  id: 'r3', order: 2, name: 'Pat Kim', title: '', company: '', email: '', phone: '', relationship: '',
};

function render(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

function renderLayout(layout: CVLayout, Layout: React.ComponentType<{ cv: CV; sections: CVSection[] }>, sections: CVSection[]) {
  const cv = buildSampleCV(layout, '#1e3a5f');
  return render(<Layout cv={cv} sections={sections} />);
}

/** Text nodes in document order, space-separated and whitespace-collapsed. */
function textOf(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.nodeValue || '');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ─── ItemRenderer ────────────────────────────────────────────────────────────

describe('ItemRenderer — references', () => {
  const cv = buildSampleCV('classic', '#1e3a5f');
  const { primary, fs, sp, br } = getTokens(cv);

  for (const variant of ['default', 'card', 'sidebar'] as const) {
    describe(`variant=${variant}`, () => {
      const renderRef = (item: any) =>
        render(<ItemRenderer item={item} sectionType="references" primary={primary} fs={fs} sp={sp} br={br} variant={variant} />);

      it('a reference with a company shows name, role, contact and relationship — no date', () => {
        const html = renderRef(REF_WITH_COMPANY);
        const text = textOf(html);
        expect(text).toBe('Jane Doe CTO, Acme Corp jane@acme.example · +1 555 0100 Former manager');
        expect(text).not.toContain('Present');
        // Name comes first and is the item's title line.
        expect(text.indexOf('Jane Doe')).toBe(0);
      });

      it('a reference without a company keeps title, email and relationship', () => {
        const text = textOf(renderRef(REF_WITHOUT_COMPANY));
        expect(text).toBe('Sam Lee Senior Engineer sam@example.com Colleague');
        expect(text).not.toContain('Present');
        expect(text).not.toContain(',');
        expect(text).not.toContain('·');
      });

      it('hides empty lines', () => {
        const html = renderRef(REF_NAME_ONLY);
        expect(textOf(html)).toBe('Pat Kim');
        // Only the name line: no empty <p> for role / contact / relationship.
        expect(html).not.toContain('<p');
      });

      it('a reference with only a company still shows it (and nothing experience-like)', () => {
        const text = textOf(renderRef({ ...REF_NAME_ONLY, name: '', company: 'Globex' }));
        expect(text).toBe('Globex');
      });
    });
  }
});

// ─── Each layout ─────────────────────────────────────────────────────────────

describe.each(LAYOUTS)('%s layout — references section', (layout, Layout) => {
  const refs = section('references', 'References', [REF_WITH_COMPANY, REF_WITHOUT_COMPANY, REF_NAME_ONLY]);

  it('renders every reference field, in order, with no "Present"', () => {
    const text = textOf(renderLayout(layout, Layout, [refs]));
    expect(text).toContain('Jane Doe CTO, Acme Corp jane@acme.example · +1 555 0100 Former manager');
    expect(text).toContain('Sam Lee Senior Engineer sam@example.com Colleague');
    expect(text).toContain('Pat Kim');
    expect(text).not.toContain('Present');
  });
});

// ─── Byte-identical pin for every other section type ─────────────────────────

const OTHER_SECTIONS: CVSection[] = [
  section('experience', 'Experience', [
    { id: 'e1', company: 'Acme', position: 'Lead Engineer', location: 'Remote', startDate: '2020-01', endDate: '', isCurrent: true, description: 'Led the platform team.\nShipped v2.', highlights: [], order: 0 },
    { id: 'e2', company: 'Initech', position: 'Engineer', location: '', startDate: '2017-03', endDate: '2019-12', isCurrent: false, description: '', highlights: [], order: 1 },
    { id: 'e3', company: '', position: 'Freelancer', location: '', startDate: '', endDate: '', isCurrent: false, description: '', highlights: [], order: 2 },
  ]),
  section('education', 'Education', [
    { id: 'd1', institution: 'State University', degree: 'BSc', field: 'Computer Science', startDate: '2013', endDate: '2017', gpa: '3.8', description: 'Honours', order: 0 },
  ]),
  section('projects', 'Projects', [
    { id: 'p1', name: 'OpenThing', description: 'An open-source thing.', url: 'https://example.com', technologies: ['TS'], startDate: '2021-05', endDate: '', order: 0 },
  ]),
  section('certifications', 'Certifications', [
    { id: 'c1', name: 'AWS SA', issuer: 'Amazon', date: '2022-01', expiryDate: '', credentialId: '', url: '', order: 0 },
  ]),
  section('languages', 'Languages', [
    { id: 'l1', name: 'English', proficiency: 'Native', order: 0 },
    { id: 'l2', name: 'French', proficiency: 'B2', order: 1 },
  ]),
  section('skills', 'Skills', [
    { id: 's1', name: 'TypeScript', level: 'expert', category: '', order: 0 },
    { id: 's2', name: 'Go', level: 'advanced', category: '', order: 1 },
  ]),
  section('awards', 'Awards', [
    { id: 'a1', title: 'Hackathon winner', description: 'Global Fintech Week', date: '2023-11', order: 0 },
  ]),
  section('volunteer', 'Volunteer', [
    { id: 'v1', company: 'Food Bank', position: 'Organiser', startDate: '2019', endDate: '2020', description: 'Weekly drives', order: 0 },
  ]),
  section('publications', 'Publications', [
    { id: 'pb1', title: 'On Things', description: 'Journal of Things', date: '2020', order: 0 },
  ]),
  section('custom', 'Custom', [
    { id: 'x1', title: 'Side note', subtitle: 'Sub', description: 'Body text', date: '2024-02', order: 0 },
    { id: 'x2', name: 'Named custom', description: '', order: 1 },
  ]),
];

describe('other section types render byte-identically (pinned before the reference fix)', () => {
  it.each(LAYOUTS)('%s layout', (layout, Layout) => {
    expect(renderLayout(layout, Layout, OTHER_SECTIONS)).toMatchSnapshot();
  });

  const cv = buildSampleCV('classic', '#1e3a5f');
  const { primary, fs, sp, br } = getTokens(cv);
  for (const s of OTHER_SECTIONS) {
    for (const variant of ['default', 'card', 'sidebar'] as const) {
      it(`ItemRenderer ${s.type} variant=${variant}`, () => {
        const html = s.items
          .map((item: any, i: number) => render(
            <ItemRenderer key={i} item={item} sectionType={s.type} primary={primary} fs={fs} sp={sp} br={br} variant={variant} />,
          ))
          .join('\n');
        expect(html).toMatchSnapshot();
      });
    }
  }
});
