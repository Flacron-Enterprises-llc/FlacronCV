import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { AIService } from '../ai/ai.service';
import {
  CV,
  CVSection,
  CVVersion,
  CreateCVData,
  UpdateCVData,
  CVStatus,
  CVStyling,
  FontSize,
  Spacing,
  PLAN_CONFIGS,
  SubscriptionPlan,
  resolveEffectivePlan,
  planMeetsTier,
  canUseCvLayout,
  CV_TEMPLATE_TIER,
} from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CVService {
  private readonly logger = new Logger(CVService.name);
  private readonly collection = 'cvs';

  constructor(
    private firebaseAdmin: FirebaseAdminService,
    private usersService: UsersService,
    private aiService: AIService,
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

  private getSampleContent(_user: any): { summary: string; experience: any[]; education: any[]; skills: any[] } {
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

    // Prefer the authoritative built-in tier map so gating is enforced even when
    // the Firestore catalog hasn't been seeded (closes the previous fail-open).
    // Unknown ids (e.g. an admin-created custom template) fall back to the catalog
    // doc; a truly-unknown id with no doc is allowed.
    let requiredTier = CV_TEMPLATE_TIER[templateId];
    if (requiredTier === undefined) {
      const templateDoc = await this.firebaseAdmin.firestore
        .collection('templates')
        .doc(templateId)
        .get();
      if (!templateDoc.exists) return;
      requiredTier =
        ((templateDoc.data() as { tier?: string }).tier as SubscriptionPlan) ||
        SubscriptionPlan.FREE;
    }
    if (requiredTier === SubscriptionPlan.FREE) return;

    // Tier-ORDER check (free < pro < enterprise): a PRO user must NOT be able to
    // use an ENTERPRISE template. (The previous binary `free_only` check let any
    // paid plan use every non-free template.)
    const user = await this.usersService.findByIdOrThrow(userId);
    const plan = resolveEffectivePlan(user.subscription);
    if (!planMeetsTier(plan, requiredTier)) {
      throw new ForbiddenException(
        `Template "${templateId}" requires a ${requiredTier} plan. Please upgrade.`,
      );
    }
  }

  async create(userId: string, data: CreateCVData): Promise<CV> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const limits = PLAN_CONFIGS[resolveEffectivePlan(user.subscription)].limits;

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

  // ─── Import from an existing resume (AI-parsed) ─────────────────────────────

  private asStr(v: unknown): string {
    return typeof v === 'string' ? v : '';
  }

  /**
   * Parse resume text into a normalized structure via the AI provider. AI-call
   * failures (out of credits, provider down) propagate; only unparseable model
   * output is swallowed — in that case the raw text is kept as the summary so the
   * user never loses their paste.
   */
  private async parseResumeSafe(resumeText: string, userId: string) {
    const res = await this.aiService.parseResume(resumeText, userId);
    try {
      const cleaned = res.content.replace(/```json/gi, '').replace(/```/g, '').trim();
      // Slice to the outermost {...} so a model preamble/trailing note doesn't
      // break JSON.parse (the paid credit is already spent by this point).
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      const json = first !== -1 && last > first ? cleaned.slice(first, last + 1) : cleaned;
      const obj = JSON.parse(json);
      return {
        firstName: this.asStr(obj.firstName),
        lastName: this.asStr(obj.lastName),
        headline: this.asStr(obj.headline),
        email: this.asStr(obj.email),
        phone: this.asStr(obj.phone),
        city: this.asStr(obj.city),
        country: this.asStr(obj.country),
        summary: this.asStr(obj.summary),
        experience: (Array.isArray(obj.experience) ? obj.experience : []).slice(0, 20) as Record<string, unknown>[],
        education: (Array.isArray(obj.education) ? obj.education : []).slice(0, 20) as Record<string, unknown>[],
        skills: (Array.isArray(obj.skills) ? obj.skills : [])
          .map((s: unknown) => this.asStr(s))
          .filter(Boolean)
          .slice(0, 50) as string[],
      };
    } catch {
      // Unparseable model output → keep the raw text as the summary (nothing lost).
      return {
        firstName: '', lastName: '', headline: '', email: '', phone: '', city: '', country: '',
        summary: resumeText.slice(0, 2000),
        experience: [] as Record<string, unknown>[],
        education: [] as Record<string, unknown>[],
        skills: [] as string[],
      };
    }
  }

  async importFromResume(userId: string, data: { title?: string; resumeText: string }): Promise<CV> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const limits = PLAN_CONFIGS[resolveEffectivePlan(user.subscription)].limits;
    if (limits.cvs !== 'unlimited' && user.usage.cvsCreated >= limits.cvs) {
      throw new ForbiddenException('CV limit reached for your plan. Please upgrade.');
    }

    // Parse first — if the AI call itself fails (credits/provider), no CV is created.
    const parsed = await this.parseResumeSafe(data.resumeText, userId);

    const id = uuidv4();
    const now = new Date();
    const fullName = [parsed.firstName, parsed.lastName].filter(Boolean).join(' ').trim();
    const title = (data.title && data.title.trim()) || (fullName ? `${fullName} — CV` : 'Imported CV');
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 8)}`;
    const templateId = 'modern';
    const styling = this.getTemplateStyling(templateId);

    const cv: CV = {
      id,
      userId,
      title,
      slug,
      templateId,
      status: CVStatus.DRAFT,
      isPublic: false,
      publicSlug: null,
      personalInfo: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email || user.email,
        phone: parsed.phone,
        address: '',
        city: parsed.city,
        country: parsed.country,
        postalCode: '',
        website: user.profile.website || '',
        linkedin: user.profile.linkedin || '',
        github: user.profile.github || '',
        photoURL: user.photoURL,
        headline: parsed.headline,
        summary: parsed.summary,
      },
      sectionOrder: [],
      styling,
      version: 1,
      lastAutoSavedAt: now,
      aiGenerated: true,
      aiProvider: null,
      viewCount: 0,
      downloadCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).set(cv);
    await this.usersService.incrementUsage(userId, 'cvsCreated');

    const sectionConfigs = [
      {
        type: 'experience',
        title: 'Experience',
        items: parsed.experience.map((e) => ({
          id: uuidv4(),
          position: this.asStr(e.position),
          company: this.asStr(e.company),
          location: this.asStr(e.location),
          startDate: this.asStr(e.startDate),
          endDate: this.asStr(e.endDate),
          description: this.asStr(e.description),
        })),
      },
      {
        type: 'education',
        title: 'Education',
        items: parsed.education.map((e) => ({
          id: uuidv4(),
          institution: this.asStr(e.institution),
          degree: this.asStr(e.degree),
          field: this.asStr(e.field),
          startDate: this.asStr(e.startDate),
          endDate: this.asStr(e.endDate),
          description: this.asStr(e.description),
        })),
      },
      {
        type: 'skills',
        title: 'Skills',
        items: parsed.skills.map((name) => ({ id: uuidv4(), name })),
      },
    ];

    for (let i = 0; i < sectionConfigs.length; i++) {
      const sectionId = uuidv4();
      const section: CVSection = {
        id: sectionId,
        type: sectionConfigs[i].type as any,
        title: sectionConfigs[i].title,
        isVisible: true,
        order: i,
        items: sectionConfigs[i].items as any,
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

  /**
   * Fetch a CV the caller is allowed to touch.
   *
   * A soft-deleted CV is gone as far as every caller is concerned. It used to
   * stay fully readable, editable, exportable and duplicable by id — the list
   * query filtered `deletedAt` but this did not, so anyone holding the id (their
   * own browser history, a stale tab) could keep working on a document they had
   * deleted. It also made DELETE non-idempotent: calling it twice ran the
   * quota refund twice, which would have let a user mint unlimited allowance.
   */
  async findByIdOrThrow(id: string, userId?: string): Promise<CV> {
    const cv = await this.findById(id);
    if (!cv) throw new NotFoundException('CV not found');
    if (cv.deletedAt) throw new NotFoundException('CV not found');
    if (userId && cv.userId !== userId) throw new ForbiddenException('Access denied');
    return cv;
  }

  async listByUser(userId: string, page = 1, limit = 10) {
    // Clamp both. `limit` came straight from the query string, so an unbounded
    // value was a free full-collection scan; `page` below 1 produced a negative
    // offset. The ceiling is generous enough that no real account is truncated.
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 10, 1), 100);
    const safePage = Math.max(Math.trunc(page) || 1, 1);

    const query = this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('userId', '==', userId)
      .where('deletedAt', '==', null)
      .orderBy('updatedAt', 'desc')
      // Fetch one extra row purely to answer "is there another page?" without a
      // second count query. It is never returned to the caller.
      .limit(safeLimit + 1)
      .offset((safePage - 1) * safeLimit);

    const snapshot = await query.get();
    const rows = snapshot.docs.map((doc: any) => doc.data() as CV);
    const hasMore = rows.length > safeLimit;

    return { items: rows.slice(0, safeLimit), page: safePage, limit: safeLimit, hasMore };
  }

  async update(id: string, userId: string, data: UpdateCVData): Promise<CV> {
    const current = await this.findByIdOrThrow(id, userId);
    if (data.templateId) {
      await this.checkTemplateAccess(data.templateId, userId);
    }

    // `styling.layout` is the real render/export lever, so it must be tier-gated
    // server-side too (not just in the Design panel). Block NEWLY selecting a
    // layout above the user's plan; re-sending the already-stored layout (which
    // every autosave does) is allowed, so a downgraded user keeps their document
    // — it simply renders as a free layout (see effectiveCvLayout at render time).
    if (data.styling && (data.styling as { layout?: string }).layout !== undefined) {
      const incoming = (data.styling as { layout?: string }).layout as string;
      const stored = (current.styling as { layout?: string })?.layout || 'classic';
      if (incoming !== stored) {
        const user = await this.usersService.findByIdOrThrow(userId);
        const plan = resolveEffectivePlan(user.subscription);
        if (!canUseCvLayout(incoming, plan)) {
          throw new ForbiddenException(
            `Layout "${incoming}" requires a Pro or higher plan. Please upgrade.`,
          );
        }
      }
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
      // Revoke any public share on delete so a deleted CV can't stay reachable by
      // its public slug (defense in depth alongside the deletedAt filter in
      // findByPublicSlug).
      isPublic: false,
      publicSlug: null,
      updatedAt: new Date(),
    });

    // Give the slot back. `cvsCreated` is checked against the plan's `cvs` limit
    // on every create, so without this it behaved as a LIFETIME cap rather than
    // a concurrent one: a FREE user who made and deleted their allowance could
    // never create another CV again, with an "upgrade" prompt as the only exit
    // and no way to tell that deleting had not helped.
    await this.usersService.incrementUsage(userId, 'cvsCreated', -1);
  }

  async duplicate(id: string, userId: string): Promise<CV> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const limits = PLAN_CONFIGS[resolveEffectivePlan(user.subscription)].limits;
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

    // Remap section IDs so the copy's sectionOrder points at the NEW sections,
    // not the original's (which belong to a different document).
    const idMap = new Map<string, string>();
    for (const section of sections) {
      const newSectionId = uuidv4();
      idMap.set(section.id, newSectionId);
      await this.firebaseAdmin.firestore
        .collection(this.collection)
        .doc(newId)
        .collection('sections')
        .doc(newSectionId)
        .set({ ...section, id: newSectionId });
    }
    newCV.sectionOrder = original.sectionOrder
      .map((oldId) => idMap.get(oldId))
      .filter((id): id is string => Boolean(id));

    await this.firebaseAdmin.firestore.collection(this.collection).doc(newId).set(newCV);
    await this.usersService.incrementUsage(userId, 'cvsCreated');

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
      // Never serve a soft-deleted CV publicly, even if its share flags linger.
      .where('deletedAt', '==', null)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as CV;
  }
}
