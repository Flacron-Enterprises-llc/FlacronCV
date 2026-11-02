import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { V1Migration } from '../migration/migration.service';
import { ResumeStudioService } from '../resumes/resume.service';
import { TestClock } from '../testing/billing-fixture';
import { FakeTextModel } from '../testing/fake-ai';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { WritingService } from '../writing/writing.service';
import { SharedRecordsService } from './shared-records.service';
import { exportV1Snapshot } from './v1-reverse-export';

/**
 * The rehearsal the launch plan asks for, on fictional data: copy a V1
 * snapshot, open everything in V2, read it back through the shared API,
 * export it in V1's shapes and compare with the source, then apply again
 * and see nothing change.
 */

const ts = (iso: string) => ({ seconds: Math.floor(Date.parse(iso) / 1000), nanoseconds: 0 });

function user(uid: string) {
  return {
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
    photoURL: null,
    phoneNumber: null,
    profile: { firstName: uid, lastName: 'Example', headline: '', bio: '', location: '', website: '', linkedin: '', github: '' },
    preferences: { language: 'fr', theme: 'dark', emailNotifications: true, marketingEmails: false, defaultCVTemplate: 'classic' },
    subscription: { plan: 'free', status: 'active', stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false },
    usage: { cvsCreated: 1, coverLettersCreated: 2, aiCreditsUsed: 1, aiCreditsLimit: 5, exportsThisMonth: 0, lastExportReset: '2026-10-01T00:00:00.000Z' },
    createdAt: ts('2026-03-01T10:00:00Z'),
    updatedAt: ts('2026-10-01T10:00:00Z'),
    deletedAt: null,
  };
}

const CV = {
  id: 'fsCvAda001',
  userId: 'rh-ada',
  title: 'Analyste — CV',
  slug: 'analyste-cv',
  templateId: 'admin-custom-7',
  status: 'draft',
  isPublic: true,
  publicSlug: 'ada-example',
  personalInfo: { firstName: 'Ada', lastName: 'Example', email: 'ada@example.test', phone: '', address: '', city: 'Lyon', country: 'FR', postalCode: '', website: '', linkedin: '', github: '', photoURL: null, headline: 'Analyste', summary: 'Résumé fictif.' },
  sectionOrder: ['sec-exp', 'sec-lang'],
  styling: { primaryColor: '#0f766e', fontFamily: 'Inter', fontSize: 'medium', spacing: 'normal', showPhoto: false, layout: 'top-bar', sectionStyle: 'card', borderRadius: 'small' },
  version: 3,
  aiGenerated: false,
  aiProvider: null,
  viewCount: 4,
  downloadCount: 1,
  createdAt: ts('2026-04-01T10:00:00Z'),
  updatedAt: ts('2026-10-01T10:00:00Z'),
  deletedAt: null,
};

const SECTIONS = [
  {
    id: 'sec-exp', cvId: 'fsCvAda001', userId: 'rh-ada', type: 'experience', title: 'Expérience', isVisible: true, order: 0,
    items: [{ id: 'x1', company: 'Exemple SA', position: 'Analyste', location: 'Lyon', startDate: '2021-09', endDate: null, isCurrent: true, description: 'Analyses fictives.', highlights: ['Un', 'Deux'], order: 0 }],
    createdAt: ts('2026-04-01T10:00:00Z'), updatedAt: ts('2026-04-01T10:00:00Z'),
  },
  {
    id: 'sec-lang', cvId: 'fsCvAda001', userId: 'rh-ada', type: 'languages', title: 'Langues', isVisible: true, order: 1,
    items: [{ id: 'l1', name: 'Français', proficiency: 'Native', order: 0 }],
    createdAt: ts('2026-04-01T10:00:00Z'), updatedAt: ts('2026-04-01T10:00:00Z'),
  },
];

function snapshot(extra: Partial<Record<'cvs' | 'coverLetters', unknown[]>> = {}) {
  return {
    users: [user('rh-ada')],
    cvs: [CV, ...(extra.cvs ?? [])],
    sections: SECTIONS,
    versions: [
      { id: 'fsVer1', cvId: 'fsCvAda001', userId: 'rh-ada', versionNumber: 1, snapshot: { ...CV, title: 'Ancien titre', sections: [SECTIONS[1]] }, createdAt: ts('2026-05-01T10:00:00Z'), deletedAt: null },
    ],
    coverLetters: [
      { id: 'fsLetter1', userId: 'rh-ada', title: 'Lettre', content: '<p>Madame,</p><p>Je suis <em>motivée</em> &amp; prête.</p>', templateId: 'standard', linkedCVId: 'fsCvAda001', recipientName: 'Mme Exemple', companyName: 'Exemple SA', jobTitle: 'Analyste', status: 'final', styling: { fontFamily: 'Inter', fontSize: '11', primaryColor: '#000000' }, deletedAt: null },
      { id: 'fsLetter2', userId: 'rh-ada', title: '', content: '', templateId: 'classic', linkedCVId: null, status: 'draft', deletedAt: null },
      ...(extra.coverLetters ?? []),
    ],
    jobApplications: [],
    legalAcceptances: [],
  };
}

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-28T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('V1 copy rehearsal and round trip', () => {
  let db: TestDatabase;
  let migration: V1Migration;

  beforeAll(async () => {
    db = await createTestDatabase('shared-rehearsal');
    const clock = new TestClock('2026-10-28T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    migration = new V1Migration(db.pool, clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  it('copies, opens in V2, reads back in V1 shapes, and changes nothing on a second apply', async () => {
    const dry = await migration.dryRun(snapshot());
    expect(dry.rejected).toEqual([]);
    const applied = await migration.apply(snapshot());
    expect(applied.counts.filter((row) => row.written !== row.source)).toEqual([]);
    expect((await migration.countCheck(snapshot())).ok).toBe(true);

    const clock = new TestClock('2026-10-28T09:00:00Z');
    const ada = await new IdentityService(db.pool, CATALOG_VERSION, clock).principal(identity('rh-ada'));
    const model = new FakeTextModel();
    const metering = new MeteringService(db.pool, clock);
    const resumes = new ResumeStudioService(db.pool, model, metering);
    const writing = new WritingService(db.pool, model, metering);

    // V2 opens the copied CV (this used to fail: the copy stored V1 sections where V2 expects lines).
    const list = await resumes.list(ada);
    expect(list.items).toHaveLength(1);
    const opened = await resumes.get(ada, list.items[0].id);
    expect(opened.templateId).toBe('topbar');
    expect(opened.language).toBe('fr');
    const text = opened.version!.body.sections.flatMap((section) => section.lines.map((line) => line.text)).join('\n');
    expect(text).toContain('Exemple SA');
    expect(text).toContain('Français');
    const versions = await resumes.versions(ada, list.items[0].id);
    expect(versions.items.map((version) => version.versionNumber)).toEqual([2, 1]);
    expect(versions.items[1].document?.title).toBe('Ancien titre');
    const pdf = await resumes.exportVersion(ada, opened.version!.id, 'pdf');
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');

    const letters = (await writing.list(ada)).items;
    expect(letters).toHaveLength(2);
    const lettre = letters.find((item) => item.title === 'Lettre')!;
    expect(lettre.body).toBe('Madame,\n\nJe suis motivée & prête.');
    expect(lettre.templateId).toBe('modern');
    expect(letters.find((item) => item.title === 'Cover letter')!.body).toBe('');

    // Old Firestore ids still reach the records.
    const shared = new SharedRecordsService(db.pool);
    expect((await shared.getCv(ada, 'fsCvAda001')).document.templateId).toBe('admin-custom-7');
    expect((await shared.getLetter(ada, 'fsLetter1')).letter.templateId).toBe('standard');

    // Reverse export (rollback) gives back V1's documents with their original ids.
    const back = await exportV1Snapshot(db.pool, ['rh-ada']);
    expect(back.cvs).toHaveLength(1);
    const { id, userId, sectionOrder, templateId, styling, personalInfo, isPublic, publicSlug } = back.cvs[0];
    expect({ id, userId, sectionOrder, templateId, styling, isPublic, publicSlug }).toEqual({
      id: CV.id, userId: CV.userId, sectionOrder: CV.sectionOrder, templateId: CV.templateId, styling: CV.styling, isPublic: true, publicSlug: 'ada-example',
    });
    expect(personalInfo).toEqual(CV.personalInfo);
    expect(back.sections.map(({ id: sectionId, type, title, items }) => ({ id: sectionId, type, title, items }))).toEqual(
      SECTIONS.map(({ id: sectionId, type, title, items }) => ({ id: sectionId, type, title, items })),
    );
    const backLetter = back.coverLetters.find((letter) => letter.id === 'fsLetter1')!;
    expect(backLetter).toMatchObject({ linkedCVId: 'fsCvAda001', templateId: 'standard', recipientName: 'Mme Exemple', companyName: 'Exemple SA', status: 'final' });
    expect(backLetter.content).toBe('<p>Madame,</p><p>Je suis <em>motivée</em> &amp; prête.</p>');

    const again = await migration.apply(snapshot());
    expect(again.counts.every((row) => row.written === 0)).toBe(true);
    expect((await resumes.list(ada)).items).toHaveLength(1);
  });

  it('reports an unreadable V1 document and fails the count check instead of dropping it', async () => {
    const broken = { ...CV, id: 'fsCvBroken', personalInfo: { firstName: { nested: true } } };
    const huge = { id: 'fsLetterHuge', userId: 'rh-ada', title: 'Huge', content: 'x'.repeat(20001), deletedAt: null };
    const source = snapshot({ cvs: [broken], coverLetters: [huge] });
    const dry = await migration.dryRun(source);
    expect(dry.rejected).toEqual([
      { collection: 'cvs', id: 'fsCvBroken', field: 'personalInfo.firstName' },
      { collection: 'cover_letters', id: 'fsLetterHuge', field: 'content' },
    ]);
    const check = await migration.countCheck(source);
    expect(check.ok).toBe(false);
    expect(check.rejected).toHaveLength(2);
  });
});
