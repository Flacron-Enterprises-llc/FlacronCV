import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { Template, TemplateCategory, SubscriptionPlan } from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TemplatesService {
  private readonly collection = 'templates';

  constructor(private firebaseAdmin: FirebaseAdminService) {}

  async list(category?: TemplateCategory, tier?: SubscriptionPlan) {
    let query: FirebaseFirestore.Query = this.firebaseAdmin.firestore
      .collection(this.collection)
      .where('isActive', '==', true);

    if (category) query = query.where('category', '==', category);
    if (tier) query = query.where('tier', '==', tier);

    const snapshot = await query.get();
    const templates = snapshot.docs.map((doc) => doc.data() as Template);
    return templates.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0));
  }

  async findById(id: string): Promise<Template> {
    const doc = await this.firebaseAdmin.firestore.collection(this.collection).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Template not found');
    return doc.data() as Template;
  }

  async create(data: Partial<Template>, createdBy: string): Promise<Template> {
    const id = data.slug || uuidv4();
    const now = new Date();

    const template: Template = {
      id,
      name: data.name || '',
      slug: data.slug || id,
      description: data.description || '',
      category: data.category || TemplateCategory.CV,
      thumbnailURL: data.thumbnailURL || '',
      previewImages: data.previewImages || [],
      htmlTemplate: data.htmlTemplate || '',
      cssTemplate: data.cssTemplate || '',
      supportedSections: data.supportedSections || [],
      colorSchemes: data.colorSchemes || [],
      fontOptions: data.fontOptions || ['Inter', 'Roboto', 'Poppins'],
      tier: data.tier || SubscriptionPlan.FREE,
      isActive: true,
      isFeatured: data.isFeatured || false,
      usageCount: 0,
      rating: 0,
      nameLocalized: data.nameLocalized || {},
      descriptionLocalized: data.descriptionLocalized || {},
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).set(template);
    return template;
  }

  async update(id: string, data: Partial<Template>): Promise<Template> {
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update({
      ...data,
      updatedAt: new Date(),
    });
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update({
      isActive: false,
      updatedAt: new Date(),
    });
  }

  async seedDefaults(): Promise<void> {
    const defaults = [
      {
        slug: 'modern',
        name: 'Modern',
        description: 'Clean and modern design with a sidebar layout',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Modern', es: 'Moderno', fr: 'Moderne', de: 'Modern', ar: 'عصري', ur: 'جدید' },
      },
      {
        slug: 'classic',
        name: 'Classic',
        description: 'Traditional professional CV layout',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Classic', es: 'Clásico', fr: 'Classique', de: 'Klassisch', ar: 'كلاسيكي', ur: 'کلاسیکی' },
      },
      {
        slug: 'minimal',
        name: 'Minimal',
        description: 'Simple and elegant minimalist design',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Minimal', es: 'Minimalista', fr: 'Minimaliste', de: 'Minimal', ar: 'بسيط', ur: 'کم سے کم' },
      },
      {
        slug: 'professional',
        name: 'Professional',
        description: 'Corporate professional template with accent colors',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Professional', es: 'Profesional', fr: 'Professionnel', de: 'Professionell', ar: 'احترافي', ur: 'پیشہ ورانہ' },
      },
      {
        slug: 'creative',
        name: 'Creative',
        description: 'Bold creative design for designers and artists',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Creative', es: 'Creativo', fr: 'Créatif', de: 'Kreativ', ar: 'إبداعي', ur: 'تخلیقی' },
      },
      {
        slug: 'executive',
        name: 'Executive',
        description: 'Corporate executive with bold header and structured sections',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Executive', es: 'Ejecutivo', fr: 'Exécutif', de: 'Führungskraft', ar: 'تنفيذي', ur: 'ایگزیکٹو' },
      },
      {
        slug: 'compact',
        name: 'Compact',
        description: 'Dense single-page layout maximizing content',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Compact', es: 'Compacto', fr: 'Compact', de: 'Kompakt', ar: 'مضغوط', ur: 'مختصر' },
      },
      {
        slug: 'two-column',
        name: 'Two-Column',
        description: 'Side-by-side layout with sidebar for skills and contact',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Two-Column', es: 'Dos Columnas', fr: 'Deux Colonnes', de: 'Zwei Spalten', ar: 'عمودين', ur: 'دو کالم' },
      },
      {
        slug: 'academic',
        name: 'Academic',
        description: 'Research-focused CV with publications section',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Academic', es: 'Académico', fr: 'Académique', de: 'Akademisch', ar: 'أكاديمي', ur: 'تعلیمی' },
      },
      {
        slug: 'bold',
        name: 'Bold',
        description: 'High-impact design with strong typography and color blocks',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.ENTERPRISE,
        nameLocalized: { en: 'Bold', es: 'Audaz', fr: 'Audacieux', de: 'Kühn', ar: 'جريء', ur: 'بولڈ' },
      },
      {
        slug: 'cl-classic',
        name: 'Classic',
        description: 'Traditional business letter with clean dividers',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Classic', es: 'Clásico', fr: 'Classique', de: 'Klassisch', ar: 'كلاسيكي', ur: 'کلاسیکی' },
      },
      {
        slug: 'cl-modern',
        name: 'Modern',
        description: 'Bold colored header band, contemporary style',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Modern', es: 'Moderno', fr: 'Moderne', de: 'Modern', ar: 'عصري', ur: 'جدید' },
      },
      {
        slug: 'cl-minimalist',
        name: 'Minimalist',
        description: 'Clean and spacious with generous whitespace',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Minimalist', es: 'Minimalista', fr: 'Minimaliste', de: 'Minimal', ar: 'بسيط', ur: 'کم سے کم' },
      },
      {
        slug: 'cl-creative',
        name: 'Creative',
        description: 'Side accent strip with vivid color heading',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Creative', es: 'Creativo', fr: 'Créatif', de: 'Kreativ', ar: 'إبداعي', ur: 'تخلیقی' },
      },
      {
        slug: 'cl-corporate',
        name: 'Corporate',
        description: 'Formal letterhead with top color bar',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.ENTERPRISE,
        nameLocalized: { en: 'Corporate', es: 'Corporativo', fr: 'Corporatif', de: 'Unternehmen', ar: 'مؤسسي', ur: 'کارپوریٹ' },
      },
      {
        slug: 'cl-executive',
        name: 'Executive',
        description: 'Premium right-aligned header with gradient divider',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.ENTERPRISE,
        nameLocalized: { en: 'Executive', es: 'Ejecutivo', fr: 'Exécutif', de: 'Führungskraft', ar: 'تنفيذي', ur: 'ایگزیکٹو' },
      },
    ];

    for (const tmpl of defaults) {
      const existing = await this.firebaseAdmin.firestore
        .collection(this.collection)
        .doc(tmpl.slug)
        .get();
      if (!existing.exists) {
        await this.create(tmpl, 'system');
      }
    }
  }
}
