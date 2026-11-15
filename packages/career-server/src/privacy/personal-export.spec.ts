import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { EvidenceService } from '../evidence/evidence.service';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MemoryObjectStorage } from '../storage/object-storage';
import { TestClock } from '../testing/billing-fixture';
import { FakeIdTokenVerifier } from '../testing/fake-identity';
import { RecordingSignInDeleter } from '../identity/sign-in-deleter';
import { marker, personalDataFixture } from '../testing/personal-data-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { AccountPrivacyService, PERSONAL_COLUMNS } from './account-privacy.service';
import { personKey } from './live-person';
import { EXPORT_OMITTED, EXPORT_SECTIONS } from './personal-export';

/** Records the sign-ins deletion removes; nothing leaves the process. */
const signIns = new RecordingSignInDeleter();

const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');

/** Memory storage whose writes take a moment, so an export and a deletion can overlap. */
class SlowStorage extends MemoryObjectStorage {
  delayMs = 0;
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return super.put(key, body, contentType);
  }
}

describe('personal export (fictional accounts, local Postgres, memory storage)', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let storage: SlowStorage;
  let tokens: FakeIdTokenVerifier;
  let privacy: AccountPrivacyService;
  let evidence: EvidenceService;
  let fixture: ReturnType<typeof personalDataFixture>;

  const person = (uid: string) => {
    const at = clock.now();
    const identity: VerifiedIdentity = { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
    return identities.principal(identity);
  };
  async function exportOf(p: Principal, scope: 'personal' | 'workspace' = 'personal'): Promise<{ text: string; json: Record<string, any> }> {
    const started = await privacy.startExport(p, scope);
    const text = storage.objects.get(`exports/${personKey(p.authUserId)}/${started.id}.json`)!.toString('utf8');
    return { text, json: JSON.parse(text) };
  }
  const at = (json: Record<string, any>, path: string) => path.split('.').reduce((value, part) => value?.[part], json);

  beforeAll(async () => {
    db = await createTestDatabase('personal_export');
    clock = new TestClock('2026-10-24T12:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    storage = new SlowStorage();
    tokens = new FakeIdTokenVerifier();
    privacy = new AccountPrivacyService(db.pool, tokens, storage, clock, signIns);
    evidence = new EvidenceService(db.pool, undefined, storage, { clock });
    fixture = personalDataFixture(db, clock);
    await db.pool.query(`INSERT INTO feature_flags (feature, enabled) VALUES ('evidenceItems', true) ON CONFLICT (feature) DO UPDATE SET enabled = true`);
  });

  afterAll(async () => {
    await db.drop();
  });

  it('accounts for every personal table: exported somewhere or left out for a stated reason', () => {
    const omittedTables = new Set(Object.keys(EXPORT_OMITTED).map((key) => key.split('.')[0]));
    const missing = [...new Set(PERSONAL_COLUMNS.map(([table]) => table))].filter((table) => !(table in EXPORT_SECTIONS) && !omittedTables.has(table));
    expect(missing).toEqual([]);
    for (const reason of Object.values(EXPORT_OMITTED)) expect(reason.length).toBeGreaterThan(10);
  });

  it("exports every section of the person's data, describes files without containing them, and leaves secrets out", async () => {
    const ada = await person('export-ada');
    const bea = await person('export-bea');
    await fixture.seedEverything(ada);
    await fixture.seedEverything(bea);
    const item = await evidence.create(ada, { title: 'Stored certificate', evidenceType: 'credential' });
    await evidence.uploadAttachment(ada, item.id, { body: PDF, contentType: 'application/pdf', fileName: 'certificate.pdf' });
    const objectKey = (await db.pool.query(`SELECT attachment_object_key FROM career_evidence WHERE id = $1`, [item.id])).rows[0].attachment_object_key;
    const share = (await db.pool.query(`SELECT share_token FROM portfolios WHERE candidate_auth_user_id = $1`, [ada.authUserId])).rows[0].share_token;

    const { text, json } = await exportOf(ada);
    const nonEmpty = [
      'account', 'account.legalAcceptances', 'billing.account', 'billing.usage',
      'profile.preferences', 'profile.facts', 'profile.imports', 'profile.importDays',
      'documents.resumes', 'documents.writing', 'documents.evidence', 'documents.portfolios',
      'opportunities.pasted', 'opportunities.savedSearches', 'opportunities.locationProfiles', 'opportunities.followedCompanies',
      'opportunities.alertSettings', 'opportunities.alerts', 'opportunities.digests', 'opportunities.matches', 'opportunities.reports',
      'opportunities.saved', 'opportunities.reminders',
      'applications', 'practice.interviews', 'practice.starStories', 'practice.voiceSessions', 'practice.recordingConsents', 'practice.coaching',
      'career.actionPacks', 'career.skillReports', 'career.specialistModes', 'career.scenarios', 'career.achievements',
      'career.promotionGoals', 'career.credentialReminders', 'career.assistedForms', 'career.mapSessions', 'career.recruitingOptIn',
      'workspace.staffSeats', 'processing.aiJobs', 'processing.exports', 'processing.operatorActions',
    ];
    const empty = nonEmpty.filter((path) => {
      const value = at(json, path);
      return value === null || value === undefined || (Array.isArray(value) && value.length === 0);
    });
    expect(empty).toEqual([]);
    // Nested children came along.
    expect(json.documents.resumes[0].versions).toHaveLength(1);
    expect(json.applications[0].reminders).toHaveLength(1);
    expect(json.practice.interviews[0].answers[0].answer).toContain(marker(ada));
    expect(json.practice.voiceSessions[0].recordings[0].transcript).toContain(marker(ada));
    expect(json.opportunities.alerts[0].deliveries).toHaveLength(1);
    expect(json.opportunities.reminders[0].deliveries).toHaveLength(1);
    expect(json.opportunities.reminders[0].title).toContain(marker(ada));
    expect(json.opportunities.pasted[0].revisions).toHaveLength(1);
    expect(json.documents.portfolios[0].evidenceIds).toHaveLength(1);
    // Verification history goes with each evidence item; mode choices and new maintenance fields come along.
    expect(json.documents.evidence.some((e: any) => e.verifications.length === 1 && e.verifications[0].scope.includes(marker(ada)))).toBe(true);
    expect(json.career.specialistModes[0].modes).toEqual(['veterans']);

    // The stored file is described, with how to fetch it; its bytes and storage key are not in the JSON.
    const file = json.documents.evidence.find((e: any) => e.id === item.id).file;
    expect(file).toMatchObject({ name: 'certificate.pdf', contentType: 'application/pdf', sizeBytes: PDF.length });
    expect(file.retrieve).toContain(`/api/career/v1/evidence/${item.id}/attachment`);
    expect(json.attachments.included).toBe(false);
    expect(text).not.toContain('%PDF');
    expect(text).not.toContain(objectKey);
    expect(text).not.toContain(`evidence/${ada.workspaceId}/`);
    // No credential material, request keys, share tokens, or signed links.
    expect(text).not.toMatch(/secret-key-|hash-secret-|share-secret-|secret-object-/);
    expect(text).not.toContain(share);
    expect(text).not.toMatch(/X-Amz-|sig=|exports\.example\.test/);
    expect(text).not.toMatch(/provider_customer_id|provider_subscription_id|provider_payment_id|key_hash|idempotency_key|request_fingerprint/);
    // Nobody else's data.
    expect(text).not.toContain(marker(bea));
    expect(text).not.toContain(bea.authUserId);
    expect(text).not.toContain(bea.workspaceId);
    expect(text).not.toContain('invitee-of-');
    expect(text).not.toContain('staff-invite-of-');
  });

  it('adds workspace settings for the workspace scope without credentials or invitees', async () => {
    const cy = await person('export-cy');
    await fixture.seedEverything(cy);
    const { text, json } = await exportOf(cy, 'workspace');
    expect(json.format.scope).toBe('workspace');
    expect(json.workspace.apiKeys).toEqual([expect.objectContaining({ key_prefix: 'flc_x' })]);
    expect(json.workspace.invitations).toEqual({ total: 1, consented: 1 });
    expect(json.workspace.queue).toEqual({ total: 2, recommended: 1 });
    expect(json.workspace.staff.map((row: any) => row.accepted).sort()).toEqual([false, true]);
    expect(json.workspace.whiteLabel.brand_name).toContain(marker(cy));
    expect(text).not.toMatch(/hash-secret-|invitee-of-|staff-invite-of-/);
    const personal = await exportOf(cy, 'personal');
    expect(personal.json.workspace.apiKeys).toBeUndefined();
  });

  it('never leaves an export file behind when an export and a deletion overlap', async () => {
    for (const order of ['export-first', 'delete-first'] as const) {
      const dee = await person(`export-dee-${order}`);
      await fixture.seedEverything(dee);
      tokens.set(dee.authUserId, { authTime: clock.now(), issuedAt: clock.now() });
      storage.delayMs = 150;
      const exporting = () => privacy.startExport(dee, 'personal');
      const deleting = () => privacy.deleteAccount(dee, { idToken: `fake:${dee.authUserId}`, confirm: 'DELETE' });
      const [first, second] =
        order === 'export-first'
          ? await Promise.allSettled([exporting(), new Promise((r) => setTimeout(r, 30)).then(deleting)])
          : await Promise.allSettled([deleting(), new Promise((r) => setTimeout(r, 30)).then(exporting)]);
      storage.delayMs = 0;
      const deletion = order === 'export-first' ? second : first;
      const exported = order === 'export-first' ? first : second;
      expect(deletion.status).toBe('fulfilled');
      if (exported.status === 'rejected') expect(exported.reason).toMatchObject({ details: { reason: 'account_deleted' } });
      const prefix = `exports/${personKey(dee.authUserId)}/`;
      expect([...storage.objects.keys()].filter((key) => key.startsWith(prefix))).toEqual([]);
      expect((await db.pool.query(`SELECT 1 FROM account_exports WHERE auth_user_id = $1`, [dee.authUserId])).rowCount).toBe(0);
      expect((await db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = $1`, [dee.authUserId])).rowCount).toBe(0);
    }
  });
});
