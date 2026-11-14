import type { Pool, PoolClient } from 'pg';
import { CATALOG_VERSION, letterHtmlToText, parseSharedCvDocument, projectDocument, v2LetterTemplateFor, v2ResumeTemplateFor } from '@flacroncv/career-shared';
import type { SharedCvDocument, SharedDocumentResult } from '@flacroncv/career-shared';
import type { Clock } from '../billing/billing.service';
import { publishCatalog } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import { addUtcMonths, v1Instant } from './v1-time';

const LEGACY_CATALOG = 'legacy-v1';
const SECTION_FACT: Record<string, string> = {
  experience: 'experience',
  education: 'education',
  skill: 'skill',
  skills: 'skill',
  project: 'project',
  projects: 'project',
  achievement: 'achievement',
  achievements: 'achievement',
  certification: 'certification',
  certifications: 'certification',
  language: 'language',
  languages: 'language',
  reference: 'reference',
  references: 'reference',
  summary: 'summary',
  contact: 'contact',
};

export interface MigrationCounts {
  collection: string;
  source: number;
  written: number;
  skipped: number;
}

export interface MigrationReport {
  mode: 'dry-run' | 'apply';
  counts: MigrationCounts[];
  sampleIds: Record<string, string[]>;
  /** Source documents that could not be read as V1 shapes. Any entry fails the count check, so nothing is dropped quietly. */
  rejected: RejectedDocument[];
}

export interface RejectedDocument {
  collection: string;
  id: string;
  field: string;
}

export interface CountCheck {
  ok: boolean;
  rows: Array<{ collection: string; source: number; destination: number }>;
  rejected: RejectedDocument[];
}

interface SourceUser {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string | null;
  photoURL: string | null;
  language: string;
  theme: string;
  emailNotifications: boolean;
  marketingEmails: boolean;
  defaultCVTemplate: string;
  pushNotifications: boolean;
  plan: string;
  status: string;
  provider: 'stripe' | 'apple' | 'google' | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasUsedTrial: boolean;
  createdAt: string;
  pushTokens: string[];
  firstName: string;
  lastName: string;
  headline: string;
  bio: string;
}

interface SourceCv {
  id: string;
  userId: string;
  title: string;
  templateId: string;
  isPublic: boolean;
  publicSlug: string | null;
  personalInfo: Record<string, unknown>;
  raw: Record<string, unknown>;
}

interface SourceSection {
  id: string;
  cvId: string;
  userId: string;
  type: string;
  items: unknown[];
  raw: Record<string, unknown>;
}

interface SourceVersion {
  id: string;
  cvId: string;
  userId: string;
  versionNumber: number;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

interface SourceLetter {
  id: string;
  userId: string;
  title: string;
  /** V1's letter HTML, verbatim. */
  content: string;
  linkedCVId: string | null;
  raw: Record<string, unknown>;
}

interface SourceJob {
  id: string;
  userId: string;
  company: string;
  position: string;
  status: string;
  appliedDate: string | null;
  notes: string;
  linkedCVId: string | null;
  linkedCoverLetterId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  followUpDate: string | null;
  /** V1 outcome on the job (`accepted` replaced the legacy `accepted` status). */
  outcome: string | null;
}

interface SourceLegal {
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  disclaimerVersion: string;
  acceptedAt: string;
}

interface ParsedSnapshot {
  users: SourceUser[];
  cvs: SourceCv[];
  sections: SourceSection[];
  versions: SourceVersion[];
  coverLetters: SourceLetter[];
  jobApplications: SourceJob[];
  legalAcceptances: SourceLegal[];
  /** The current content of each copied CV, as the shared document both sites edit. */
  documents: Map<string, SharedCvDocument>;
  /** Earlier V1 version snapshots, as documents. */
  versionDocuments: Map<string, SharedCvDocument>;
  rejected: RejectedDocument[];
}

const COLLECTIONS = ['users', 'cvs', 'cv_current', 'cv_sections', 'cv_versions', 'cover_letters', 'job_applications', 'legal_acceptances', 'billing_accounts'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function flag(value: unknown): boolean {
  return value === true;
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function deleted(row: Record<string, unknown>): boolean {
  return row.deletedAt !== null && row.deletedAt !== undefined;
}

export class MigrationError extends Error {
  constructor(readonly code: 'invalid_snapshot') {
    super(code);
    this.name = 'MigrationError';
  }
}

export function readSnapshot(value: unknown): ParsedSnapshot {
  if (!isRecord(value)) throw new MigrationError('invalid_snapshot');
  const usersRaw = value.users;
  const cvsRaw = value.cvs;
  const sectionsRaw = value.sections;
  const versionsRaw = value.versions;
  const lettersRaw = value.coverLetters;
  const jobsRaw = value.jobApplications;
  const legalRaw = value.legalAcceptances;
  if (!Array.isArray(usersRaw) || !Array.isArray(cvsRaw) || !Array.isArray(sectionsRaw) || !Array.isArray(versionsRaw) || !Array.isArray(lettersRaw) || !Array.isArray(jobsRaw) || !Array.isArray(legalRaw)) {
    throw new MigrationError('invalid_snapshot');
  }
  const users = usersRaw.flatMap((row) => {
    const user = parseUser(row);
    return user ? [user] : [];
  });
  const live = new Set(users.map((user) => user.uid));
  const rejected: RejectedDocument[] = [];
  const sections = sectionsRaw.flatMap((row) => {
    const section = parseSection(row);
    return section && live.has(section.userId) ? [section] : [];
  });
  const documents = new Map<string, SharedCvDocument>();
  const cvs = cvsRaw.flatMap((row) => {
    const cv = parseCv(row);
    if (!cv || !live.has(cv.userId)) return [];
    const built = v1Document(cv.raw, sections.filter((section) => section.cvId === cv.id).map((section) => section.raw));
    if (!built.ok) {
      rejected.push({ collection: 'cvs', id: cv.id, field: built.field });
      return [];
    }
    documents.set(cv.id, built.document);
    return [cv];
  });
  const copied = new Set(cvs.map((cv) => cv.id));
  const versionDocuments = new Map<string, SharedCvDocument>();
  const versions = versionsRaw.flatMap((row) => {
    const version = parseVersion(row);
    if (!version || !live.has(version.userId) || !copied.has(version.cvId)) return [];
    const built = v1Document(version.snapshot, arrayOf(version.snapshot.sections));
    if (!built.ok) {
      rejected.push({ collection: 'cv_versions', id: version.id, field: built.field });
      return [];
    }
    versionDocuments.set(version.id, built.document);
    return [version];
  });
  return {
    users,
    cvs,
    sections: sections.filter((section) => copied.has(section.cvId)),
    versions,
    documents,
    versionDocuments,
    rejected,
    coverLetters: lettersRaw.flatMap((row) => {
      const letter = parseLetter(row);
      if (letter === 'rejected') {
        rejected.push({ collection: 'cover_letters', id: isRecord(row) ? text(row.id) : '', field: 'content' });
        return [];
      }
      return letter && live.has(letter.userId) ? [letter] : [];
    }),
    jobApplications: jobsRaw.flatMap((row) => {
      const job = parseJob(row);
      return job && live.has(job.userId) ? [job] : [];
    }),
    legalAcceptances: legalRaw.flatMap((row) => {
      const legal = parseLegal(row);
      return legal && live.has(legal.userId) ? [legal] : [];
    }),
  };
}

function parseUser(value: unknown): SourceUser | null {
  if (!isRecord(value) || deleted(value) || typeof value.uid !== 'string' || value.uid.length === 0) return null;
  const preferences = isRecord(value.preferences) ? value.preferences : {};
  const subscription = isRecord(value.subscription) ? value.subscription : {};
  const profile = isRecord(value.profile) ? value.profile : {};
  const createdAt = v1Instant(value.createdAt);
  if (!createdAt || createdAt.length === 10) return null;
  const provider = subscription.provider;
  return {
    uid: value.uid,
    email: text(value.email),
    displayName: text(value.displayName),
    phoneNumber: typeof value.phoneNumber === 'string' ? value.phoneNumber : null,
    photoURL: typeof value.photoURL === 'string' ? value.photoURL : null,
    language: text(preferences.language, 'en'),
    theme: text(preferences.theme, 'light'),
    emailNotifications: preferences.emailNotifications !== false,
    marketingEmails: flag(preferences.marketingEmails),
    defaultCVTemplate: text(preferences.defaultCVTemplate, 'classic'),
    pushNotifications: flag(preferences.pushNotifications),
    plan: text(subscription.plan, 'free'),
    status: text(subscription.status, 'active'),
    provider: provider === 'stripe' || provider === 'apple' || provider === 'google' ? provider : null,
    periodEnd: v1Instant(subscription.currentPeriodEnd),
    cancelAtPeriodEnd: flag(subscription.cancelAtPeriodEnd),
    hasUsedTrial: flag(subscription.hasUsedTrial),
    createdAt,
    pushTokens: arrayOf(value.pushTokens).filter((token): token is string => typeof token === 'string' && token.length > 0 && token.length <= 512).slice(0, 10),
    firstName: text(profile.firstName),
    lastName: text(profile.lastName),
    headline: text(profile.headline),
    bio: text(profile.bio),
  };
}

function parseCv(value: unknown): SourceCv | null {
  if (!isRecord(value) || deleted(value) || typeof value.id !== 'string' || typeof value.userId !== 'string') return null;
  return {
    id: value.id,
    userId: value.userId,
    title: text(value.title, 'CV').slice(0, 200),
    templateId: text(value.templateId, 'classic'),
    isPublic: flag(value.isPublic),
    publicSlug: typeof value.publicSlug === 'string' ? value.publicSlug : null,
    personalInfo: isRecord(value.personalInfo) ? value.personalInfo : {},
    raw: value,
  };
}

/** A V1 CV (or a version snapshot of one) and its sections as the shared document. */
function v1Document(cv: Record<string, unknown>, sections: unknown[]): SharedDocumentResult {
  const title = text(cv.title).trim().slice(0, 200);
  return parseSharedCvDocument({
    title: title.length > 0 ? title : 'CV',
    templateId: text(cv.templateId, 'classic') || 'classic',
    status: cv.status,
    isPublic: cv.isPublic,
    publicSlug: cv.publicSlug,
    personalInfo: isRecord(cv.personalInfo) ? cv.personalInfo : {},
    sectionOrder: cv.sectionOrder,
    styling: isRecord(cv.styling) ? cv.styling : {},
    aiGenerated: cv.aiGenerated,
    aiProvider: cv.aiProvider,
    sections: sections
      .filter((section): section is Record<string, unknown> => isRecord(section) && !deleted(section))
      .map((section) => ({
        id: section.id,
        type: section.type,
        title: section.title,
        isVisible: section.isVisible,
        order: section.order,
        // Old V1 items may lack an id; a stable one keeps a re-run and both sites pointing at the same item.
        items: arrayOf(section.items).map((item, index) => (isRecord(item) && typeof item.id !== 'string' ? { ...item, id: `item-${index + 1}` } : item)),
      })),
  });
}

function parseSection(value: unknown): SourceSection | null {
  if (!isRecord(value) || deleted(value) || typeof value.id !== 'string' || typeof value.cvId !== 'string' || typeof value.userId !== 'string') return null;
  return { id: value.id, cvId: value.cvId, userId: value.userId, type: text(value.type), items: arrayOf(value.items), raw: value };
}

function parseVersion(value: unknown): SourceVersion | null {
  if (!isRecord(value) || deleted(value) || typeof value.id !== 'string' || typeof value.cvId !== 'string' || typeof value.userId !== 'string') return null;
  const createdAt = v1Instant(value.createdAt) ?? new Date(0).toISOString();
  const versionNumber = typeof value.versionNumber === 'number' && value.versionNumber >= 1 ? value.versionNumber : 1;
  return {
    id: value.id,
    cvId: value.cvId,
    userId: value.userId,
    versionNumber,
    snapshot: isRecord(value.snapshot) ? value.snapshot : {},
    createdAt,
  };
}

/**
 * V1 creates a letter before it has text, so an empty letter is copied too.
 * Content too long for V2 is rejected (and fails the count check), not cut.
 */
function parseLetter(value: unknown): SourceLetter | null | 'rejected' {
  if (!isRecord(value) || deleted(value) || typeof value.id !== 'string' || typeof value.userId !== 'string') return null;
  const content = text(value.content);
  if (content.length > 60000 || letterHtmlToText(content).length > 20000) return 'rejected';
  const title = text(value.title).trim().slice(0, 200);
  return { id: value.id, userId: value.userId, title: title.length > 0 ? title : 'Cover letter', content, linkedCVId: typeof value.linkedCVId === 'string' ? value.linkedCVId : null, raw: value };
}

function parseJob(value: unknown): SourceJob | null {
  if (!isRecord(value) || deleted(value) || typeof value.id !== 'string' || typeof value.userId !== 'string') return null;
  const position = text(value.position);
  if (position.length === 0) return null;
  return {
    id: value.id,
    userId: value.userId,
    company: text(value.company),
    position,
    status: text(value.status, 'wishlist'),
    appliedDate: typeof value.appliedDate === 'string' ? value.appliedDate : null,
    notes: text(value.notes),
    linkedCVId: typeof value.linkedCVId === 'string' ? value.linkedCVId : null,
    linkedCoverLetterId: typeof value.linkedCoverLetterId === 'string' ? value.linkedCoverLetterId : null,
    contactName: typeof value.contactName === 'string' ? value.contactName : null,
    contactEmail: typeof value.contactEmail === 'string' ? value.contactEmail : null,
    followUpDate: typeof value.followUpDate === 'string' ? value.followUpDate : null,
    outcome: typeof value.outcome === 'string' ? value.outcome : null,
  };
}

function parseLegal(value: unknown): SourceLegal | null {
  if (!isRecord(value) || typeof value.userId !== 'string') return null;
  if (value.termsAccepted !== true || value.privacyAccepted !== true || value.disclaimerAccepted !== true) return null;
  const acceptedAt = v1Instant(value.acceptedAt);
  const termsVersion = text(value.termsVersion);
  const privacyVersion = text(value.privacyVersion);
  const disclaimerVersion = text(value.disclaimerVersion);
  if (!acceptedAt || termsVersion.length === 0 || privacyVersion.length === 0 || disclaimerVersion.length === 0) return null;
  return { userId: value.userId, termsVersion, privacyVersion, disclaimerVersion, acceptedAt };
}

function sourceCounts(snapshot: ParsedSnapshot): Record<string, number> {
  return {
    users: snapshot.users.length,
    cvs: snapshot.cvs.length,
    cv_current: snapshot.cvs.length,
    cv_sections: snapshot.sections.length,
    cv_versions: snapshot.versions.length,
    cover_letters: snapshot.coverLetters.length,
    job_applications: snapshot.jobApplications.length,
    legal_acceptances: snapshot.legalAcceptances.length,
    billing_accounts: snapshot.users.length,
  };
}

function blankReport(mode: 'dry-run' | 'apply', snapshot: ParsedSnapshot): MigrationReport {
  const counts = sourceCounts(snapshot);
  return {
    mode,
    counts: COLLECTIONS.map((collection) => ({ collection, source: counts[collection] ?? 0, written: 0, skipped: 0 })),
    sampleIds: {},
    rejected: snapshot.rejected,
  };
}

function bump(report: MigrationReport, collection: string, field: 'written' | 'skipped', originId?: string): void {
  const row = report.counts.find((item) => item.collection === collection);
  if (!row) return;
  row[field] += 1;
  if (field === 'written' && originId) {
    const sample = report.sampleIds[collection] ?? [];
    if (sample.length < 3) sample.push(originId);
    report.sampleIds[collection] = sample;
  }
}

const systemClock: Clock = { now: () => new Date() };

/**
 * Copies a JSON snapshot shaped like V1 documents. It does not open Firestore.
 * A second apply leaves the first rows untouched.
 */
export class V1Migration {
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = systemClock,
  ) {}

  async dryRun(value: unknown): Promise<MigrationReport> {
    const snapshot = readSnapshot(value);
    const report = blankReport('dry-run', snapshot);
    const existing = await this.pool.query<{ origin_collection: string; origin_id: string }>(
      `SELECT origin_collection, origin_id FROM migration_keys`,
    );
    const seen = new Set(existing.rows.map((row) => `${row.origin_collection}:${row.origin_id}`));
    this.tally(snapshot, seen, report);
    return report;
  }

  async apply(value: unknown): Promise<MigrationReport> {
    const snapshot = readSnapshot(value);
    await publishCatalog(this.pool, this.clock.now());
    return withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO catalog_versions (version, published_at, snapshot)
         VALUES ($1, $2, '{"kind":"legacy-v1"}'::jsonb)
         ON CONFLICT (version) DO NOTHING`,
        [LEGACY_CATALOG, this.clock.now()],
      );
      const report = blankReport('apply', snapshot);
      const users = new Map<string, { userId: string; workspaceId: string }>();
      const resumes = new Map<string, string>();
      const versions = new Map<string, string>();
      const letters = new Map<string, string>();
      const currentVersions = new Map<string, string>();
      for (const user of snapshot.users) {
        const already = await keyId(client, 'users', user.uid);
        if (already) {
          bump(report, 'users', 'skipped');
          bump(report, 'billing_accounts', 'skipped');
          const billing = await keyId(client, 'billing_accounts', user.uid);
          const workspace = await client.query<{ id: string }>(`SELECT id FROM workspaces WHERE owner_user_id = $1`, [already]);
          if (billing && workspace.rows[0]) users.set(user.uid, { userId: already, workspaceId: workspace.rows[0].id });
          continue;
        }
        const created = await insertUser(client, user);
        await putKey(client, 'users', user.uid, 'users', created.userId);
        await putKey(client, 'billing_accounts', user.uid, 'billing_accounts', created.billingId);
        users.set(user.uid, created);
        bump(report, 'users', 'written', user.uid);
        bump(report, 'billing_accounts', 'written', user.uid);
      }
      for (const cv of snapshot.cvs) {
        const owner = users.get(cv.userId);
        const document = snapshot.documents.get(cv.id);
        if (!owner || !document) continue;
        const templateId = v2ResumeTemplateFor(document);
        let resumeId = await keyId(client, 'cvs', cv.id);
        if (resumeId) {
          bump(report, 'cvs', 'skipped');
        } else {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO resumes (workspace_id, candidate_auth_user_id, title, language, template_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [owner.workspaceId, cv.userId, document.title, localeOf(snapshot.users.find((user) => user.uid === cv.userId)?.language), templateId],
          );
          resumeId = inserted.rows[0].id;
          await putKey(client, 'cvs', cv.id, 'resumes', resumeId);
          bump(report, 'cvs', 'written', cv.id);
        }
        resumes.set(cv.id, resumeId);
        // Earlier V1 snapshots first, in their order; the CV as it stands now is the newest version.
        const history = snapshot.versions.filter((version) => version.cvId === cv.id).sort((a, b) => a.versionNumber - b.versionNumber);
        for (const version of history) {
          const already = await keyId(client, 'cv_versions', version.id);
          if (already) {
            versions.set(version.id, already);
            bump(report, 'cv_versions', 'skipped');
            continue;
          }
          const snapshotDocument = snapshot.versionDocuments.get(version.id);
          if (!snapshotDocument) continue;
          const inserted = await insertDocumentVersion(client, resumeId, snapshotDocument, v2ResumeTemplateFor(snapshotDocument), version.createdAt);
          versions.set(version.id, inserted);
          await putKey(client, 'cv_versions', version.id, 'resume_versions', inserted);
          bump(report, 'cv_versions', 'written', version.id);
        }
        const current = await keyId(client, 'cv_current', cv.id);
        if (current) {
          currentVersions.set(cv.id, current);
          bump(report, 'cv_current', 'skipped');
          continue;
        }
        const inserted = await insertDocumentVersion(client, resumeId, document, templateId, null);
        currentVersions.set(cv.id, inserted);
        await putKey(client, 'cv_current', cv.id, 'resume_versions', inserted);
        bump(report, 'cv_current', 'written', cv.id);
      }
      // V1 section items also seed V2's career profile as draft facts. The CV itself is the shared document above.
      for (const section of snapshot.sections) {
        const owner = users.get(section.userId);
        const resumeId = resumes.get(section.cvId);
        if (!owner || !resumeId) continue;
        const already = await keyId(client, 'cv_sections', section.id);
        if (already) {
          bump(report, 'cv_sections', 'skipped');
          continue;
        }
        const factType = SECTION_FACT[section.type];
        const factIds: string[] = [];
        if (factType) {
          for (const item of section.items) {
            const value = isRecord(item) ? item : { text: text(item) };
            const startDate = text(value.startDate);
            const uncertain = startDate.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ? { startDate: { reason: 'partial', raw: startDate } } : {};
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO career_facts (workspace_id, candidate_auth_user_id, fact_type, value, source, confirmation, uncertain, revision)
               VALUES ($1, $2, $3, $4::jsonb, 'migrated', 'draft', $5::jsonb, 1) RETURNING id`,
              [owner.workspaceId, section.userId, factType, JSON.stringify(value), JSON.stringify(uncertain)],
            );
            factIds.push(inserted.rows[0].id);
            await client.query(
              `INSERT INTO career_fact_revisions (fact_id, revision, value, confirmation, uncertain, change)
               VALUES ($1, 1, $2::jsonb, 'draft', $3::jsonb, 'created')`,
              [inserted.rows[0].id, JSON.stringify(value), JSON.stringify(uncertain)],
            );
          }
        }
        await putKey(client, 'cv_sections', section.id, factIds[0] ? 'career_facts' : 'resumes', factIds[0] ?? resumeId);
        bump(report, 'cv_sections', 'written', section.id);
      }
      for (const letter of snapshot.coverLetters) {
        const owner = users.get(letter.userId);
        if (!owner) continue;
        const already = await keyId(client, 'cover_letters', letter.id);
        if (already) {
          letters.set(letter.id, already);
          bump(report, 'cover_letters', 'skipped');
          continue;
        }
        const raw = letter.raw;
        const v1TemplateId = text(raw.templateId, 'classic') || 'classic';
        const sharedFields: Record<string, unknown> = { contentHtml: letter.content, v1TemplateId };
        for (const key of ['recipientName', 'recipientTitle', 'companyName', 'companyAddress', 'jobTitle', 'jobDescription', 'aiProvider']) {
          if (typeof raw[key] === 'string') sharedFields[key] = raw[key];
        }
        if (isRecord(raw.styling)) sharedFields.styling = Object.fromEntries(Object.entries(raw.styling).filter(([, value]) => typeof value === 'string'));
        if (raw.aiGenerated === true) sharedFields.aiGenerated = true;
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO writing_documents (workspace_id, candidate_auth_user_id, document_type, title, body, fact_ids, linked_resume_id, confirmation, template_id, shared_fields)
           VALUES ($1, $2, 'cover_letter', $3, $4, '{}', $5, $6, $7, $8::jsonb) RETURNING id`,
          [
            owner.workspaceId,
            letter.userId,
            letter.title,
            letterHtmlToText(letter.content),
            letter.linkedCVId ? resumes.get(letter.linkedCVId) ?? null : null,
            raw.status === 'final' ? 'confirmed' : 'draft',
            v2LetterTemplateFor(v1TemplateId),
            JSON.stringify(sharedFields),
          ],
        );
        letters.set(letter.id, inserted.rows[0].id);
        await putKey(client, 'cover_letters', letter.id, 'writing_documents', inserted.rows[0].id);
        bump(report, 'cover_letters', 'written', letter.id);
      }
      for (const job of snapshot.jobApplications) {
        const owner = users.get(job.userId);
        if (!owner) continue;
        const already = await keyId(client, 'job_applications', job.id);
        if (already) {
          bump(report, 'job_applications', 'skipped');
          continue;
        }
        const mapped = mapJob(job);
        const organization = job.company.length > 0 ? job.company : 'unstated';
        const opportunity = await client.query<{ id: string }>(
          `INSERT INTO opportunities (category, provider, source_id, title, organization, status, candidate_auth_user_id)
           VALUES ('job', 'paste', $1, $2, $3, 'open', $4) RETURNING id`,
          [`v1:${job.id}`, job.position, organization, job.userId],
        );
        const revision = await client.query<{ id: string }>(
          `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, status, description, deadline)
           VALUES ($1, 1, $2, $3, 'open', '', $4) RETURNING id`,
          [opportunity.rows[0].id, job.position, organization, job.followUpDate],
        );
        await client.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [opportunity.rows[0].id, revision.rows[0].id]);
        await client.query(
          `INSERT INTO opportunity_sources (opportunity_id, provider, source_id, source_url) VALUES ($1, 'paste', $2, NULL)`,
          [opportunity.rows[0].id, `v1:${job.id}`],
        );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO applications (workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id, resume_version_id, letter_version_id, status, contacts, notes, dates, source_snapshot)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11::jsonb) RETURNING id`,
          [
            owner.workspaceId,
            job.userId,
            opportunity.rows[0].id,
            revision.rows[0].id,
            job.linkedCVId ? currentVersions.get(job.linkedCVId) ?? null : null,
            job.linkedCoverLetterId ? letters.get(job.linkedCoverLetterId) ?? null : null,
            mapped.status,
            JSON.stringify(job.contactName ? [{ name: job.contactName, email: job.contactEmail, phone: null }] : []),
            mapped.notes,
            JSON.stringify({ deadline: job.followUpDate, applied: job.appliedDate, interview: null }),
            JSON.stringify({ title: job.position, organization, provider: 'paste', originId: job.id }),
          ],
        );
        await putKey(client, 'job_applications', job.id, 'applications', inserted.rows[0].id);
        bump(report, 'job_applications', 'written', job.id);
      }
      for (const legal of snapshot.legalAcceptances) {
        const owner = users.get(legal.userId);
        if (!owner) continue;
        const already = await keyId(client, 'legal_acceptances', legal.userId);
        if (already) {
          bump(report, 'legal_acceptances', 'skipped');
          continue;
        }
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO legal_acceptances (user_id, auth_user_id, terms_accepted, privacy_accepted, disclaimer_accepted, terms_version, privacy_version, disclaimer_version, accepted_at)
           VALUES ($1, $2, true, true, true, $3, $4, $5, $6) RETURNING id`,
          [owner.userId, legal.userId, legal.termsVersion, legal.privacyVersion, legal.disclaimerVersion, legal.acceptedAt],
        );
        await putKey(client, 'legal_acceptances', legal.userId, 'legal_acceptances', inserted.rows[0].id);
        bump(report, 'legal_acceptances', 'written', legal.userId);
      }
      return report;
    });
  }

  async countCheck(value: unknown): Promise<CountCheck> {
    const snapshot = readSnapshot(value);
    const expected = sourceCounts(snapshot);
    const rows = [];
    for (const collection of COLLECTIONS) {
      const destination = await this.destinationCount(collection);
      rows.push({ collection, source: expected[collection] ?? 0, destination });
    }
    return { ok: snapshot.rejected.length === 0 && rows.every((row) => row.source === row.destination), rows, rejected: snapshot.rejected };
  }

  private tally(snapshot: ParsedSnapshot, seen: Set<string>, report: MigrationReport): void {
    for (const user of snapshot.users) {
      bump(report, 'users', seen.has(`users:${user.uid}`) ? 'skipped' : 'written', user.uid);
      bump(report, 'billing_accounts', seen.has(`billing_accounts:${user.uid}`) ? 'skipped' : 'written', user.uid);
    }
    for (const cv of snapshot.cvs) {
      bump(report, 'cvs', seen.has(`cvs:${cv.id}`) ? 'skipped' : 'written', cv.id);
      bump(report, 'cv_current', seen.has(`cv_current:${cv.id}`) ? 'skipped' : 'written', cv.id);
    }
    for (const section of snapshot.sections) bump(report, 'cv_sections', seen.has(`cv_sections:${section.id}`) ? 'skipped' : 'written', section.id);
    for (const version of snapshot.versions) bump(report, 'cv_versions', seen.has(`cv_versions:${version.id}`) ? 'skipped' : 'written', version.id);
    for (const letter of snapshot.coverLetters) bump(report, 'cover_letters', seen.has(`cover_letters:${letter.id}`) ? 'skipped' : 'written', letter.id);
    for (const job of snapshot.jobApplications) bump(report, 'job_applications', seen.has(`job_applications:${job.id}`) ? 'skipped' : 'written', job.id);
    for (const legal of snapshot.legalAcceptances) bump(report, 'legal_acceptances', seen.has(`legal_acceptances:${legal.userId}`) ? 'skipped' : 'written', legal.userId);
  }

  private async destinationCount(collection: string): Promise<number> {
    const table = {
      users: 'users',
      cvs: 'resumes',
      cv_current: 'resume_versions',
      cv_sections: 'career_facts',
      cv_versions: 'resume_versions',
      cover_letters: 'writing_documents',
      job_applications: 'applications',
      legal_acceptances: 'legal_acceptances',
      billing_accounts: 'billing_accounts',
    }[collection];
    if (!table) return 0;
    if (collection === 'cv_sections') {
      const found = await this.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM migration_keys k
         WHERE k.origin_collection = 'cv_sections'
           AND (
             (k.destination_table = 'career_facts' AND EXISTS (SELECT 1 FROM career_facts f WHERE f.id = k.destination_id))
             OR (k.destination_table = 'resume_versions' AND EXISTS (SELECT 1 FROM resume_versions v WHERE v.id = k.destination_id))
             OR (k.destination_table = 'resumes' AND EXISTS (SELECT 1 FROM resumes r WHERE r.id = k.destination_id))
           )`,
      );
      return found.rows[0]?.n ?? 0;
    }
    const found = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM migration_keys k
       JOIN ${table} destination ON destination.id = k.destination_id
       WHERE k.origin_collection = $1`,
      [collection],
    );
    return found.rows[0]?.n ?? 0;
  }
}

async function insertDocumentVersion(client: PoolClient, resumeId: string, document: SharedCvDocument, templateId: ReturnType<typeof v2ResumeTemplateFor>, createdAt: string | null): Promise<string> {
  const next = await client.query<{ n: number }>(`SELECT coalesce(max(version_number), 0)::int + 1 AS n FROM resume_versions WHERE resume_id = $1`, [resumeId]);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO resume_versions (resume_id, version_number, body, fact_ids, created_at)
     VALUES ($1, $2, $3::jsonb, '{}', coalesce($4::timestamptz, now())) RETURNING id`,
    [resumeId, next.rows[0].n, JSON.stringify({ ...projectDocument(document, templateId), document }), createdAt],
  );
  return inserted.rows[0].id;
}

function localeOf(language: string | undefined): 'en' | 'fr' {
  return language === 'fr' ? 'fr' : 'en';
}

/**
 * V1 job status → career application status. Current V1 statuses share the
 * career ids; legacy ones follow shared-types `normalizeJobStatus`
 * (wishlist → saved, offer → offered, accepted → offered with the acceptance
 * kept as a note). An offered job whose outcome is `accepted` is recorded
 * exactly like the legacy `accepted` status. Unknown values fall to saved.
 */
export function mapJob(job: Pick<SourceJob, 'status' | 'notes'> & { outcome?: string | null }): { status: string; notes: string } {
  const accepted = job.status === 'accepted' || ((job.status === 'offered' || job.status === 'offer') && job.outcome === 'accepted');
  if (accepted) {
    const note = 'V1 status: accepted';
    return { status: 'offered', notes: job.notes.length > 0 ? `${job.notes}\n${note}` : note };
  }
  switch (job.status) {
    case 'saved':
    case 'wishlist':
      return { status: 'saved', notes: job.notes };
    case 'preparing':
    case 'applied':
    case 'interviewing':
    case 'rejected':
    case 'withdrawn':
      return { status: job.status, notes: job.notes };
    case 'offered':
    case 'offer':
      return { status: 'offered', notes: job.notes };
    default:
      return { status: 'saved', notes: job.notes };
  }
}

async function keyId(client: PoolClient, collection: string, originId: string): Promise<string | null> {
  const found = await client.query<{ destination_id: string }>(
    `SELECT destination_id FROM migration_keys WHERE origin_collection = $1 AND origin_id = $2`,
    [collection, originId],
  );
  return found.rows[0]?.destination_id ?? null;
}

async function putKey(client: PoolClient, collection: string, originId: string, table: string, destinationId: string): Promise<void> {
  await client.query(
    `INSERT INTO migration_keys (origin_collection, origin_id, destination_table, destination_id) VALUES ($1, $2, $3, $4)`,
    [collection, originId, table, destinationId],
  );
}

async function insertUser(client: PoolClient, user: SourceUser): Promise<{ userId: string; workspaceId: string; billingId: string }> {
  const locale = localeOf(user.language);
  const settings = {
    theme: user.theme,
    emailNotifications: user.emailNotifications,
    marketingEmails: user.marketingEmails,
    defaultCVTemplate: user.defaultCVTemplate,
    pushNotifications: user.pushNotifications,
    photoURL: user.photoURL,
    displayName: user.displayName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    ...(locale === user.language ? {} : { v1Language: user.language }),
  };
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO users (auth_user_id, locale, settings, created_at) VALUES ($1, $2, $3::jsonb, $4) RETURNING id`,
    [user.uid, locale, JSON.stringify(settings), user.createdAt],
  );
  const userId = inserted.rows[0].id;
  const workspace = await client.query<{ id: string }>(
    `INSERT INTO workspaces (owner_user_id, kind, name) VALUES ($1, 'individual', $2) RETURNING id`,
    [userId, user.displayName.length > 0 ? user.displayName : null],
  );
  const workspaceId = workspace.rows[0].id;
  await client.query(
    `INSERT INTO career_profiles (workspace_id, candidate_auth_user_id, preferences) VALUES ($1, $2, $3::jsonb)`,
    [workspaceId, user.uid, JSON.stringify({ theme: user.theme, defaultCVTemplate: user.defaultCVTemplate })],
  );
  const start = new Date(user.createdAt);
  const end = addUtcMonths(start, 1);
  const legacy = user.plan === 'pro' || user.plan === 'enterprise' || user.plan === 'career_accelerator';
  const planId = user.plan === 'pro' ? 'legacy_pro' : user.plan === 'enterprise' ? 'legacy_enterprise' : user.plan === 'career_accelerator' ? 'legacy_career_accelerator' : 'free';
  const legacyPlan = user.plan === 'pro' || user.plan === 'enterprise' || user.plan === 'career_accelerator' ? user.plan : null;
  const status = user.status === 'trialing' || user.status === 'past_due' || user.status === 'canceled' || user.status === 'incomplete' ? user.status : 'active';
  const provider = legacy ? user.provider ?? 'stripe' : null;
  const trialEnd = status === 'trialing' ? user.periodEnd ?? end.toISOString() : null;
  const billing = await client.query<{ id: string }>(
    `INSERT INTO billing_accounts (
       workspace_id, auth_user_id, plan_id, legacy_plan, catalog_version, interval, status, trial_end, has_used_trial,
       period_end, allowance_anchor, allowance_period_start, allowance_period_end, provider, cancel_at_period_end, origin
     ) VALUES ($1, $2, $3, $4, $5, 'monthly', $6, $7, $8, $9, $10, $10, $11, $12, $13, 'migrated') RETURNING id`,
    [workspaceId, user.uid, planId, legacyPlan, legacy ? LEGACY_CATALOG : CATALOG_VERSION, status, trialEnd, user.hasUsedTrial, user.periodEnd, start, end, provider, user.cancelAtPeriodEnd],
  );
  for (const token of user.pushTokens) {
    await client.query(`INSERT INTO push_tokens (user_id, auth_user_id, token) VALUES ($1, $2, $3)`, [userId, user.uid, token]);
  }
  if (user.firstName.length > 0 || user.email.length > 0) {
    await client.query(
      `INSERT INTO career_facts (workspace_id, candidate_auth_user_id, fact_type, value, source, confirmation, revision)
       VALUES ($1, $2, 'contact', $3::jsonb, 'migrated', 'draft', 1)`,
      [workspaceId, user.uid, JSON.stringify({ firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phoneNumber })],
    );
  }
  if (user.bio.length > 0 || user.headline.length > 0) {
    await client.query(
      `INSERT INTO career_facts (workspace_id, candidate_auth_user_id, fact_type, value, source, confirmation, revision)
       VALUES ($1, $2, 'summary', $3::jsonb, 'migrated', 'draft', 1)`,
      [workspaceId, user.uid, JSON.stringify({ headline: user.headline, bio: user.bio })],
    );
  }
  return { userId, workspaceId, billingId: billing.rows[0].id };
}
