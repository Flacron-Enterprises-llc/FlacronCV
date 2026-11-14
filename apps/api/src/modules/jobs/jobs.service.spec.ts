import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { JobStatus } from '@flacroncv/shared-types';

/** CV / cover-letter services reduced to what freezing needs; ownership enforced like the real ones. */
function makeDocs() {
  const cvs = new Map<string, { id: string; userId: string; title: string; version: number }>();
  const letters = new Map<string, { id: string; userId: string; title: string; content: string }>();
  const own = <T extends { userId: string }>(doc: T | undefined, userId: string): T => {
    if (!doc) throw new NotFoundException('missing');
    if (doc.userId !== userId) throw new ForbiddenException('Access denied');
    return doc;
  };
  const cvService = {
    findByIdOrThrow: jest.fn(async (id: string, userId: string) => own(cvs.get(id), userId)),
    createVersion: jest.fn(async (id: string, userId: string, description: string) => {
      const cv = own(cvs.get(id), userId);
      cv.version += 1;
      return { id: `ver-${id}-${cv.version}`, versionNumber: cv.version, changeDescription: description };
    }),
  };
  const coverLetterService = {
    findByIdOrThrow: jest.fn(async (id: string, userId: string) => own(letters.get(id), userId)),
  };
  return { cvs, letters, cvService, coverLetterService };
}

function makeService(limit?: number | null) {
  const firestore = new InMemoryFirestore();
  const docs = makeDocs();
  const service = new JobsService(
    { firestore } as any,
    docs.cvService as any,
    docs.coverLetterService as any,
    limit === undefined ? undefined : async () => limit,
  );
  return { service, firestore, ...docs };
}

/** Write a document in the pre-workspace shape, exactly as old clients stored it. */
async function seedLegacy(firestore: InMemoryFirestore, data: Record<string, unknown>) {
  const doc = {
    id: 'legacy-1',
    userId: 'u1',
    company: 'Acme',
    position: 'Engineer',
    jobUrl: null,
    location: null,
    status: 'wishlist',
    appliedDate: null,
    notes: null,
    linkedCVId: null,
    linkedCoverLetterId: null,
    salaryRange: null,
    contactName: 'Jane Doe',
    contactEmail: 'jane@acme.com',
    interviewDate: null,
    followUpDate: null,
    archived: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...data,
  };
  await (firestore as any).collection('job_applications').doc(doc.id).set(doc);
  return doc;
}

describe('JobsService', () => {
  it('creates a job scoped to the user, defaulting status to saved', async () => {
    const { service } = makeService();
    const job = await service.create('u1', { company: 'Acme', position: 'Engineer' });
    expect(job.userId).toBe('u1');
    expect(job.company).toBe('Acme');
    expect(job.status).toBe(JobStatus.SAVED);
    expect(job.deletedAt).toBeNull();
    expect(job.contacts).toEqual([]);
    expect(job.statusHistory).toEqual([{ status: JobStatus.SAVED, at: expect.any(String) }]);
  });

  it('persists interviewDate and followUpDate on create', async () => {
    const { service } = makeService();
    const job = await service.create('u1', {
      company: 'Acme',
      position: 'Engineer',
      interviewDate: '2026-09-12T14:30',
      followUpDate: '2026-09-20',
    });
    expect(job.interviewDate).toBe('2026-09-12T14:30');
    expect(job.followUpDate).toBe('2026-09-20');
  });

  it("lists only the requesting user's non-deleted jobs", async () => {
    const { service } = makeService();
    await service.create('u1', { company: 'A', position: 'P1' });
    await service.create('u1', { company: 'B', position: 'P2' });
    await service.create('u2', { company: 'C', position: 'P3' });
    const list = await service.listByUser('u1');
    expect(list).toHaveLength(2);
    expect(list.every((j) => j.userId === 'u1')).toBe(true);
  });

  it('findByIdOrThrow enforces ownership (no IDOR) and 404s for missing or deleted', async () => {
    const { service } = makeService();
    const job = await service.create('u1', { company: 'A', position: 'P' });
    await expect(service.findByIdOrThrow(job.id, 'u2')).rejects.toThrow(ForbiddenException);
    await expect(service.findByIdOrThrow('ghost', 'u1')).rejects.toThrow(NotFoundException);
    await service.delete(job.id, 'u1');
    await expect(service.findByIdOrThrow(job.id, 'u1')).rejects.toThrow(NotFoundException);
  });

  it('update applies whitelisted fields and drops userId/id mass-assignment', async () => {
    const { service } = makeService();
    const job = await service.create('u1', { company: 'A', position: 'P' });
    const updated = await service.update(job.id, 'u1', {
      status: JobStatus.APPLIED,
      company: 'A2',
      userId: 'attacker',
      id: 'evil',
      outcomeOrigin: 'imported',
    } as any);
    expect(updated.status).toBe(JobStatus.APPLIED);
    expect(updated.company).toBe('A2');
    expect(updated.userId).toBe('u1');
    expect(updated.id).toBe(job.id);
    expect(updated.outcomeOrigin).toBeNull(); // a client cannot claim an import
  });

  it('update is blocked for another user', async () => {
    const { service } = makeService();
    const job = await service.create('u1', { company: 'A', position: 'P' });
    await expect(service.update(job.id, 'u2', { status: JobStatus.APPLIED })).rejects.toThrow(ForbiddenException);
  });

  it('soft-deletes (sets deletedAt and removes it from the list)', async () => {
    const { service } = makeService();
    const job = await service.create('u1', { company: 'A', position: 'P' });
    await service.delete(job.id, 'u1');
    expect(await service.listByUser('u1')).toHaveLength(0);
  });

  describe('backward compatibility', () => {
    it('reads a pre-workspace document in the new shape (wishlist → saved, contact → contacts[0])', async () => {
      const { service, firestore } = makeService();
      await seedLegacy(firestore, {});
      const [job] = await service.listByUser('u1');
      expect(job.status).toBe(JobStatus.SAVED);
      expect(job.contacts).toEqual([
        { id: 'legacy-contact', name: 'Jane Doe', role: null, email: 'jane@acme.com', phone: null, notes: null },
      ]);
      expect(job.contactName).toBe('Jane Doe');
      expect(job.checklist).toEqual([]);
      expect(job.formAnswers).toEqual([]);
      expect(job.deadline).toBeNull();
      expect(job.outcome).toBeNull();
    });

    it('reads a stored "accepted" as offered with an accepted, user-reported outcome', async () => {
      const { service, firestore } = makeService();
      await seedLegacy(firestore, { status: 'accepted' });
      const job = await service.findByIdOrThrow('legacy-1', 'u1');
      expect(job.status).toBe(JobStatus.OFFERED);
      expect(job.outcome).toBe('accepted');
      expect(job.outcomeOrigin).toBe('user_reported');
    });

    it('reads a stored "offer" as offered', async () => {
      const { service, firestore } = makeService();
      await seedLegacy(firestore, { status: 'offer' });
      expect((await service.findByIdOrThrow('legacy-1', 'u1')).status).toBe(JobStatus.OFFERED);
    });

    it('accepts legacy status values from old clients and stores the current ones', async () => {
      const { service, firestore } = makeService();
      const wish = await service.create('u1', { company: 'A', position: 'P', status: 'wishlist' });
      expect(wish.status).toBe(JobStatus.SAVED);

      const accepted = await service.create('u1', { company: 'B', position: 'P', status: 'accepted' });
      expect(accepted.status).toBe(JobStatus.OFFERED);
      expect(accepted.outcome).toBe('accepted');

      const updated = await service.update(wish.id, 'u1', { status: 'offer' });
      expect(updated.status).toBe(JobStatus.OFFERED);
      const raw = (await (firestore as any).collection('job_applications').doc(wish.id).get()).data();
      expect(raw.status).toBe('offered');
    });

    it('an old client marking an offer accepted records the outcome once', async () => {
      const { service } = makeService();
      const job = await service.create('u1', { company: 'A', position: 'P', status: 'offer' });
      const accepted = await service.update(job.id, 'u1', { status: 'accepted' });
      expect(accepted.outcome).toBe('accepted');
      const recordedAt = accepted.outcomeRecordedAt;
      const again = await service.update(job.id, 'u1', { status: 'accepted' });
      expect(again.outcomeRecordedAt).toBe(recordedAt);
    });

    it('saving a legacy document upgrades it in storage and keeps the contact mirror', async () => {
      const { service, firestore } = makeService();
      await seedLegacy(firestore, {});
      await service.update('legacy-1', 'u1', { notes: 'hello' });
      const raw = (await (firestore as any).collection('job_applications').doc('legacy-1').get()).data();
      expect(raw.status).toBe('saved');
      expect(raw.contacts).toHaveLength(1);
      expect(raw.contactName).toBe('Jane Doe');
      expect(raw.contactEmail).toBe('jane@acme.com');
    });

    it('an old client editing the single contact updates contacts[0] and keeps the others', async () => {
      const { service } = makeService();
      const job = await service.create('u1', {
        company: 'A',
        position: 'P',
        contacts: [
          { name: 'First', email: 'first@a.com' },
          { name: 'Second', role: 'Hiring manager' },
        ],
      });
      const updated = await service.update(job.id, 'u1', { contactName: 'Renamed', contactEmail: null });
      expect(updated.contacts.map((c) => c.name)).toEqual(['Renamed', 'Second']);
      expect(updated.contacts[0].email).toBeNull();
      expect(updated.contacts[0].id).toBe(job.contacts[0].id);
    });

    it('creating with the old single-contact fields makes one contact', async () => {
      const { service } = makeService();
      const job = await service.create('u1', { company: 'A', position: 'P', contactName: 'Jo', contactEmail: 'jo@a.com' });
      expect(job.contacts).toEqual([
        { id: 'legacy-contact', name: 'Jo', role: null, email: 'jo@a.com', phone: null, notes: null },
      ]);
    });
  });

  describe('workspace fields', () => {
    it('stores contacts, checklist and form answers, dropping empty rows and assigning ids', async () => {
      const { service } = makeService();
      const job = await service.create('u1', {
        company: 'A',
        position: 'P',
        contacts: [{ name: '  ', email: '' }, { name: 'Sam', phone: '+1 555' }],
        checklist: [{ label: 'Portfolio', kind: 'document' }, { label: ' ' }, { id: 'x', label: 'Ask referral', done: true }],
        formAnswers: [{ question: 'Why us?', answer: ' Because ' }, { question: '', answer: 'orphan' }],
      });
      expect(job.contacts).toHaveLength(1);
      expect(job.contacts[0]).toMatchObject({ name: 'Sam', phone: '+1 555', email: null });
      expect(job.contacts[0].id).toEqual(expect.any(String));
      expect(job.checklist).toEqual([
        { id: expect.any(String), label: 'Portfolio', kind: 'document', done: false },
        { id: 'x', label: 'Ask referral', kind: 'task', done: true },
      ]);
      expect(job.formAnswers).toEqual([{ id: expect.any(String), question: 'Why us?', answer: 'Because' }]);
    });

    it('repeated client ids are re-assigned so every row stays addressable', async () => {
      const { service } = makeService();
      const job = await service.create('u1', {
        company: 'A',
        position: 'P',
        checklist: [{ id: 'same', label: 'One' }, { id: 'same', label: 'Two' }],
      });
      expect(new Set(job.checklist.map((i) => i.id)).size).toBe(2);
    });

    it('records the job description and its source, and the deadline', async () => {
      const { service } = makeService();
      const pasted = await service.create('u1', { company: 'A', position: 'P', jobDescription: 'Build things', deadline: '2026-12-01' });
      expect(pasted.jobDescriptionSource).toBe('pasted');
      expect(pasted.deadline).toBe('2026-12-01');
      const fromOpp = await service.create('u1', {
        company: 'B',
        position: 'P',
        jobDescription: 'From the listing',
        jobDescriptionSource: 'opportunity',
        opportunityId: 'opp-1',
      });
      expect(fromOpp.jobDescriptionSource).toBe('opportunity');
      expect(fromOpp.opportunityId).toBe('opp-1');
      const cleared = await service.update(pasted.id, 'u1', { jobDescription: '' });
      expect(cleared.jobDescription).toBeNull();
      expect(cleared.jobDescriptionSource).toBeNull();
    });

    it('records the status history and a user-reported outcome', async () => {
      const { service } = makeService();
      const job = await service.create('u1', { company: 'A', position: 'P' });
      await service.update(job.id, 'u1', { status: JobStatus.APPLIED });
      const done = await service.update(job.id, 'u1', { status: JobStatus.REJECTED, outcome: 'rejected' });
      expect(done.statusHistory.map((h) => h.status)).toEqual([JobStatus.SAVED, JobStatus.APPLIED, JobStatus.REJECTED]);
      expect(done.outcome).toBe('rejected');
      expect(done.outcomeOrigin).toBe('user_reported');
      const cleared = await service.update(job.id, 'u1', { outcome: null });
      expect(cleared.outcome).toBeNull();
      expect(cleared.outcomeOrigin).toBeNull();
    });

    it('an unchanged status does not add a history entry', async () => {
      const { service } = makeService();
      const job = await service.create('u1', { company: 'A', position: 'P' });
      const same = await service.update(job.id, 'u1', { status: JobStatus.SAVED, notes: 'x' });
      expect(same.statusHistory).toHaveLength(1);
    });
  });

  describe('frozen documents', () => {
    it('linking a CV freezes a CV version; later saves with the same id do not create new versions', async () => {
      const { service, cvs, cvService } = makeService();
      cvs.set('cv1', { id: 'cv1', userId: 'u1', title: 'Resume', version: 3 });
      const job = await service.create('u1', { company: 'Acme', position: 'Eng', linkedCVId: 'cv1' });
      expect(job.cvSnapshot).toMatchObject({ documentId: 'cv1', title: 'Resume', versionId: 'ver-cv1-4', versionNumber: 4 });
      expect(cvService.createVersion).toHaveBeenCalledWith('cv1', 'u1', 'Used for application: Eng at Acme');

      // Old clients re-send linkedCVId on every save.
      const again = await service.update(job.id, 'u1', { linkedCVId: 'cv1', notes: 'edited' });
      expect(again.cvSnapshot?.versionId).toBe('ver-cv1-4');
      expect(cvService.createVersion).toHaveBeenCalledTimes(1);

      const refrozen = await service.refreeze(job.id, 'u1', 'cv');
      expect(refrozen.cvSnapshot?.versionId).toBe('ver-cv1-5');

      const unlinked = await service.update(job.id, 'u1', { linkedCVId: null });
      expect(unlinked.cvSnapshot).toBeNull();
    });

    it('linking a cover letter copies its content, so later edits do not change it', async () => {
      const { service, letters } = makeService();
      letters.set('cl1', { id: 'cl1', userId: 'u1', title: 'Letter', content: 'Dear team' });
      const job = await service.create('u1', { company: 'A', position: 'P', linkedCoverLetterId: 'cl1' });
      letters.get('cl1')!.content = 'Edited later';
      const read = await service.findByIdOrThrow(job.id, 'u1');
      expect(read.coverLetterSnapshot).toMatchObject({ documentId: 'cl1', title: 'Letter', content: 'Dear team', truncated: false });
    });

    it("refuses to link another user's CV", async () => {
      const { service, cvs } = makeService();
      cvs.set('cv2', { id: 'cv2', userId: 'u2', title: 'Theirs', version: 1 });
      await expect(service.create('u1', { company: 'A', position: 'P', linkedCVId: 'cv2' })).rejects.toThrow(ForbiddenException);
      expect(await service.listByUser('u1')).toHaveLength(0);
    });

    it('refreeze without a linked document is a bad request', async () => {
      const { service } = makeService();
      const job = await service.create('u1', { company: 'A', position: 'P' });
      await expect(service.refreeze(job.id, 'u1', 'cover_letter')).rejects.toThrow(BadRequestException);
    });
  });

  describe('capacity check point', () => {
    it('is unlimited when no plan limit is wired', async () => {
      const { service } = makeService();
      await service.create('u1', { company: 'A', position: 'P' });
      expect(await service.capacity('u1')).toEqual({ used: 1, limit: null });
    });

    it('checkCapacity throws JOB_CAPACITY_REACHED at the limit', async () => {
      const { service } = makeService();
      await service.create('u1', { company: 'A', position: 'P' });
      await expect(service.checkCapacity('u1', 2)).resolves.toEqual({ used: 1, limit: 2 });
      await service.create('u1', { company: 'B', position: 'P' });
      await expect(service.checkCapacity('u1', 2)).rejects.toMatchObject({
        response: { code: 'JOB_CAPACITY_REACHED', used: 2, limit: 2 },
      });
    });

    it('a wired limit blocks create; archiving frees a place and restoring is checked', async () => {
      const { service } = makeService(1);
      const first = await service.create('u1', { company: 'A', position: 'P' });
      await expect(service.create('u1', { company: 'B', position: 'P' })).rejects.toThrow(ForbiddenException);
      await service.update(first.id, 'u1', { archived: true });
      const second = await service.create('u1', { company: 'B', position: 'P' });
      expect(second.id).toBeTruthy();
      await expect(service.update(first.id, 'u1', { archived: false })).rejects.toThrow(ForbiddenException);
    });
  });
});
