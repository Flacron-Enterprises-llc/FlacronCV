/**
 * Server CV exports (fallback HTML for the PDF, and the DOCX) must render a
 * "References" entry as a reference: name, "title, company", "email · phone",
 * relationship — empty lines dropped, no date.
 *
 * Before the fix a reference WITH a company took the experience branch
 * (empty title + " - Present" in HTML, "undefined at Acme" / "undefined -
 * Present" in DOCX); one WITHOUT a company showed only the name.
 *
 * The snapshot block pins every other section type: those snapshots were
 * recorded from the code as it was before the reference fix.
 */
import { ExportService } from './export.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
// docx's own zip dependency, used here to read word/document.xml.
import JSZip from 'jszip';

type Internals = {
  renderCVHTML: (cv: unknown, sections: unknown[], photo?: unknown) => string;
  buildCVDocx: (cv: unknown, sections: unknown[], photo?: unknown) => Promise<Buffer>;
};

function makeInternals(): Internals {
  const service = new ExportService(
    { firestore: new InMemoryFirestore() } as any,
    {} as any,
    {} as any,
    {} as any,
    { assertNewConsumption: jest.fn() } as any,
  );
  return service as unknown as Internals;
}

const CV = {
  templateId: 'no-such-template',
  styling: { fontFamily: 'Inter', primaryColor: '#2563eb', showPhoto: false },
  personalInfo: {
    firstName: 'Amara', lastName: 'Okafor', headline: 'Engineer',
    email: 'amara@example.com', phone: '+234 1', address: '', city: 'Lagos',
    postalCode: '', country: 'Nigeria', photoURL: null, summary: 'Builds things.',
  },
};

const REF_WITH_COMPANY = {
  name: 'Jane Doe', title: 'CTO', company: 'Acme', email: 'jane@acme.example', phone: '+1 555 0100', relationship: 'Former manager',
};
const REF_WITHOUT_COMPANY = {
  name: 'Sam Lee', title: 'Peer', company: '', email: 'sam@example.com', phone: '', relationship: 'Colleague',
};
const REF_NAME_ONLY = { name: 'Pat Kim', title: '', company: '', email: '', phone: '', relationship: '' };

function refs(...items: unknown[]) {
  return [{ type: 'references', title: 'References', isVisible: true, items }];
}

async function docxXml(internals: Internals, sections: unknown[]): Promise<string> {
  const zip = await JSZip.loadAsync(await internals.buildCVDocx(CV, sections));
  const part = zip.file('word/document.xml');
  if (!part) throw new Error('word/document.xml missing from the DOCX');
  return part.async('string');
}

/** Paragraph texts (all <w:t> runs of a <w:p> joined), in order. */
function paragraphs(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const text = (p.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('');
    if (text) out.push(text);
  }
  return out;
}

describe('ExportService — references', () => {
  let internals: Internals;
  beforeEach(() => {
    internals = makeInternals();
  });

  describe('CV HTML (PDF)', () => {
    it('a reference with a company: name, role, contact, relationship; no date', () => {
      const html = internals.renderCVHTML(CV, refs(REF_WITH_COMPANY));
      expect(html).toContain(
        '<div class="item"><span class="item-title">Jane Doe</span>' +
          '<div class="item-subtitle">CTO, Acme</div>' +
          '<div class="item-date">jane@acme.example · +1 555 0100</div>' +
          '<div class="item-subtitle">Former manager</div></div>',
      );
      expect(html).not.toContain('Present');
      expect(html).not.toContain('<span class="item-title"></span>');
    });

    it('a reference without a company keeps title, email and relationship', () => {
      const html = internals.renderCVHTML(CV, refs(REF_WITHOUT_COMPANY));
      expect(html).toContain(
        '<div class="item"><span class="item-title">Sam Lee</span>' +
          '<div class="item-subtitle">Peer</div>' +
          '<div class="item-date">sam@example.com</div>' +
          '<div class="item-subtitle">Colleague</div></div>',
      );
    });

    it('hides empty lines (a name-only reference is just the name)', () => {
      const html = internals.renderCVHTML(CV, refs(REF_NAME_ONLY));
      expect(html).toContain('<div class="item"><span class="item-title">Pat Kim</span></div>');
    });

    it('escapes reference text', () => {
      const html = internals.renderCVHTML(CV, refs({ ...REF_NAME_ONLY, name: '<b>X</b>', company: 'A&B' }));
      expect(html).toContain('<span class="item-title">&lt;b&gt;X&lt;/b&gt;</span><div class="item-subtitle">A&amp;B</div>');
    });
  });

  describe('CV DOCX', () => {
    it('a reference with a company: name, role, contact, relationship; no "undefined" or date', async () => {
      const xml = await docxXml(internals, refs(REF_WITH_COMPANY));
      const paras = paragraphs(xml);
      const at = paras.indexOf('Jane Doe');
      expect(at).toBeGreaterThan(-1);
      expect(paras.slice(at, at + 4)).toEqual([
        'Jane Doe', 'CTO, Acme', 'jane@acme.example · +1 555 0100', 'Former manager',
      ]);
      expect(xml).not.toContain('undefined');
      expect(xml).not.toContain('Present');
    });

    it('a reference without a company keeps title, email and relationship', async () => {
      const paras = paragraphs(await docxXml(internals, refs(REF_WITHOUT_COMPANY, REF_NAME_ONLY)));
      const at = paras.indexOf('Sam Lee');
      expect(paras.slice(at, at + 5)).toEqual(['Sam Lee', 'Peer', 'sam@example.com', 'Colleague', 'Pat Kim']);
    });
  });
});

// ─── Byte-identical pin for every other section type ─────────────────────────

const OTHER_SECTIONS = [
  {
    type: 'experience', title: 'Experience', isVisible: true,
    items: [
      { company: 'Acme', position: 'Lead', location: 'Remote', startDate: '2020-01', endDate: null, description: 'Ran the team', highlights: ['Cut latency'] },
      { company: 'Initech', position: 'Engineer', location: '', startDate: '2017-03', endDate: '2019-12', description: '', highlights: [] },
    ],
  },
  {
    type: 'education', title: 'Education', isVisible: true,
    items: [{ institution: 'State University', degree: 'BSc', field: 'CS', startDate: '2013', endDate: '2017' }],
  },
  { type: 'skills', title: 'Skills', isVisible: true, items: [{ name: 'TypeScript', level: 'expert' }, { name: 'Go' }] },
  { type: 'projects', title: 'Projects', isVisible: true, items: [{ name: 'OpenThing', url: 'https://p.example', description: 'x' }] },
  {
    type: 'certifications', title: 'Certifications', isVisible: true,
    items: [{ name: 'AWS SA', issuer: 'Amazon', date: '2022-01', expiryDate: '2027-03', url: 'https://cert.example/abc' }],
  },
  { type: 'languages', title: 'Languages', isVisible: true, items: [{ name: 'English', proficiency: 'Native' }] },
  { type: 'awards', title: 'Awards', isVisible: true, items: [{ title: 'Hackathon winner', description: 'x', date: '2023-11' }] },
  {
    type: 'volunteer', title: 'Volunteer', isVisible: true,
    items: [{ company: 'Food Bank', position: 'Organiser', startDate: '2019', endDate: '2020', description: 'Weekly drives' }],
  },
  {
    type: 'custom', title: 'Custom', isVisible: true,
    items: [{ title: 'Side note', subtitle: 'Sub', date: '2024-02', description: '' }, { title: 'Plain', subtitle: '', date: '' }],
  },
  { type: 'custom', title: 'Hidden', isVisible: false, items: [{ title: 'Nope', subtitle: 'x', date: '2021' }] },
];

describe('ExportService — other section types are byte-identical (pinned before the reference fix)', () => {
  it('HTML', () => {
    expect(makeInternals().renderCVHTML(CV, OTHER_SECTIONS)).toMatchSnapshot();
  });

  it('DOCX word/document.xml', async () => {
    expect(await docxXml(makeInternals(), OTHER_SECTIONS)).toMatchSnapshot();
  });
});
