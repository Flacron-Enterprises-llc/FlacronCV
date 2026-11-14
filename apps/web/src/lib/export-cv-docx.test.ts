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
  const xml: string = await zip.file('word/document.xml').async('string');
  // docx gives each hyperlink a random relationship id; normalise it so the
  // snapshot pins content, not randomness.
  return xml.replace(/r:id="rId[^"]+"/g, 'r:id="rId"');
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

// ── Certifications: every field the editor collects reaches the DOCX ──────────
describe('web CV DOCX — certification details', () => {
  it('includes expiry, credential ID and URL under the certification', async () => {
    const certs = section('certifications', 'Certifications', [
      { id: 'c1', order: 0, name: 'AWS SA', issuer: 'Amazon', date: '2023-04', expiryDate: '2026-04', credentialId: 'AWS-1', url: 'https://aws.example/verify' },
    ]);
    const paras = paragraphs(await documentXml('classic', [certs]));
    expect(paras).toContain('AWS SA  •  Amazon  |  Apr 2023');
    expect(paras).toContain('Expires Apr 2026 · Credential ID: AWS-1');
    expect(paras).toContain('https://aws.example/verify');
  });
});

// ── Cover letter DOCX: same wording, language and direction as the preview ────
describe('cover letter DOCX', () => {
  const { buildCoverLetterDocx } = __testables as any;
  async function letterParas(letter: any, opts: any): Promise<{ texts: string[]; xml: string }> {
    const blob = await buildCoverLetterDocx(letter, opts);
    const ab = await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(blob);
    });
    const zip = await JSZip.loadAsync(Buffer.from(ab));
    const xml = await zip.file('word/document.xml').async('string');
    // <w:t> holds XML-escaped text; unescape once to get what Word shows.
    const unxml = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    return { texts: paragraphs(xml).map(unxml), xml };
  }
  const letter = {
    title: 'Letter', templateId: 'modern', jobTitle: 'Engineer', recipientName: '',
    content: '<p>It&#39;s a pleasure &amp; an honour.</p><ul><li>One</li></ul>',
    styling: { primaryColor: '#2563eb', senderName: 'Amara', senderEmail: 'a@example.com' },
  };

  it('uses the template wording and decodes entities once', async () => {
    const { texts } = await letterParas(letter, { locale: 'en' });
    expect(texts).toContain('Position: Engineer');
    expect(texts).toContain('Dear Hiring Manager,');
    expect(texts).toContain("It's a pleasure & an honour.");
    expect(texts).toContain('• One');
    expect(texts).toContain('Best regards,');
    // The HTML entity must not survive into Word (it used to arrive as &amp;#39;).
    expect(texts.join(' ')).not.toMatch(/&#39;|&amp;/);
  });

  it('uses the labels and locale it is given, right-to-left for Arabic', async () => {
    const labels = {
      dear: 'عزيزي', hiringManager: 'مدير التوظيف', placeholder: '', yourName: '', re: 'بخصوص:',
      subjectApplication: '', position: 'الوظيفة:', closingSincerely: 'مع خالص التحية،', closingBestRegards: 'مع أطيب التحيات،',
      closingRegards: '', closingEnthusiasm: '', closingFaithfully: '', closingRespectfully: '',
    };
    const { texts, xml } = await letterParas({ ...letter, templateId: 'classic' }, { labels, locale: 'ar' });
    expect(texts).toContain('بخصوص: Engineer');
    expect(texts).toContain('عزيزي مدير التوظيف،'); // Arabic comma, as in the preview
    expect(texts).toContain('مع خالص التحية،');
    expect(xml).toContain('<w:bidi');
  });
});

describe('cover letter DOCX — per-paragraph direction', () => {
  const { buildCoverLetterDocx } = __testables as any;
  it('keeps an English body paragraph LTR inside an Arabic letter', async () => {
    const blob = await buildCoverLetterDocx(
      { title: 'L', templateId: 'modern', jobTitle: '', recipientName: '', content: '<p>English paragraph.</p><p>فقرة عربية.</p>', styling: {} },
      { locale: 'ar' },
    );
    const ab = await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(blob);
    });
    const xml: string = await (await JSZip.loadAsync(Buffer.from(ab))).file('word/document.xml').async('string');
    const paraOf = (needle: string) => (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).find((p) => p.includes(needle)) ?? '';
    expect(paraOf('English paragraph.')).not.toContain('<w:bidi');
    expect(paraOf('فقرة عربية.')).toContain('<w:bidi');
  });
});

describe('web CV DOCX — links are real hyperlinks', () => {
  it('wraps email, profile URLs and project URLs in w:hyperlink', async () => {
    const projects = section('projects', 'Projects', [
      { id: 'p1', order: 0, name: 'Ledger', url: 'https://github.com/a/ledger', technologies: [], description: '' },
    ]);
    const cv = buildSampleCV('classic', '#1e3a5f') as any;
    cv.personalInfo = { ...cv.personalInfo, email: 'a@example.com', linkedin: 'linkedin.com/in/a', city: 'London' };
    const blob = await buildCVDocx(cv, [projects], LABELS);
    const ab = await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(blob);
    });
    const zip = await JSZip.loadAsync(Buffer.from(ab));
    const rels: string = await zip.file('word/_rels/document.xml.rels').async('string');
    const xml: string = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('<w:hyperlink');
    expect(rels).toContain('mailto:a@example.com');
    expect(rels).toContain('https://linkedin.com/in/a');
    expect(rels).toContain('https://github.com/a/ledger');
    // A location is not a link.
    expect(rels).not.toContain('London');
  });
});
