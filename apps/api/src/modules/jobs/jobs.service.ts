import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { CVService } from '../cv/cv.service';
import { CoverLetterService } from '../cover-letter/cover-letter.service';
import {
  CreateJobData,
  JOB_LIMITS,
  JobApplication,
  JobCapacity,
  JobChecklistItem,
  JobChecklistItemInput,
  JobContact,
  JobContactInput,
  JobCoverLetterSnapshot,
  JobCvSnapshot,
  JobFormAnswer,
  JobFormAnswerInput,
  JobOutcome,
  JobStatus,
  JobStatusChange,
  LEGACY_CONTACT_ID,
  UpdateJobData,
  normalizeJobApplication,
  normalizeJobStatus,
} from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Plan capacity for tracked applications (spec: 25 / 100 / 500 / 2000 by plan).
 *
 * The jobs module does NOT know plans. Whoever owns plan entitlements provides
 * this token (in JobsModule) as a function returning the user's limit, or null
 * for "not limited". Until it is provided, nothing is limited — exactly V1's
 * previous behaviour. Every place that adds to the tracked count calls
 * `assertCapacity`, so wiring the provider is the only change needed.
 */
export const JOB_CAPACITY_LIMIT = 'JOB_CAPACITY_LIMIT';
export type JobCapacityLimitResolver = (userId: string) => Promise<number | null>;

/** Fields copied verbatim when present (validated by the DTO). */
const PLAIN_FIELDS = [
  'company',
  'position',
  'jobUrl',
  'location',
  'appliedDate',
  'notes',
  'salaryRange',
  'interviewDate',
  'followUpDate',
  'deadline',
  'jobDescription',
  'jobDescriptionSource',
  'opportunityId',
  'archived',
] as const satisfies readonly (keyof UpdateJobData)[];

/** Empty strings from forms mean "not set"; trim so whitespace-only values don't survive. */
function text(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Client-supplied ids are kept when usable (stable edits); missing or repeated ones get a new id. */
function idAllocator() {
  const seen = new Set<string>();
  return (candidate: string | undefined): string => {
    const id = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : uuidv4();
    const unique = seen.has(id) ? uuidv4() : id;
    seen.add(unique);
    return unique;
  };
}

function contactsFrom(input: readonly JobContactInput[]): JobContact[] {
  const nextId = idAllocator();
  const out: JobContact[] = [];
  for (const c of input.slice(0, JOB_LIMITS.contacts)) {
    const name = text(c.name);
    const email = text(c.email);
    // A row with neither a name nor an email identifies nobody.
    if (!name && !email) continue;
    out.push({
      id: nextId(c.id),
      name: name ?? '',
      role: text(c.role),
      email,
      phone: text(c.phone),
      notes: text(c.notes),
    });
  }
  return out;
}

function checklistFrom(input: readonly JobChecklistItemInput[]): JobChecklistItem[] {
  const nextId = idAllocator();
  const out: JobChecklistItem[] = [];
  for (const item of input.slice(0, JOB_LIMITS.checklistItems)) {
    const label = text(item.label);
    if (!label) continue;
    out.push({ id: nextId(item.id), label, kind: item.kind ?? 'task', done: item.done === true });
  }
  return out;
}

function answersFrom(input: readonly JobFormAnswerInput[]): JobFormAnswer[] {
  const nextId = idAllocator();
  const out: JobFormAnswer[] = [];
  for (const row of input.slice(0, JOB_LIMITS.formAnswers)) {
    const question = text(row.question);
    if (!question) continue;
    out.push({ id: nextId(row.id), question, answer: (row.answer ?? '').trim() });
  }
  return out;
}

/**
 * An old client (single contact fields only) edited the contact: apply it to
 * the first contact and keep any further contacts a newer client added.
 */
function mergeLegacyContact(current: JobContact[], data: UpdateJobData): JobContact[] {
  const [first, ...rest] = current;
  const base: JobContact = first ?? { id: LEGACY_CONTACT_ID, name: '', role: null, email: null, phone: null, notes: null };
  const merged: JobContact = {
    ...base,
    name: data.contactName !== undefined ? (text(data.contactName) ?? '') : base.name,
    email: data.contactEmail !== undefined ? text(data.contactEmail) : base.email,
  };
  return merged.name || merged.email ? [merged, ...rest] : rest;
}

/** Mirror of the first contact into the deprecated single-contact fields (old clients read them). */
function contactMirror(contacts: readonly JobContact[]): { contactName: string | null; contactEmail: string | null } {
  return { contactName: contacts[0]?.name || null, contactEmail: contacts[0]?.email ?? null };
}

function appendHistory(history: readonly JobStatusChange[], status: JobStatus, at: string): JobStatusChange[] {
  return [...history, { status, at }].slice(-JOB_LIMITS.statusHistory);
}

@Injectable()
export class JobsService {
  private readonly collection = 'job_applications';

  constructor(
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly cvService: CVService,
    private readonly coverLetterService: CoverLetterService,
    @Optional() @Inject(JOB_CAPACITY_LIMIT) private readonly capacityLimit?: JobCapacityLimitResolver,
  ) {}

  // ---------------------------------------------------------------------------
  // Capacity (single check point — see JOB_CAPACITY_LIMIT)
  // ---------------------------------------------------------------------------

  /**
   * Applications that count toward the plan capacity: not deleted and not
   * archived. Archiving is how a user frees capacity without losing history,
   * so restoring one is checked like creating one.
   */
  async countTracked(userId: string): Promise<number> {
    const jobs = await this.listByUser(userId);
    return jobs.filter((j) => !j.archived).length;
  }

  /**
   * THE capacity check. `limit` null/undefined = unlimited. Throws a 403 with
   * the stable code `JOB_CAPACITY_REACHED` (same shape as CV_LIMIT_REACHED) so
   * clients open their upgrade prompt instead of reading the English message.
   */
  async checkCapacity(userId: string, limit: number | null | undefined): Promise<JobCapacity> {
    const used = await this.countTracked(userId);
    const capped = typeof limit === 'number' && Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : null;
    if (capped !== null && used >= capped) {
      throw new ForbiddenException({
        message: 'Tracked application limit reached for your plan. Archive an application or upgrade.',
        code: 'JOB_CAPACITY_REACHED',
        used,
        limit: capped,
      });
    }
    return { used, limit: capped };
  }

  /** Usage for display; never throws on a full plan. */
  async capacity(userId: string): Promise<JobCapacity> {
    const [used, limit] = await Promise.all([this.countTracked(userId), this.resolveLimit(userId)]);
    return { used, limit };
  }

  private async resolveLimit(userId: string): Promise<number | null> {
    return this.capacityLimit ? this.capacityLimit(userId) : null;
  }

  private async assertCapacity(userId: string): Promise<void> {
    if (!this.capacityLimit) return;
    await this.checkCapacity(userId, await this.capacityLimit(userId));
  }

  // ---------------------------------------------------------------------------
  // Frozen documents
  // ---------------------------------------------------------------------------

  /**
   * Freeze the CV as a new V1 CV version and point the application at it, so
   * later edits to the CV do not rewrite what was sent. Throws (404/403) when
   * the CV is missing or not the user's.
   */
  private async freezeCv(userId: string, cvId: string, label: string): Promise<JobCvSnapshot> {
    const cv = await this.cvService.findByIdOrThrow(cvId, userId);
    const version = await this.cvService.createVersion(cvId, userId, `Used for application: ${label}`.slice(0, 500));
    return {
      documentId: cvId,
      title: cv.title ?? '',
      versionId: version.id,
      versionNumber: typeof version.versionNumber === 'number' ? version.versionNumber : null,
      frozenAt: new Date().toISOString(),
    };
  }

  /** Cover letters have no version history, so their content is copied (capped). */
  private async freezeCoverLetter(userId: string, letterId: string): Promise<JobCoverLetterSnapshot> {
    const letter = await this.coverLetterService.findByIdOrThrow(letterId, userId);
    const content = typeof letter.content === 'string' ? letter.content : '';
    return {
      documentId: letterId,
      title: letter.title ?? '',
      content: content.slice(0, JOB_LIMITS.letterSnapshotChars),
      truncated: content.length > JOB_LIMITS.letterSnapshotChars,
      frozenAt: new Date().toISOString(),
    };
  }

  private static label(company: string, position: string): string {
    return company ? `${position} at ${company}` : position;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(userId: string, data: CreateJobData): Promise<JobApplication> {
    await this.assertCapacity(userId);

    const id = uuidv4();
    const now = new Date();
    const at = now.toISOString();
    const normalized = normalizeJobStatus(data.status) ?? { status: JobStatus.SAVED, acceptedOffer: false };
    const outcome: JobOutcome | null = data.outcome ?? (normalized.acceptedOffer ? 'accepted' : null);
    const contacts =
      data.contacts !== undefined
        ? contactsFrom(data.contacts)
        : mergeLegacyContact([], { contactName: data.contactName, contactEmail: data.contactEmail });
    const label = JobsService.label(data.company, data.position);
    const linkedCVId = text(data.linkedCVId);
    const linkedCoverLetterId = text(data.linkedCoverLetterId);

    // Frozen before the write: a CV that is not the user's fails the create
    // instead of leaving an application that points at it.
    const cvSnapshot = linkedCVId ? await this.freezeCv(userId, linkedCVId, label) : null;
    const coverLetterSnapshot = linkedCoverLetterId ? await this.freezeCoverLetter(userId, linkedCoverLetterId) : null;

    const job: JobApplication = {
      id,
      userId,
      company: data.company,
      position: data.position,
      jobUrl: text(data.jobUrl),
      location: text(data.location),
      status: normalized.status,
      appliedDate: text(data.appliedDate),
      notes: text(data.notes),
      linkedCVId,
      linkedCoverLetterId,
      salaryRange: text(data.salaryRange),
      ...contactMirror(contacts),
      interviewDate: text(data.interviewDate),
      followUpDate: text(data.followUpDate),
      deadline: text(data.deadline),
      jobDescription: text(data.jobDescription),
      jobDescriptionSource: text(data.jobDescription) ? (data.jobDescriptionSource ?? 'pasted') : null,
      contacts,
      checklist: checklistFrom(data.checklist ?? []),
      formAnswers: answersFrom(data.formAnswers ?? []),
      cvSnapshot,
      coverLetterSnapshot,
      outcome,
      outcomeOrigin: outcome ? 'user_reported' : null,
      outcomeRecordedAt: outcome ? at : null,
      opportunityId: text(data.opportunityId),
      statusHistory: [{ status: normalized.status, at }],
      archived: data.archived ?? false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).set(job);
    return job;
  }

  /**
   * Detect an application for the same company + position that the user already
   * tracks, so the UI can ask them to confirm rather than silently creating a
   * duplicate. Compared case- and whitespace-insensitively; archived entries
   * still count, since re-applying to an archived role is worth flagging too.
   */
  async findDuplicate(
    userId: string,
    company: string,
    position: string,
  ): Promise<JobApplication | null> {
    const norm = (s: string) => s.trim().toLowerCase();
    const existing = await this.listByUser(userId);
    return (
      existing.find(
        (j) => norm(j.company) === norm(company) && norm(j.position) === norm(position),
      ) ?? null
    );
  }

  async listByUser(userId: string): Promise<JobApplication[]> {
    const snapshot = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('userId', '==', userId)
      .where('deletedAt', '==', null)
      .orderBy('updatedAt', 'desc')
      .get();
    // Old and new documents alike come back in the current shape.
    return snapshot.docs.map((d: any) => normalizeJobApplication(d.data()));
  }

  async findByIdOrThrow(id: string, userId: string): Promise<JobApplication> {
    const doc = await this.firebaseAdmin.firestore.collection(this.collection).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Job application not found');
    const job = normalizeJobApplication(doc.data());
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    // A soft-deleted application is gone as far as the user is concerned.
    if (job.deletedAt) throw new NotFoundException('Job application not found');
    return job;
  }

  async update(id: string, userId: string, data: UpdateJobData): Promise<JobApplication> {
    const current = await this.findByIdOrThrow(id, userId);
    const now = new Date();
    const at = now.toISOString();
    const updateData: Record<string, unknown> = { updatedAt: now };

    for (const key of PLAIN_FIELDS) {
      const value = data[key];
      if (value === undefined) continue;
      updateData[key] = typeof value === 'string' && key !== 'company' && key !== 'position' ? text(value) : value;
    }
    if (data.jobDescription !== undefined && data.jobDescriptionSource === undefined) {
      updateData.jobDescriptionSource = text(data.jobDescription) ? (current.jobDescriptionSource ?? 'pasted') : null;
    }

    if (data.archived === false && current.archived) await this.assertCapacity(userId);

    // Status — always written in the current vocabulary, which also upgrades a
    // legacy document the first time it is saved.
    let status = current.status;
    let acceptedOffer = false;
    if (data.status !== undefined) {
      const normalized = normalizeJobStatus(data.status);
      if (!normalized) throw new BadRequestException('Unknown status');
      status = normalized.status;
      acceptedOffer = normalized.acceptedOffer;
    }
    updateData.status = status;
    if (status !== current.status) updateData.statusHistory = appendHistory(current.statusHistory, status, at);

    // Outcome — only the user reports it through this API, so the origin is
    // user_reported. Re-sending the same value keeps the original origin/time.
    let outcome: JobOutcome | null | undefined = data.outcome;
    if (outcome === undefined && acceptedOffer && current.outcome === null) outcome = 'accepted';
    if (outcome !== undefined && outcome !== current.outcome) {
      updateData.outcome = outcome;
      updateData.outcomeOrigin = outcome ? 'user_reported' : null;
      updateData.outcomeRecordedAt = outcome ? at : null;
    } else {
      updateData.outcome = current.outcome;
      updateData.outcomeOrigin = current.outcomeOrigin;
      updateData.outcomeRecordedAt = current.outcomeRecordedAt;
    }

    // Contacts — new clients send the list; old clients send the single pair.
    let contacts = current.contacts;
    if (data.contacts !== undefined) contacts = contactsFrom(data.contacts);
    else if (data.contactName !== undefined || data.contactEmail !== undefined) contacts = mergeLegacyContact(current.contacts, data);
    updateData.contacts = contacts;
    Object.assign(updateData, contactMirror(contacts));

    if (data.checklist !== undefined) updateData.checklist = checklistFrom(data.checklist);
    if (data.formAnswers !== undefined) updateData.formAnswers = answersFrom(data.formAnswers);

    // Documents — freeze only when the link actually changes. Old clients
    // re-send the same ids on every save; that must not create new versions.
    const label = JobsService.label(
      (updateData.company as string | undefined) ?? current.company,
      (updateData.position as string | undefined) ?? current.position,
    );
    if (data.linkedCVId !== undefined) {
      const cvId = text(data.linkedCVId);
      updateData.linkedCVId = cvId;
      if (!cvId) updateData.cvSnapshot = null;
      else if (cvId !== current.linkedCVId || current.cvSnapshot?.documentId !== cvId) {
        updateData.cvSnapshot = await this.freezeCv(userId, cvId, label);
      }
    }
    if (data.linkedCoverLetterId !== undefined) {
      const letterId = text(data.linkedCoverLetterId);
      updateData.linkedCoverLetterId = letterId;
      if (!letterId) updateData.coverLetterSnapshot = null;
      else if (letterId !== current.linkedCoverLetterId || current.coverLetterSnapshot?.documentId !== letterId) {
        updateData.coverLetterSnapshot = await this.freezeCoverLetter(userId, letterId);
      }
    }

    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update(updateData);
    return this.findByIdOrThrow(id, userId);
  }

  /**
   * Freeze the linked document again at its current state — for when the user
   * improved the CV or letter after linking it but before actually applying.
   */
  async refreeze(id: string, userId: string, kind: 'cv' | 'cover_letter'): Promise<JobApplication> {
    const current = await this.findByIdOrThrow(id, userId);
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (kind === 'cv') {
      if (!current.linkedCVId) throw new BadRequestException('No CV is linked to this application');
      updateData.cvSnapshot = await this.freezeCv(
        userId,
        current.linkedCVId,
        JobsService.label(current.company, current.position),
      );
    } else {
      if (!current.linkedCoverLetterId) throw new BadRequestException('No cover letter is linked to this application');
      updateData.coverLetterSnapshot = await this.freezeCoverLetter(userId, current.linkedCoverLetterId);
    }
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update(updateData);
    return this.findByIdOrThrow(id, userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.findByIdOrThrow(id, userId);
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update({
      deletedAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
