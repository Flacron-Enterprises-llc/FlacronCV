/**
 * Web CV DOCX export (`buildCVDocx`, via `__testables`).
 *
 * References must come out as: name, "title, company", "email · phone",
 * relationship — empty lines dropped. The byte-identity block pins every
 * other section type: those snapshots of word/document.xml were recorded
 * from the code as it was before the reference change.
 */
import { describe, it, expect } from 'vitest';
import type { CV, CVSection, CVLayout } from '@flacroncv/shared-types';
import { __testables } from './export-cv';
import { buildSampleCV } from './previewSampleCV';
// docx's own zip dependency (also what the API export tests use) — reads
// word/document.xml out of the generated file.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');

const { buildCVDocx } = __testables;

const LABELS = {
  professionalSummary: 'Professional Summary',
  profile: 'Profile',
  contact: 'Contact',
  aboutMe: 'About me',
  summary: 'Summary',
};

const LAYOUTS: CVLayout[] = ['classic', 'sidebar', 'top-bar', 'compact', 'slate-gold'];

function section(type: string, title: string, items: any[], id = type): CVSection {
  return {
    id, type: type as any, title, isVisible: true, order: 0, items,
    createdAt: new Date(0), updatedAt: new Date(0),
  };
}

async function documentXml(layout: CVLayout, sections: CVSection[]): Promise<string> {
  const cv = buildSampleCV(layout, '#1e3a5f');
  const blob = await buildCVDocx(cv as CV, sections, LABELS);
  // jsdom's Blob: read it the way a browser would.
  const ab = await new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
  const buf = Buffer.from(ab);
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/document.xml').async('string');
}

/** Paragraph texts (all <w:t> runs of a <w:p> joined), in order. */
function paragraphs(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const text = (p.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? [])
      .map((t) => t.replace(/<[^>]+>/g, ''))
      .join('');
    if (text) out.push(text);
  }
  return out;
}

const REFS = section('references', 'References', [
  { id: 'r1', order: 0, name: 'Jane Doe', title: 'CTO', company: 'Acme Corp', email: 'jane@acme.example', phone: '+1 555 0100', relationship: 'Former manager' },
  { id: 'r2', order: 1, name: 'Sam Lee', title: 'Senior Engineer', company: '', email: '', phone: '+44 20 0000', relationship: '' },
  { id: 'r3', order: 2, name: 'Pat Kim', title: '', company: '', email: '', phone: '', relationship: '' },
]);

describe('web CV DOCX — references', () => {
  it.each(LAYOUTS)('%s: each reference is name / role / contact / relationship, empty lines dropped', async (layout) => {
    const paras = paragraphs(await documentXml(layout, [REFS]));
    const start = paras.indexOf('Jane Doe');
    expect(start).toBeGreaterThan(-1);
    expect(paras.slice(start, start + 8)).toEqual([
      'Jane Doe',
      'CTO, Acme Corp',
      'jane@acme.example · +1 555 0100',
      'Former manager',
      'Sam Lee',
      'Senior Engineer',
      '+44 20 0000',
      'Pat Kim',
    ]);
    const all = paras.join('\n');
    expect(all).not.toContain('Present');
    expect(all).not.toContain('undefined');
  });

  it('a reference with no name still shows its other lines', async () => {
    const paras = paragraphs(await documentXml('classic', [
      section('references', 'References', [
        { id: 'r', order: 0, name: '', title: '', company: 'Globex', email: 'x@globex.example', phone: '', relationship: '' },
      ]),
    ]));
    expect(paras).toContain('Globex');
    expect(paras).toContain('x@globex.example');
  });
});

const OTHER_SECTIONS: CVSection[] = [
  section('experience', 'Experience', [
    { id: 'e1', company: 'Acme', position: 'Lead Engineer', location: 'Remote', startDate: '2020-01', endDate: '', isCurrent: true, description: 'Led the platform team.\nShipped v2.', highlights: ['Cut latency'], order: 0 },
    { id: 'e2', company: 'Initech', position: 'Engineer', location: '', startDate: '2017-03', endDate: '2019-12', isCurrent: false, description: '', highlights: [], order: 1 },
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
  ]),
  section('awards', 'Awards', [
    { id: 'a1', title: 'Hackathon winner', description: 'Global Fintech Week', date: '2023-11', order: 0 },
  ]),
  section('volunteer', 'Volunteer', [
    { id: 'v1', company: 'Food Bank', position: 'Organiser', startDate: '2019', endDate: '2020', description: 'Weekly drives', order: 0 },
  ]),
  section('custom', 'Custom', [
    { id: 'x1', title: 'Side note', subtitle: 'Sub', description: 'Body text', date: '2024-02', order: 0 },
  ]),
];

describe('web CV DOCX — other section types are byte-identical (pinned before the reference fix)', () => {
  it.each(LAYOUTS)('%s layout', async (layout) => {
    expect(await documentXml(layout, OTHER_SECTIONS)).toMatchSnapshot();
  });
});
