import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { AIService } from '../ai/ai.service';
import { CVService } from '../cv/cv.service';
import { AbuseService } from '../abuse/abuse.service';
import {
  CoverLetter,
  CreateCoverLetterData,
  UpdateCoverLetterData,
  GenerateCoverLetterData,
  CoverLetterStatus,
  CVSectionType,
  PLAN_CONFIGS,
  resolveEffectivePlan,
  canUseCoverLetterTemplate,
} from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';
import { toLetterHtml } from './letter-html';

@Injectable()
export class CoverLetterService {
  private readonly logger = new Logger(CoverLetterService.name);
  private readonly collection = 'cover_letters';

  constructor(
    private firebaseAdmin: FirebaseAdminService,
    private usersService: UsersService,
    private aiService: AIService,
    private cvService: CVService,
    private abuse: AbuseService,
  ) {}

  async create(userId: string, data: CreateCoverLetterData): Promise<CoverLetter> {
    await this.abuse.assertNewConsumption(userId, 'create');
    const user = await this.usersService.findByIdOrThrow(userId);
    const limits = PLAN_CONFIGS[resolveEffectivePlan(user.subscription)].limits;

    if (limits.coverLetters !== 'unlimited' && user.usage.coverLettersCreated >= limits.coverLetters) {
      throw new ForbiddenException('Cover letter limit reached. Please upgrade.');
    }

    // Cover-letter templates are tier-gated too (minimalist/creative = PRO,
    // corporate/executive = ENTERPRISE). Enforce server-side, not just in the UI.
    if (
      data.templateId &&
      !canUseCoverLetterTemplate(data.templateId, resolveEffectivePlan(user.subscription))
    ) {
      throw new ForbiddenException(
        `Template "${data.templateId}" requires a higher plan. Please upgrade.`,
      );
    }

    const id = uuidv4();
    const now = new Date();

    const coverLetter: CoverLetter = {
      id,
      userId,
      title: data.title,
      recipientName: data.recipientName || '',
      recipientTitle: '',
      companyName: data.companyName || '',
      companyAddress: '',
      jobTitle: data.jobTitle || '',
      jobDescription: data.jobDescription || '',
      content: '',
      // 'modern' matches a real picker entry so the editor highlights it;
      // 'standard' was an alias not present in the template list.
      templateId: data.templateId || 'modern',
      styling: { fontFamily: 'Inter', fontSize: '16px', primaryColor: '#2563eb' },
      aiGenerated: false,
      aiProvider: null,
      linkedCVId: data.linkedCVId || null,
      status: CoverLetterStatus.DRAFT,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).set(coverLetter);
    await this.usersService.incrementUsage(userId, 'coverLettersCreated');

    // If generateWithAI flag is set, generate content immediately
    if (data.generateWithAI && data.jobTitle && data.companyName) {
      const generateData: GenerateCoverLetterData = {
        jobTitle: data.jobTitle,
        jobDescription: data.jobDescription || '',
        companyName: data.companyName,
        tone: data.tone || 'professional',
        linkedCVId: data.linkedCVId,
        // Forward the caller's language so AI-on-create matches the UI locale.
        language: data.language,
      };

      try {
        return await this.generateWithAI(id, userId, generateData);
      } catch (error) {
        // "Create + generate" is one user action, so it must be atomic from the
        // user's point of view. Previously a failed/timed-out generation left the
        // empty document behind AND kept the consumed cover-letter quota, so the
        // list filled up with blank entries and every retry burned another slot.
        // Roll both back, then rethrow so the caller still sees the real error.
        // (The AI *credit* is refunded inside AIService.generate's finally block.)
        //
        // BUT only when the generation itself failed. If the model succeeded and
        // the failure came afterwards (the content write or the re-read), the
        // letter exists, the user's AI credit has genuinely been spent, and
        // deleting the document would destroy paid-for work that is sitting
        // right there. Keep it and return it instead.
        const salvaged = await this.findGeneratedOrNull(id);
        if (salvaged) {
          this.logger.error(
            `Cover letter ${id} generated but the create flow failed afterwards; ` +
              `keeping the generated content.`,
          );
          return salvaged;
        }
        await this.rollbackFailedCreate(id, userId);
        throw error;
      }
    }

    return coverLetter;
  }

  /**
   * Return the cover letter only if it exists AND already carries generated
   * content — i.e. the model call succeeded and the credit was really spent.
   * Never throws; a lookup failure just means "nothing to salvage".
   */
  private async findGeneratedOrNull(id: string): Promise<CoverLetter | null> {
    try {
      const doc = await this.firebaseAdmin.firestore.collection(this.collection).doc(id).get();
      if (!doc.exists) return null;
      const cl = doc.data() as CoverLetter;
      return cl.content?.trim() ? cl : null;
    } catch {
      return null;
    }
  }

  /**
   * Undo the document + quota side effects of a create whose AI generation
   * failed. Best-effort and never throws: the caller is already unwinding with
   * the original error, which is the one worth surfacing.
   */
  private async rollbackFailedCreate(id: string, userId: string): Promise<void> {
    try {
      await this.firebaseAdmin.firestore.collection(this.collection).doc(id).delete();
    } catch (err) {
      this.logger.error(
        `Failed to roll back cover letter ${id} after a failed AI generation: ${(err as Error).message}`,
      );
    }
    try {
      await this.usersService.incrementUsage(userId, 'coverLettersCreated', -1);
    } catch (err) {
      this.logger.error(
        `Failed to refund cover-letter quota for ${userId} after a failed AI generation: ${(err as Error).message}`,
      );
    }
  }

  /** See the note on CVService.findByIdOrThrow — same two defects, same fix. */
  async findByIdOrThrow(id: string, userId?: string): Promise<CoverLetter> {
    const doc = await this.firebaseAdmin.firestore.collection(this.collection).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Cover letter not found');
    const cl = doc.data() as CoverLetter;
    if (cl.deletedAt) throw new NotFoundException('Cover letter not found');
    if (userId && cl.userId !== userId) throw new ForbiddenException('Access denied');
    return cl;
  }

  /** See the note on CVService.listByUser — same clamping and hasMore probe. */
  async listByUser(userId: string, page = 1, limit = 10) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 10, 1), 100);
    const safePage = Math.max(Math.trunc(page) || 1, 1);

    const snapshot = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('userId', '==', userId)
      .where('deletedAt', '==', null)
      .orderBy('updatedAt', 'desc')
      .limit(safeLimit + 1)
      .offset((safePage - 1) * safeLimit)
      .get();

    const rows = snapshot.docs.map((doc: any) => doc.data() as CoverLetter);
    const hasMore = rows.length > safeLimit;

    return { items: rows.slice(0, safeLimit), page: safePage, limit: safeLimit, hasMore };
  }

  async update(id: string, userId: string, data: UpdateCoverLetterData): Promise<CoverLetter> {
    const current = await this.findByIdOrThrow(id, userId);

    // Block newly selecting a template above the user's plan. Re-sending the
    // stored templateId (autosave) is allowed → no data loss on downgrade; the
    // preview/export falls back gracefully (effectiveCoverLetterTemplate).
    if (data.templateId !== undefined && data.templateId !== current.templateId) {
      const user = await this.usersService.findByIdOrThrow(userId);
      if (!canUseCoverLetterTemplate(data.templateId, resolveEffectivePlan(user.subscription))) {
        throw new ForbiddenException(
          `Template "${data.templateId}" requires a higher plan. Please upgrade.`,
        );
      }
    }

    // Whitelist updatable fields (mirrors JobsService.UPDATABLE_FIELDS) so a raw
    // body cannot mass-assign immutable/ownership fields (userId, id, deletedAt,
    // createdAt, aiGenerated…). The DTO + pipe strip unknown keys first; this
    // list is defence in depth if a new field is added to the DTO by mistake.
    const UPDATABLE_FIELDS: readonly (keyof UpdateCoverLetterData)[] = [
      'title',
      'recipientName',
      'recipientTitle',
      'companyName',
      'companyAddress',
      'jobTitle',
      'jobDescription',
      'content',
      'templateId',
      'status',
    ];
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of UPDATABLE_FIELDS) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.styling) {
      Object.entries(data.styling).forEach(([key, value]) => {
        updateData[`styling.${key}`] = value;
      });
    }
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update(updateData);
    return this.findByIdOrThrow(id, userId);
  }

  async duplicate(id: string, userId: string): Promise<CoverLetter> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const limits = PLAN_CONFIGS[resolveEffectivePlan(user.subscription)].limits;
    if (limits.coverLetters !== 'unlimited' && user.usage.coverLettersCreated >= limits.coverLetters) {
      throw new ForbiddenException('Cover letter limit reached. Please upgrade.');
    }

    const original = await this.findByIdOrThrow(id, userId);
    const newId = uuidv4();
    const now = new Date();

    const newCL: CoverLetter = {
      ...original,
      id: newId,
      title: `${original.title} (Copy)`,
      status: CoverLetterStatus.DRAFT,
      aiGenerated: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.firebaseAdmin.firestore.collection(this.collection).doc(newId).set(newCL);
    await this.usersService.incrementUsage(userId, 'coverLettersCreated');

    return newCL;
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.findByIdOrThrow(id, userId);
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update({
      deletedAt: new Date(),
      updatedAt: new Date(),
    });
    // Do not decrement `coverLettersCreated`. Limits count creations, not
    // documents stored. A Free user who creates their one letter and deletes it
    // cannot create another — client-instructed, 2026-08-19. Failed *generation*
    // still refunds via rollbackFailedCreate; that is not a user delete.
  }

  async generateWithAI(
    id: string,
    userId: string,
    data: GenerateCoverLetterData,
  ): Promise<CoverLetter> {
    await this.abuse.assertNewConsumption(userId, 'ai');
    const cl = await this.findByIdOrThrow(id, userId);

    // Fall back to stored cover letter values when not provided in request
    const jobTitle = data.jobTitle || cl.jobTitle;
    const jobDescription = data.jobDescription || cl.jobDescription;
    const companyName = data.companyName || cl.companyName;
    const tone = data.tone || 'professional';

    let candidateProfile = '';
    if (data.linkedCVId) {
      try {
        // Fetch full CV data
        const cv = await this.cvService.findByIdOrThrow(data.linkedCVId, userId);
        const sections = await this.cvService.getSections(data.linkedCVId);

        // Build comprehensive candidate profile
        const profileParts: string[] = [];

        // Personal info
        if (cv.personalInfo?.headline) {
          profileParts.push(`Professional Title: ${cv.personalInfo.headline}`);
        }
        if (cv.personalInfo?.summary) {
          profileParts.push(`Summary: ${cv.personalInfo.summary}`);
        }

        // Work experience (top 3 entries)
        const workSection = sections.find(s => s.type === CVSectionType.EXPERIENCE && s.isVisible);
        if (workSection && workSection.items.length > 0) {
          const topExperiences = workSection.items.slice(0, 3);
          const experienceText = topExperiences.map((item: any) => {
            const parts = [`${item.position} at ${item.company}`];
            if (item.startDate && item.endDate) {
              parts.push(`(${item.startDate} - ${item.endDate})`);
            }
            if (item.description) {
              parts.push(`: ${item.description}`);
            }
            return parts.join(' ');
          }).join('; ');
          profileParts.push(`Work Experience: ${experienceText}`);
        }

        // Education (top 2 entries)
        const educationSection = sections.find(s => s.type === CVSectionType.EDUCATION && s.isVisible);
        if (educationSection && educationSection.items.length > 0) {
          const topEducation = educationSection.items.slice(0, 2);
          const educationText = topEducation.map((item: any) =>
            `${item.degree} in ${item.field} from ${item.institution}`
          ).join('; ');
          profileParts.push(`Education: ${educationText}`);
        }

        // Skills
        const skillsSection = sections.find(s => s.type === CVSectionType.SKILLS && s.isVisible);
        if (skillsSection && skillsSection.items.length > 0) {
          const skillsList = skillsSection.items.map((item: any) => item.name).join(', ');
          profileParts.push(`Key Skills: ${skillsList}`);
        }

        // Projects (top 2 if available)
        const projectsSection = sections.find(s => s.type === CVSectionType.PROJECTS && s.isVisible);
        if (projectsSection && projectsSection.items.length > 0) {
          const topProjects = projectsSection.items.slice(0, 2);
          const projectsText = topProjects.map((item: any) => {
            const parts = [item.name];
            if (item.description) {
              parts.push(`: ${item.description}`);
            }
            return parts.join('');
          }).join('; ');
          profileParts.push(`Notable Projects: ${projectsText}`);
        }

        candidateProfile = profileParts.join('\n\n');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Could not fetch full CV data for ${data.linkedCVId}: ${errorMessage}`);
        // Fallback to basic info
        candidateProfile = 'No CV data available';
      }
    }

    const result = await this.aiService.generateCoverLetter(
      jobTitle,
      jobDescription,
      companyName,
      candidateProfile,
      tone,
      userId,
      data.language,
    );

    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update({
      // The model returns prose with blank lines between paragraphs, and the
      // templates render `content` as HTML — where newlines mean nothing. Stored
      // raw, a well-written four-paragraph letter reached the reader as one
      // solid block. Normalise to real paragraphs at the boundary.
      content: toLetterHtml(result.content),
      jobTitle,
      jobDescription,
      companyName,
      aiGenerated: true,
      aiProvider: result.provider,
      updatedAt: new Date(),
    });

    return this.findByIdOrThrow(id, userId);
  }
}
