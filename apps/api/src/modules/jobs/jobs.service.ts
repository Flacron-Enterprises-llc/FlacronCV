import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { JobApplication, CreateJobData, UpdateJobData, JobStatus } from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class JobsService {
  private readonly collection = 'job_applications';

  constructor(private firebaseAdmin: FirebaseAdminService) {}

  async create(userId: string, data: CreateJobData): Promise<JobApplication> {
    const id = uuidv4();
    const now = new Date();
    const job: JobApplication = {
      id,
      userId,
      company: data.company,
      position: data.position,
      jobUrl: data.jobUrl || null,
      location: data.location || null,
      status: data.status || JobStatus.WISHLIST,
      appliedDate: data.appliedDate || null,
      notes: data.notes || null,
      linkedCVId: data.linkedCVId || null,
      linkedCoverLetterId: data.linkedCoverLetterId || null,
      salaryRange: data.salaryRange || null,
      contactName: data.contactName || null,
      contactEmail: data.contactEmail || null,
      interviewDate: data.interviewDate || null,
      followUpDate: data.followUpDate || null,
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
    return snapshot.docs.map((d: any) => d.data() as JobApplication);
  }

  async findByIdOrThrow(id: string, userId: string): Promise<JobApplication> {
    const doc = await this.firebaseAdmin.firestore.collection(this.collection).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Job application not found');
    const job = doc.data() as JobApplication;
    if (job.userId !== userId) throw new ForbiddenException('Access denied');
    return job;
  }

  // Fields a user may update — never userId/id/createdAt (no mass-assignment).
  private static readonly UPDATABLE_FIELDS: readonly (keyof UpdateJobData)[] = [
    'company',
    'position',
    'jobUrl',
    'location',
    'status',
    'appliedDate',
    'notes',
    'linkedCVId',
    'linkedCoverLetterId',
    'salaryRange',
    'contactName',
    'contactEmail',
    'interviewDate',
    'followUpDate',
    'archived',
  ];

  async update(id: string, userId: string, data: UpdateJobData): Promise<JobApplication> {
    await this.findByIdOrThrow(id, userId);
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of JobsService.UPDATABLE_FIELDS) {
      if (data[key] !== undefined) updateData[key] = data[key];
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
