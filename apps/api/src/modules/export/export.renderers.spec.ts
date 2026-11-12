/**
 * Server-side CV / cover-letter exports (used by the mobile app):
 * fields the mobile app edits must reach the PDF HTML and the DOCX.
 */
import { ExportService } from './export.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';
// docx's own zip dependency, used here to read word/document.xml.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const STORAGE_PHOTO =
  'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/avatars%2Fu%2Fcv.png?alt=media&token=secret';

type Internals = {
  renderCVHTML: (cv: unknown, sections: unknown[], photo?: unknown) => string;
  buildCVDocx: (cv: unknown, sections: unknown[], photo?: unknown) => Promise<Buffer>;
  loadCvPhoto: (cv: unknown) => Promise<{ data: Buffer; contentType: string } | null>;
  renderCoverLetterHTML: (cl: unknown) => string;
  buildCoverLetterDocx: (cl: unknown) => Promise<Buffer>;
};

function makeService(): ExportService {
  return new ExportService(
    { firestore: new InMemoryFirestore() } as any,
    {} as any,
    {} as any,
    {} as any,
    { assertNewConsumption: jest.fn() } as any,
  );
}

function baseCV(overrides: Record<string, unknown> = {}, styling: Record<string, unknown> = {}) {
  return {
    templateId: 'no-such-template',
    styling: { fontFamily: 'Inter', primaryColor: '#2563eb', showPhoto: false, ...styling },
    personalInfo: {
      firstName: 'Amara',
      lastName: 'Okafor',
      headline: 'Engineer',
      email: 'amara@example.com',
      phone: '+234 1',
      address: '',
      city: 'Lagos',
      postalCode: '',
      country: 'Nigeria',
      photoURL: null,
      summary: '',
      ...overrides,
    },
  };
}

function richSections() {
  return [
    {
      type: 'experience', title: 'Experience', isVisible: true,
      items: [{
        company: 'Acme', position: 'Lead', startDate: '2020-01', endDate: null,
        description: 'Ran the team', highlights: ['Cut p95 latency 40%', '  ', 'Hired 6 <engineers>'],
      }],
    },
    {
      type: 'certifications', title: 'Certifications', isVisible: true,
      items: [{ name: 'AWS SA', issuer: 'Amazon', date: '2022-01', expiryDate: '2027-03', url: 'https://cert.example/abc', credentialId: '' }],
    },
    {
      type: 'references', title: 'References', isVisible: true,
      items: [
        { name: 'Jane Doe', title: 'CTO', company: 'Acme', email: '', phone: '', relationship: 'Former manager' },
        { name: 'Sam Lee', title: 'Peer', company: '', email: '', phone: '', relationship: 'Colleague' },
      ],
    },
    {
      type: 'custom', title: 'Awards', isVisible: true,
      items: [{ title: 'Hackathon winner', subtitle: 'Global Fintech Week', date: '2023-11', description: '' }],
    },
    {
      type: 'custom', title: 'Secret section', isVisible: false,
      items: [{ title: 'Hidden entry', subtitle: 'Hidden subtitle', date: '2021-02', description: '' }],
    },
  ];
}

async function readDocx(buffer: Buffer): Promise<{ xml: string; files: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const xml: string = await zip.file('word/document.xml').async('string');
  return { xml, files: Object.keys(zip.files) };
}

const hasMedia = (files: string[]) => files.some((f) => f.startsWith('word/media/'));

describe('ExportService server renderers (mobile export parity)', () => {
  let service: ExportService;
  let internals: Internals;

  beforeEach(() => {
    service = makeService();
    internals = service as unknown as Internals;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('CV HTML (PDF)', () => {
    it('adds address and postal code to the contact line like the web locationLine', () => {
      const html = internals.renderCVHTML(baseCV({ address: '12 Marina Rd', postalCode: '101001' }), []);
      expect(html).toContain('amara@example.com | +234 1 | 12 Marina Rd, Lagos 101001, Nigeria</div>');
    });

    it('postal code alone also switches to the extended location', () => {
      const html = internals.renderCVHTML(baseCV({ postalCode: '101001' }), []);
      expect(html).toContain('| Lagos 101001, Nigeria</div>');
    });

    it('keeps the old "city, country" contact text when there is no address or postal code', () => {
      const html = internals.renderCVHTML(baseCV(), []);
      expect(html).toContain('amara@example.com | +234 1 | Lagos, Nigeria</div>');
    });

    it('renders highlights, cert expiry + URL, reference relationship, custom subtitle + date', () => {
      const html = internals.renderCVHTML(baseCV(), richSections());
      expect(html).toContain('<li>Cut p95 latency 40%</li>');
      expect(html).toContain('<li>Hired 6 &lt;engineers&gt;</li>');
      expect(html).not.toContain('<li>  </li>');
      expect(html).toContain('<div class="item-date">Expires Mar 2027</div>');
      expect(html).toContain('<div class="item-date">https://cert.example/abc</div>');
      expect(html).toContain('<div class="item-subtitle">Former manager</div>');
      expect(html).toContain('<div class="item"><span class="item-title">Sam Lee</span><div class="item-subtitle">Peer</div><div class="item-subtitle">Colleague</div></div>');
      expect(html).toContain(
        '<div class="item-header"><span class="item-title">Hackathon winner</span><span class="item-date">Nov 2023</span></div><div class="item-subtitle">Global Fintech Week</div>',
      );
    });

    it('keeps hidden sections hidden', () => {
      const html = internals.renderCVHTML(baseCV(), richSections());
      expect(html).not.toContain('Secret section');
      expect(html).not.toContain('Hidden entry');
      expect(html).not.toContain('Hidden subtitle');
    });

    it('renders items without the new fields exactly as before', () => {
      const html = internals.renderCVHTML(baseCV(), [
        { type: 'experience', title: 'E', isVisible: true, items: [{ company: 'C', position: 'P', startDate: '2020', description: 'D', highlights: [] }] },
        { type: 'certifications', title: 'C', isVisible: true, items: [{ name: 'AWS', issuer: 'Amazon', date: '2022-01', expiryDate: null, url: '' }] },
        { type: 'custom', title: 'X', isVisible: true, items: [{ title: 'Plain', subtitle: '', date: '' }] },
        { type: 'references', title: 'R', isVisible: true, items: [{ name: 'Ref', relationship: '' }] },
        { type: 'projects', title: 'P', isVisible: true, items: [{ name: 'Proj', url: 'https://p.example' }] },
      ]);
      expect(html).toContain('<div class="item-desc">D</div>\n            </div>');
      expect(html).not.toContain('<ul');
      expect(html).toContain('<div class="item"><span class="item-title">AWS</span></div>');
      expect(html).toContain('<div class="item"><span class="item-title">Plain</span></div>');
      expect(html).toContain('<div class="item"><span class="item-title">Ref</span></div>');
      expect(html).toContain('<div class="item"><span class="item-title">Proj</span></div>');
    });

    it('inlines a fetched photo as data: only when showPhoto is on', () => {
      const photo = { data: PNG_1X1, contentType: 'image/png' };
      const on = internals.renderCVHTML(baseCV({ photoURL: STORAGE_PHOTO }, { showPhoto: true }), [], photo);
      expect(on).toContain(`<img src="data:image/png;base64,${PNG_1X1.toString('base64')}"`);
      expect(on).not.toContain('firebasestorage.googleapis.com');
      expect(on).not.toContain('token=secret');

      const off = internals.renderCVHTML(baseCV({ photoURL: STORAGE_PHOTO }, { showPhoto: false }), [], photo);
      expect(off).not.toContain('<img');
    });

    it('never puts the remote photo URL in the HTML when no photo was fetched', () => {
      const html = internals.renderCVHTML(baseCV({ photoURL: STORAGE_PHOTO }, { showPhoto: true }), []);
      expect(html).not.toContain('<img');
      expect(html).not.toContain('firebasestorage');
    });
  });

  describe('CV DOCX', () => {
    it('includes every new field and skips hidden sections', async () => {
      const { xml } = await readDocx(
        await internals.buildCVDocx(baseCV({ address: '12 Marina Rd', postalCode: '101001' }), richSections()),
      );
      expect(xml).toContain('amara@example.com | +234 1 | 12 Marina Rd, Lagos 101001, Nigeria');
      expect(xml).toContain('• Cut p95 latency 40%');
      expect(xml).toContain('• Hired 6 &lt;engineers&gt;');
      expect(xml).toContain('Expires Mar 2027');
      expect(xml).toContain('https://cert.example/abc');
      expect(xml).toContain('Former manager');
      expect(xml).toContain('Colleague');
      expect(xml).toContain('Hackathon winner');
      expect(xml).toContain('  •  Global Fintech Week');
      expect(xml).toContain('  |  Nov 2023');
      expect(xml).not.toContain('Secret section');
      expect(xml).not.toContain('Hidden entry');
    });

    it('keeps the old contact text without address/postal code', async () => {
      const { xml } = await readDocx(await internals.buildCVDocx(baseCV(), []));
      expect(xml).toContain('amara@example.com | +234 1 | Lagos, Nigeria');
    });

    it('embeds a PNG photo, and has no image when there is none', async () => {
      const withPhoto = await readDocx(
        await internals.buildCVDocx(baseCV({}, { showPhoto: true }), [], { data: PNG_1X1, contentType: 'image/png' }),
      );
      expect(hasMedia(withPhoto.files)).toBe(true);
      expect(withPhoto.xml).toContain('<w:drawing>');

      const without = await readDocx(await internals.buildCVDocx(baseCV(), []));
      expect(hasMedia(without.files)).toBe(false);
      expect(without.xml).not.toContain('<w:drawing>');
    });

    it('does not embed WebP (not reliably supported by Word)', async () => {
      const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
      const { files } = await readDocx(
        await internals.buildCVDocx(baseCV({}, { showPhoto: true }), [], { data: webp, contentType: 'image/webp' }),
      );
      expect(hasMedia(files)).toBe(false);
    });
  });

  describe('photo loading (allow-list, fail-open)', () => {
    it('does not fetch when showPhoto is off or there is no photoURL', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      expect(await internals.loadCvPhoto(baseCV({ photoURL: STORAGE_PHOTO }, { showPhoto: false }))).toBeNull();
      expect(await internals.loadCvPhoto(baseCV({ photoURL: null }, { showPhoto: true }))).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('never fetches a URL outside the Storage allow-list', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      for (const url of [
        'https://169.254.169.254/latest/meta-data/',
        'http://firebasestorage.googleapis.com/v0/b/x/o/a.png',
        'https://evil.example/a.png',
        'https://firebasestorage.googleapis.com.evil.example/a.png',
      ]) {
        expect(await internals.loadCvPhoto(baseCV({ photoURL: url }, { showPhoto: true }))).toBeNull();
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns the photo for an allowed Storage URL', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(PNG_1X1, { status: 200, headers: { 'content-type': 'image/png' } }),
      );
      const photo = await internals.loadCvPhoto(baseCV({ photoURL: STORAGE_PHOTO }, { showPhoto: true }));
      expect(photo?.contentType).toBe('image/png');
    });

    it('returns null, and does not log the tokenised URL, when the fetch fails', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      const photo = await internals.loadCvPhoto(baseCV({ photoURL: STORAGE_PHOTO }, { showPhoto: true }));
      expect(photo).toBeNull();
      expect(warn).toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain('token=secret');
    });

    it('exportCVToDocx still succeeds, without the photo, when the fetch fails', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
      const saved: Buffer[] = [];
      const firebaseAdmin = {
        firestore: new InMemoryFirestore(),
        bucket: {
          file: () => ({
            save: jest.fn(async (b: Buffer) => {
              saved.push(b);
            }),
            getSignedUrl: jest.fn(async () => ['https://signed.example/file.docx']),
          }),
        },
      };
      const cvService = {
        findByIdOrThrow: jest.fn(async () => baseCV({ photoURL: STORAGE_PHOTO }, { showPhoto: true })),
        getSections: jest.fn(async () => richSections()),
      };
      const usersService = {
        findByIdOrThrow: jest.fn(async () => ({
          subscription: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: null },
          usage: { exportsThisMonth: 0 },
        })),
        incrementUsage: jest.fn(async () => undefined),
      };
      const abuse = { assertNewConsumption: jest.fn(async () => undefined) };
      const svc = new ExportService(firebaseAdmin as any, cvService as any, {} as any, usersService as any, abuse as any);
      jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);

      const result = await svc.exportCVToDocx('cv1', 'uid');
      expect(result.downloadUrl).toBe('https://signed.example/file.docx');
      expect(saved).toHaveLength(1);
      const { files, xml } = await readDocx(saved[0]);
      expect(hasMedia(files)).toBe(false);
      expect(xml).toContain('Expires Mar 2027');
      expect(usersService.incrementUsage).toHaveBeenCalledWith('uid', 'exportsThisMonth');
    });
  });

  describe('cover letter', () => {
    const letter = {
      styling: {
        fontFamily: 'Inter',
        fontSize: '14px',
        primaryColor: '#7c3aed',
        senderName: 'Amara Okafor',
        senderEmail: 'amara@example.com',
      },
      recipientName: '',
      recipientTitle: '',
      companyName: '',
      companyAddress: '1 Market St, San Francisco',
      jobTitle: 'Staff Engineer',
      content: '<p>Hello there.</p>',
    };

    it('HTML: letterhead, sign-off and accent; an address alone still shows the inside address', () => {
      const html = internals.renderCoverLetterHTML(letter);
      expect(html).toContain('<div style="font-weight: 700; font-size: 1.25em; color: #7c3aed;">Amara Okafor</div>');
      expect(html).toContain('amara@example.com</div>');
      expect(html).toContain('<div>Sincerely,</div>');
      expect(html).toContain('<div class="recipient-line">1 Market St, San Francisco</div>');
      expect(html).toContain('.subject { font-weight: 600; margin-bottom: 24px; color: #7c3aed; }');
    });

    it('HTML: escapes sender fields and drops an invalid accent', () => {
      const html = internals.renderCoverLetterHTML({
        ...letter,
        styling: { ...letter.styling, senderName: '<script>x</script>', primaryColor: 'red;}</style>' },
      });
      expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('red;}');
    });

    it('HTML: no sender means no letterhead and no sign-off', () => {
      const html = internals.renderCoverLetterHTML({ ...letter, styling: { primaryColor: '#7c3aed' } });
      expect(html).not.toContain('Sincerely');
      expect(html).toContain('<body>\n  <div class="date">');
    });

    it('DOCX: sender, sign-off, company address and accent colour', async () => {
      const { xml } = await readDocx(await internals.buildCoverLetterDocx(letter));
      expect(xml).toContain('Amara Okafor');
      expect(xml).toContain('amara@example.com');
      expect(xml).toContain('Sincerely,');
      expect(xml).toContain('1 Market St, San Francisco');
      expect(xml).toContain('RE: Staff Engineer');
      expect(xml).toContain('w:val="7c3aed"');
    });

    it('DOCX: expands a 3-digit accent and ignores an invalid one', async () => {
      const short = await readDocx(
        await internals.buildCoverLetterDocx({ ...letter, styling: { ...letter.styling, primaryColor: '#abc' } }),
      );
      expect(short.xml).toContain('w:val="aabbcc"');
      const bad = await readDocx(await internals.buildCoverLetterDocx({ ...letter, styling: { primaryColor: 'nope' } }));
      expect(bad.xml).not.toContain('Sincerely');
      expect(bad.xml).toContain('RE: Staff Engineer');
    });
  });
});
