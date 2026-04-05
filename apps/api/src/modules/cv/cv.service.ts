import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import {
  CV,
  CVSection,
  CVVersion,
  CreateCVData,
  UpdateCVData,
  CVStatus,
  CVLayout,
  SectionStyle,
  BorderRadiusStyle,
  CVStyling,
  FontSize,
  Spacing,
  PLAN_CONFIGS,
} from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CVService {
  private readonly logger = new Logger(CVService.name);
  private readonly collection = 'cvs';

  constructor(
    private firebaseAdmin: FirebaseAdminService,
    private usersService: UsersService,
  ) {}

  private getTemplateStyling(templateId: string): Omit<CVStyling, 'secondaryColor'> {
    const styles: Record<string, any> = {
      // Classic   → "Modern Minimal" single-column
      classic:      { primaryColor: '#1e3a5f', fontFamily: 'Merriweather',   headingFontFamily: 'Merriweather',     fontSize: FontSize.MEDIUM, spacing: Spacing.NORMAL,  showPhoto: false, layout: 'classic',  sectionStyle: 'underline',   borderRadius: 'small'  },
      // Modern    → "Corporate Professional" sidebar
      modern:       { primaryColor: '#2563eb', fontFamily: 'Inter',          headingFontFamily: 'Inter',            fontSize: FontSize.MEDIUM, spacing: Spacing.NORMAL,  showPhoto: false, layout: 'sidebar',  sectionStyle: 'underline',   borderRadius: 'small'  },
      // Minimal   → sleek classic with minimal headings
      minimal:      { primaryColor: '#374151', fontFamily: 'Inter',          headingFontFamily: 'Inter',            fontSize: FontSize.SMALL,  spacing: Spacing.COMPACT, showPhoto: false, layout: 'classic',  sectionStyle: 'minimal',     borderRadius: 'none'   },
      // Professional → Creative/Bold top-bar, teal tones
      professional: { primaryColor: '#0f766e', fontFamily: 'Roboto',         headingFontFamily: 'Montserrat',       fontSize: FontSize.MEDIUM, spacing: Spacing.NORMAL,  showPhoto: false, layout: 'top-bar',  sectionStyle: 'left-border', borderRadius: 'small'  },
      // Creative  → Top-bar with photo, bold violet, rounded cards
      creative:     { primaryColor: '#7c3aed', fontFamily: 'Open Sans',      headingFontFamily: 'Playfair Display', fontSize: FontSize.MEDIUM, spacing: Spacing.RELAXED, showPhoto: true,  layout: 'top-bar',  sectionStyle: 'card',        borderRadius: 'large'  },
      // Executive → Compact executive dense, dark tone
      executive:    { primaryColor: '#0c0c0c', fontFamily: 'Roboto',         headingFontFamily: 'Montserrat',       fontSize: FontSize.LARGE,  spacing: Spacing.RELAXED, showPhoto: false, layout: 'compact',  sectionStyle: 'underline',   borderRadius: 'none'   },
      // Compact   → Compact layout, tight spacing
      compact:      { primaryColor: '#1d4ed8', fontFamily: 'Inter',          headingFontFamily: 'Inter',            fontSize: FontSize.SMALL,  spacing: Spacing.COMPACT, showPhoto: false, layout: 'compact',  sectionStyle: 'underline',   borderRadius: 'small'  },
      // Two-column → Sidebar layout with emerald palette and photo
      'two-column': { primaryColor: '#059669', fontFamily: 'Lora',           headingFontFamily: 'Montserrat',       fontSize: FontSize.MEDIUM, spacing: Spacing.NORMAL,  showPhoto: true,  layout: 'sidebar',  sectionStyle: 'underline',   borderRadius: 'medium' },
      // Academic  → Classic, minimal style, academic purple
      academic:     { primaryColor: '#6b21a8', fontFamily: 'Merriweather',   headingFontFamily: 'Merriweather',     fontSize: FontSize.MEDIUM, spacing: Spacing.NORMAL,  showPhoto: false, layout: 'classic',  sectionStyle: 'minimal',     borderRadius: 'none'   },
      // Bold      → Top-bar with photo, red, left-border sections
      bold:         { primaryColor: '#dc2626', fontFamily: 'Montserrat',     headingFontFamily: 'Montserrat',       fontSize: FontSize.LARGE,  spacing: Spacing.RELAXED, showPhoto: true,  layout: 'top-bar',  sectionStyle: 'left-border', borderRadius: 'medium' },
    };
    return styles[templateId] || styles['modern'];
  }

  private getSampleContent(user: any): { summary: string; experience: any[]; education: any[]; skills: any[] } {
    const firstName = user.profile.firstName || 'John';
    return {
      summary: `Results-driven professional with a strong background in delivering impactful solutions. Passionate about innovation, collaboration, and continuous improvement. Seeking opportunities to leverage expertise and contribute to organizational success.`,
      experience: [
        {
          id: uuidv4(),
          position: 'Senior Software Engineer',
          company: 'Tech Solutions Inc.',
          location: 'New York, NY',
          startDate: '2021-01',
          endDate: '',
          description: 'Led a team of 5 developers to deliver a customer-facing platform serving 50K+ users. Improved system performance by 40% through architectural optimizations. Implemented CI/CD pipelines reducing deployment time by 60%.',
        },
        {
          id: uuidv4(),
          position: 'Software Developer',
          company: 'Digital Innovations Ltd.',
          location: 'San Francisco, CA',
          startDate: '2018-06',
          endDate: '2020-12',
          description: 'Developed RESTful APIs and microservices handling 10M+ requests daily. Collaborated with cross-functional teams to deliver 3 major product launches on schedule.',
        },
      ],
      education: [
        {
          id: uuidv4(),
          institution: 'University of Technology',
          degree: 'Bachelor of Science',
          field: 'Computer Science',
          startDate: '2014-09',
          endDate: '2018-05',
          description: 'Graduated with honors. Relevant coursework: Data Structures, Algorithms, Software Engineering, Database Systems.',
        },
      ],
      skills: [
        { id: uuidv4(), name: 'JavaScript' },
        { id: uuidv4(), name: 'TypeScript' },
        { id: uuidv4(), name: 'React' },
        { id: uuidv4(), name: 'Node.js' },
        { id: uuidv4(), name: 'Python' },
        { id: uuidv4(), name: 'SQL' },
        { id: uuidv4(), name: 'Git' },
        { id: uuidv4(), name: 'Docker' },
        { id: uuidv4(), name: 'AWS' },
        { id: uuidv4(), name: 'Agile/Scrum' },
      ],
    };
  }

  private async checkTemplateAccess(templateId: string, userId: string): Promise<void> {
    if (!templateId || templateId === 'modern') return; // 'modern' is always free
    const templateDoc = await this.firebaseAdmin.firestore
      .collection('templates')
      .doc(templateId)
      .get();
    if (!templateDoc.exists) return; // if template not found, allow (don't block creation)
    const template = templateDoc.data() as { tier: string };
    if (template.tier === 'free') return;

    const user = await this.usersService.findByIdOrThrow(userId);
    const limits = PLAN_CONFIGS[user.subscription.plan].limits;
    if (limits.templates === 'free_only') {
      throw new ForbiddenException(
        `Template "${templateId}" requires a Pro or higher plan. Please upgrade.`,
      );
    }
  }

  async create(userId: string, data: CreateCVData): Promise<CV> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const limits = PLAN_CONFIGS[user.subscription.plan].limits;

    if (limits.cvs !== 'unlimited' && user.usage.cvsCreated >= limits.cvs) {
      throw new ForbiddenException('CV limit reached for your plan. Please upgrade.');
    }

    const id = uuidv4();
    const now = new Date();
    const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 8)}`;
    const templateId = data.templateId || 'modern';

    await this.checkTemplateAccess(templateId, userId);
    const styling = this.getTemplateStyling(templateId);
    const sample = this.getSampleContent(user);

    const cv: CV = {
      id,
      userId,
      title: data.title,
      slug,
      templateId,
      status: CVStatus.DRAFT,
      isPublic: false,
      publicSlug: null,
      personalInfo: {
        firstName: '',
        lastName: '',
        email: user.email,
        phone: '',
        address: '',
        city: '',
        country: '',
        postalCode: '',
        website: user.profile.website || '',
        linkedin: user.profile.linkedin || '',
        github: user.profile.github || '',
        photoURL: user.photoURL,
        headline: user.profile.headline || '',
        summary: sample.summary,
      },
      sectionOrder: [],
      styling,
      version: 1,
      lastAutoSavedAt: now,
      aiGenerated: false,
      aiProvider: null,
      viewCount: 0,
      downloadCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).set(cv);
    await this.usersService.incrementUsage(userId, 'cvsCreated');

    // Create default sections with sample content
    const sectionConfigs = [
      { type: 'experience', title: 'Experience', items: sample.experience },
      { type: 'education',  title: 'Education',  items: sample.education },
      { type: 'skills',     title: 'Skills',     items: sample.skills },
    ];

    for (let i = 0; i < sectionConfigs.length; i++) {
      const sectionId = uuidv4();
      const section: CVSection = {
        id: sectionId,
        type: sectionConfigs[i].type as any,
        title: sectionConfigs[i].title,
        isVisible: true,
        order: i,
        items: sectionConfigs[i].items,
        createdAt: now,
        updatedAt: now,
      };

      await this.firebaseAdmin.firestore
        .collection(this.collection)
        .doc(id)
        .collection('sections')
        .doc(sectionId)
        .set(section);

      cv.sectionOrder.push(sectionId);
    }

    // Update CV with section order
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update({
      sectionOrder: cv.sectionOrder,
    });

    return this.findByIdOrThrow(id, userId);
  }

  async findById(id: string): Promise<CV | null> {
    const doc = await this.firebaseAdmin.firestore.collection(this.collection).doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as CV;
  }

  async findByIdOrThrow(id: string, userId?: string): Promise<CV> {
    const cv = await this.findById(id);
    if (!cv) throw new NotFoundException('CV not found');
    if (userId && cv.userId !== userId) throw new ForbiddenException('Access denied');
    return cv;
  }

  async listByUser(userId: string, page = 1, limit = 10) {
    const query = this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('userId', '==', userId)
      .where('deletedAt', '==', null)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);

    const snapshot = await query.get();
    const items = snapshot.docs.map((doc: any) => doc.data() as CV);

    return { items, page, limit };
  }

  async update(id: string, userId: string, data: UpdateCVData): Promise<CV> {
    await this.findByIdOrThrow(id, userId);
    if (data.templateId) {
      await this.checkTemplateAccess(data.templateId, userId);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.title) updateData.title = data.title;
    if (data.templateId) updateData.templateId = data.templateId;
    if (data.status) updateData.status = data.status;
    if (data.sectionOrder) updateData.sectionOrder = data.sectionOrder;
    if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;

    if (data.personalInfo) {
      Object.entries(data.personalInfo).forEach(([key, value]) => {
        updateData[`personalInfo.${key}`] = value;
      });
    }

    if (data.styling) {
      Object.entries(data.styling).forEach(([key, value]) => {
        updateData[`styling.${key}`] = value;
      });
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

  async duplicate(id: string, userId: string): Promise<CV> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const limits = PLAN_CONFIGS[user.subscription.plan].limits;
    if (limits.cvs !== 'unlimited' && user.usage.cvsCreated >= limits.cvs) {
      throw new ForbiddenException('CV limit reached for your plan. Please upgrade.');
    }

    const original = await this.findByIdOrThrow(id, userId);
    const sections = await this.getSections(id);

    const newId = uuidv4();
    const now = new Date();
    const newCV: CV = {
      ...original,
      id: newId,
      title: `${original.title} (Copy)`,
      slug: `${original.slug}-copy-${newId.slice(0, 8)}`,
      isPublic: false,
      publicSlug: null,
      viewCount: 0,
      downloadCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.firebaseAdmin.firestore.collection(this.collection).doc(newId).set(newCV);
    await this.usersService.incrementUsage(userId, 'cvsCreated');

    for (const section of sections) {
      const newSectionId = uuidv4();
      await this.firebaseAdmin.firestore
        .collection(this.collection)
        .doc(newId)
        .collection('sections')
        .doc(newSectionId)
        .set({ ...section, id: newSectionId });
    }

    return newCV;
  }

  // Section methods
  async getSections(cvId: string): Promise<CVSection[]> {
    const snapshot = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .doc(cvId)
      .collection('sections')
      .orderBy('order')
      .get();

    return snapshot.docs.map((doc: any) => doc.data() as CVSection);
  }

  async addSection(
    cvId: string,
    data: {
      id?: string;
      type: string;
      title: string;
      order: number;
      isVisible?: boolean;
      items?: any[];
    },
  ): Promise<CVSection> {
    // Accept a client-provided ID so the client's sectionOrder stays consistent.
    // The client manages sectionOrder exclusively via PUT /cvs/:id; we don't
    // touch it here to prevent race conditions with concurrent auto-saves.
    const id = data.id || uuidv4();
    const now = new Date();
    const section: CVSection = {
      id,
      type: data.type as any,
      title: data.title,
      isVisible: data.isVisible ?? true,
      order: data.order,
      items: data.items ?? [],
      createdAt: now,
      updatedAt: now,
    };

    await this.firebaseAdmin.firestore
      .collection(this.collection)
      .doc(cvId)
      .collection('sections')
      .doc(id)
      .set(section);

    return section;
  }

  async updateSection(cvId: string, sectionId: string, data: Partial<CVSection>): Promise<CVSection> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) updateData.title = data.title;
    if (data.isVisible !== undefined) updateData.isVisible = data.isVisible;
    if (data.items !== undefined) updateData.items = data.items;
    if (data.order !== undefined) updateData.order = data.order;

    await this.firebaseAdmin.firestore
      .collection(this.collection)
      .doc(cvId)
      .collection('sections')
      .doc(sectionId)
      .update(updateData);

    const doc = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .doc(cvId)
      .collection('sections')
      .doc(sectionId)
      .get();

    return doc.data() as CVSection;
  }

  async deleteSection(cvId: string, sectionId: string): Promise<void> {
    await this.firebaseAdmin.firestore
      .collection(this.collection)
      .doc(cvId)
      .collection('sections')
      .doc(sectionId)
      .delete();

    const cv = await this.findById(cvId);
    if (cv) {
      await this.firebaseAdmin.firestore
        .collection(this.collection)
        .doc(cvId)
        .update({
          sectionOrder: cv.sectionOrder.filter((id) => id !== sectionId),
          updatedAt: new Date(),
        });
    }
  }

  async reorderSections(cvId: string, sectionOrder: string[]): Promise<void> {
    await this.firebaseAdmin.firestore.collection(this.collection).doc(cvId).update({
      sectionOrder,
      updatedAt: new Date(),
    });

    // Update individual section order values
    const batch = this.firebaseAdmin.firestore.batch();
    sectionOrder.forEach((sectionId, index) => {
      const ref = this.firebaseAdmin.firestore
        .collection(this.collection)
        .doc(cvId)
        .collection('sections')
        .doc(sectionId);
      batch.update(ref, { order: index });
    });
    await batch.commit();
  }

  // Version methods
  async createVersion(cvId: string, userId: string, description: string): Promise<CVVersion> {
    const cv = await this.findByIdOrThrow(cvId, userId);
    const sections = await this.getSections(cvId);
    const id = uuidv4();

    const version: CVVersion = {
      id,
      versionNumber: cv.version + 1,
      snapshot: { ...cv, sections },
      changeDescription: description,
      createdAt: new Date(),
      createdBy: userId,
    };

    await this.firebaseAdmin.firestore
      .collection(this.collection)
      .doc(cvId)
      .collection('versions')
      .doc(id)
      .set(version);

    await this.firebaseAdmin.firestore.collection(this.collection).doc(cvId).update({
      version: cv.version + 1,
    });

    return version;
  }

  async getVersions(cvId: string): Promise<CVVersion[]> {
    const snapshot = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .doc(cvId)
      .collection('versions')
      .orderBy('versionNumber', 'desc')
      .get();

    return snapshot.docs.map((doc: any) => doc.data() as CVVersion);
  }

  // Public sharing
  async togglePublic(cvId: string, userId: string, isPublic: boolean): Promise<CV> {
    const cv = await this.findByIdOrThrow(cvId, userId);
    const publicSlug = isPublic ? `${cv.slug}-public` : null;

    await this.firebaseAdmin.firestore.collection(this.collection).doc(cvId).update({
      isPublic,
      publicSlug,
      updatedAt: new Date(),
    });

    return this.findByIdOrThrow(cvId, userId);
  }

  async findByPublicSlug(slug: string): Promise<CV | null> {
    const snapshot = await this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('publicSlug', '==', slug)
      .where('isPublic', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as CV;
  }
}
