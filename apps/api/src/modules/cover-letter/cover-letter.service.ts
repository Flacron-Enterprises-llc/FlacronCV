import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { AIService } from '../ai/ai.service';
import { CVService } from '../cv/cv.service';
import {
  CoverLetter,
  CreateCoverLetterData,
  UpdateCoverLetterData,
  GenerateCoverLetterData,
  CoverLetterStatus,
  CVSectionType,
  PLAN_CONFIGS,
} from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CoverLetterService {
  private readonly logger = new Logger(CoverLetterService.name);
  private readonly collection = 'cover_letters';

  constructor(
    private firebaseAdmin: FirebaseAdminService,
    private usersService: UsersService,
    private aiService: AIService,
    private cvService: CVService,
  ) {}

  async create(userId: string, data: CreateCoverLetterData): Promise<CoverLetter> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const limits = PLAN_CONFIGS[user.subscription.plan].limits;

    if (limits.coverLetters !== 'unlimited' && user.usage.coverLettersCreated >= limits.coverLetters) {
      throw new ForbiddenException('Cover letter limit reached. Please upgrade.');
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
      templateId: data.templateId || 'standard',
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
      };

      return this.generateWithAI(id, userId, generateData);
    }

    return coverLetter;
  }

  async findByIdOrThrow(id: string, userId?: string): Promise<CoverLetter> {
    const doc = await this.firebaseAdmin.firestore.collection(this.collection).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Cover letter not found');
    const cl = doc.data() as CoverLetter;
    if (userId && cl.userId !== userId) throw new ForbiddenException('Access denied');
    return cl;
  }

  async listByUser(userId: string, page = 1, limit = 10) {
    const snapshot = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('userId', '==', userId)
      .where('deletedAt', '==', null)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .get();

    return { items: snapshot.docs.map((doc: any) => doc.data() as CoverLetter), page, limit };
  }

  async update(id: string, userId: string, data: UpdateCoverLetterData): Promise<CoverLetter> {
    await this.findByIdOrThrow(id, userId);
    const updateData: Record<string, unknown> = { updatedAt: new Date(), ...data };
    if (data.styling) {
      delete updateData.styling;
      Object.entries(data.styling).forEach(([key, value]) => {
        updateData[`styling.${key}`] = value;
      });
    }
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update(updateData);
    return this.findByIdOrThrow(id, userId);
  }

  async duplicate(id: string, userId: string): Promise<CoverLetter> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const limits = PLAN_CONFIGS[user.subscription.plan].limits;
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
  }

  async generateWithAI(
    id: string,
    userId: string,
    data: GenerateCoverLetterData,
  ): Promise<CoverLetter> {
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
      content: result.content,
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
