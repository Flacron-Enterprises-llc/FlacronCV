import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { CareerProfileService } from '../profile/career-profile.service';
import { ResumeStudioService } from '../resumes/resume.service';
import { TestClock } from '../testing/billing-fixture';
import { FakeTextModel } from '../testing/fake-ai';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { WritingService } from '../writing/writing.service';
import { SharedRecordsService } from './shared-records.service';

/**
 * Two sites, one store. "V1" here is the shared API in V1's shapes (what
 * V1's adapter calls); "V2" is V2's own resume and writing services.
 * Every account and document is fictional.
 */

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-28T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

function v1Cv(title = 'Ada CV') {
  return {
    title,
    templateId: 'executive',
    status: 'draft',
    isPublic: false,
    publicSlug: null,
    personalInfo: { firstName: 'Ada', lastName: 'Example', email: 'ada@example.test', summary: 'Fictional analyst.' },
    sectionOrder: ['s-exp'],
    styling: { layout: 'compact', primaryColor: '#123456' },
    sections: [
      {
        id: 's-exp',
        type: 'experience',
        title: 'Experience',
        isVisible: true,
        order: 0,
        items: [{ id: 'e1', company: 'Example Engines', position: 'Analyst', startDate: '2020-01', endDate: null, isCurrent: true, description: 'Wrote notes.', highlights: [], order: 0 }],
      },
    ],
  };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    if (isBillingError(error)) return error.code;
    throw error;
  }
}

describe('SharedRecordsService (V1 and V2 on one store)', () => {
  let db: TestDatabase;
  let identities: IdentityService;
  let shared: SharedRecordsService;
  let resumes: ResumeStudioService;
  let writing: WritingService;
  let profiles: CareerProfileService;
  let ada: Principal;
  let bea: Principal;

  beforeAll(async () => {
    db = await createTestDatabase('shared-records');
    const clock = new TestClock('2026-10-28T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    const model = new FakeTextModel();
    const metering = new MeteringService(db.pool, clock);
    shared = new SharedRecordsService(db.pool);
    resumes = new ResumeStudioService(db.pool, model, metering);
    writing = new WritingService(db.pool, model, metering);
    profiles = new CareerProfileService(db.pool, model, clock);
    ada = await identities.principal(identity('shared-ada'));
    bea = await identities.principal(identity('shared-bea'));
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  it('shows a CV written through V1 in V2, and V2 template changes back in V1 without breaking V1 rendering', async () => {
    const created = await shared.createCv(ada, v1Cv(), 'create-1');
    const retried = await shared.createCv(ada, v1Cv(), 'create-1');
    expect(retried.id).toBe(created.id);
    expect(await code(shared.createCv(ada, v1Cv('Different'), 'create-1'))).toBe('idempotency_mismatch');
    expect((await shared.listCvs(ada)).items).toHaveLength(1);

    const inV2 = await resumes.get(ada, created.id);
    expect(inV2.templateId).toBe('executive');
    expect(inV2.version?.document?.sections[0].items[0].company).toBe('Example Engines');
    const lines = inV2.version!.body.sections.flatMap((section) => section.lines.map((line) => line.text));
    expect(lines.join('\n')).toContain('Example Engines');
    expect(lines.join('\n')).toContain('Fictional analyst.');

    // V2 picks a V2-only template: V2 draws it, V1 keeps drawing its own.
    await resumes.updateVersion(ada, inV2.version!.id, { templateId: 'editorial' });
    const afterV2 = await shared.getCv(ada, created.id);
    expect(afterV2.revision).toBeGreaterThan(created.revision);
    expect(afterV2.v2TemplateId).toBe('editorial');
    expect(afterV2.document.templateId).toBe('executive');
    // A template V1 also has is carried to V1.
    await resumes.updateVersion(ada, inV2.version!.id, { templateId: 'modern' });
    expect((await shared.getCv(ada, created.id)).document.templateId).toBe('modern');

    // Projected lines are not edited as text in V2.
    const line = inV2.version!.body.sections[0].lines[0];
    expect(await code(resumes.updateVersion(ada, inV2.version!.id, { lines: [{ factId: line.factId, text: 'Typed' }] }))).toBe('validation_error');
  });

  it('refuses a stale write and lets the caller re-apply on the current revision', async () => {
    const cv = (await shared.listCvs(ada)).items[0];
    const v1Edit = { ...v1Cv(), personalInfo: { ...v1Cv().personalInfo, summary: 'Edited in V1.' } };
    // The read above is current, so this succeeds; a second write with the same (now old) revision must not.
    await shared.updateCv(ada, cv.id, v1Edit, cv.revision);
    expect(await code(shared.updateCv(ada, cv.id, { ...v1Edit, title: 'Second writer' }, cv.revision))).toBe('revision_conflict');
    const current = await shared.getCv(ada, cv.id);
    expect(current.document.personalInfo.summary).toBe('Edited in V1.');
    expect(current.document.title).toBe('Ada CV');
    const inV2 = await resumes.get(ada, cv.id);
    expect(JSON.stringify(inV2.version!.body)).toContain('Edited in V1.');
    // V1 keeps its own template choice from the last V1 save; V2 keeps its own while V1 does not change it.
    expect(current.document.templateId).toBe('executive');
  });

  it('lets exactly one of two simultaneous writers win', async () => {
    const cv = (await shared.listCvs(ada)).items[0];
    const results = await Promise.all([
      code(shared.updateCv(ada, cv.id, { ...v1Cv(), title: 'Writer A' }, cv.revision)),
      code(shared.updateCv(ada, cv.id, { ...v1Cv(), title: 'Writer B' }, cv.revision)),
    ]);
    expect(results.sort()).toEqual(['ok', 'revision_conflict']);
  });

  it('never shows or changes another person’s CV', async () => {
    const cv = (await shared.listCvs(ada)).items[0];
    expect((await shared.listCvs(bea)).items).toHaveLength(0);
    expect(await code(shared.getCv(bea, cv.id))).toBe('not_found');
    expect(await code(shared.updateCv(bea, cv.id, v1Cv('Hijack'), cv.revision))).toBe('not_found');
    expect(await code(shared.deleteCv(bea, cv.id, cv.revision))).toBe('not_found');
    expect(await code(shared.createLetter(bea, { title: 'Mine', content: '', linkedCVId: cv.id }, undefined))).toBe('not_found');
  });

  it('gives V1 a document for a CV V2 composed from career facts, and V1 can then edit it', async () => {
    await profiles.createFact(bea, { factType: 'contact', value: { fullName: 'Bea Example', email: 'bea@example.test' } });
    await profiles.createFact(bea, { factType: 'experience', value: { position: 'Engineer', company: 'Example Co', current: true } });
    const native = await resumes.create(bea, { title: 'Bea CV', language: 'en', templateId: 'classic' });
    const inV1 = await shared.getCv(bea, native.id);
    expect(inV1.documentBacked).toBe(false);
    expect(inV1.document.personalInfo.firstName).toBe('Bea');
    expect(inV1.document.sections[0].items[0]).toMatchObject({ company: 'Example Co', position: 'Engineer', isCurrent: true });
    const saved = await shared.updateCv(bea, native.id, { ...inV1.document, title: 'Bea CV (V1 edit)' }, inV1.revision);
    expect(saved.documentBacked).toBe(true);
    expect((await resumes.get(bea, native.id)).title).toBe('Bea CV (V1 edit)');
  });

  it('keeps letters consistent: V1 HTML in, V2 text edit, V1 sees the edit', async () => {
    const cv = (await shared.listCvs(ada)).items[0];
    const letter = await shared.createLetter(
      ada,
      { title: 'To Example Co', content: '<p>Dear Ms Example,</p><p>I <strong>build</strong> things.</p>', templateId: 'standard', linkedCVId: cv.id, companyName: 'Example Co', jobTitle: 'Analyst' },
      'letter-1',
    );
    expect(letter.letter.templateId).toBe('standard');
    const inV2 = await writing.get(ada, letter.id);
    expect(inV2.body).toBe('Dear Ms Example,\n\nI build things.');
    expect(inV2.templateId).toBe('modern');
    // V1 formatting is kept while the text is unchanged.
    expect((await shared.getLetter(ada, letter.id)).letter.content).toContain('<strong>build</strong>');

    await writing.update(ada, letter.id, { body: 'Dear Ms Example,\n\nEdited in V2.' });
    const back = await shared.getLetter(ada, letter.id);
    expect(back.revision).toBeGreaterThan(letter.revision);
    expect(back.letter.content).toBe('<p>Dear Ms Example,</p><p>Edited in V2.</p>');
    expect(back.letter.companyName).toBe('Example Co');
    expect(await code(shared.updateLetter(ada, letter.id, { ...letter.letter, content: '<p>Stale</p>' }, letter.revision))).toBe('revision_conflict');

    // An empty V1 letter (V1 creates one before writing) is stored and shown in V2 as empty.
    const empty = await shared.createLetter(ada, { title: 'Draft', content: '' }, undefined);
    expect((await writing.get(ada, empty.id)).body).toBe('');
  });

  it('deletes for both sites and refuses late writes to the deleted record', async () => {
    const cv = (await shared.listCvs(ada)).items[0];
    const letters = (await shared.listLetters(ada)).items;
    expect(await code(shared.deleteCv(ada, cv.id, cv.revision - 1))).toBe('revision_conflict');
    await shared.deleteCv(ada, cv.id, cv.revision);
    expect(await code(resumes.get(ada, cv.id))).toBe('not_found');
    expect(await code(shared.getCv(ada, cv.id))).toBe('record_deleted');
    expect(await code(shared.updateCv(ada, cv.id, v1Cv(), cv.revision))).toBe('record_deleted');
    // The idempotent retry of the original create does not bring it back.
    expect(await code(shared.createCv(ada, v1Cv(), 'create-1'))).toBe('record_deleted');
    // The letter stays and loses its link.
    const linked = await shared.getLetter(ada, letters[0].id);
    expect(linked.letter.linkedCVId).toBeNull();

    await shared.deleteLetter(ada, linked.id, linked.revision);
    expect(await code(writing.get(ada, linked.id))).toBe('not_found');
    expect(await code(shared.getLetter(ada, linked.id))).toBe('record_deleted');
  });

  it('refuses a stale save from V2’s own editors after V1 changed the record', async () => {
    const cv = await shared.createCv(bea, v1Cv('Bea shared'), undefined);
    const opened = await resumes.get(bea, cv.id);
    await shared.updateCv(bea, cv.id, { ...v1Cv('Bea shared'), title: 'Saved in V1' }, cv.revision);
    expect(await code(resumes.updateVersion(bea, opened.version!.id, { templateId: 'modern', expectedRevision: opened.revision }))).toBe('revision_conflict');
    const fresh = await resumes.get(bea, cv.id);
    expect((await resumes.updateVersion(bea, fresh.version!.id, { templateId: 'modern', expectedRevision: fresh.revision })).body.templateId).toBe('modern');

    const letter = await shared.createLetter(bea, { title: 'Bea letter', content: '<p>One.</p>' }, undefined);
    const inV2 = await writing.get(bea, letter.id);
    await shared.updateLetter(bea, letter.id, { title: 'Bea letter', content: '<p>Two (V1).</p>' }, letter.revision);
    expect(await code(writing.update(bea, letter.id, { body: 'Three (V2, stale).', expectedRevision: inV2.revision }))).toBe('revision_conflict');
    expect((await writing.get(bea, letter.id)).body).toBe('Two (V1).');
  });

  it('finds records copied from V1 by their old Firestore ids', async () => {
    const created = await shared.createCv(bea, v1Cv('Copied'), undefined);
    await db.pool.query(
      `INSERT INTO migration_keys (origin_collection, origin_id, destination_table, destination_id) VALUES ('cvs', 'firestoreAutoId123', 'resumes', $1)`,
      [created.id],
    );
    expect((await shared.getCv(bea, 'firestoreAutoId123')).id).toBe(created.id);
    expect(await code(shared.getCv(ada, 'firestoreAutoId123'))).toBe('not_found');
    expect(await code(shared.getCv(bea, '../etc'))).toBe('not_found');
  });
});
