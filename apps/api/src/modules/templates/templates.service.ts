import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { Template, TemplateCategory, SubscriptionPlan } from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';
import { TEMPLATE_UPDATABLE_FIELDS } from './dto/template.dto';

const CV_PREVIEW_BUCKET = 'flacron-cv.firebasestorage.app';

/** Public Storage URLs for a CV catalog still. Used on seed create only. */
function cvPreviewStills(id: string): Pick<Template, 'thumbnailURL' | 'previewImages'> {
  const fileUrl = (file: string) =>
    `https://firebasestorage.googleapis.com/v0/b/${CV_PREVIEW_BUCKET}/o/${encodeURIComponent(`template-previews/cv/${id}/${file}`)}?alt=media`;
  return {
    thumbnailURL: fileUrl('thumb.webp'),
    previewImages: [fileUrl('page.webp')],
  };
}

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

  // ─── Public (data-minimized) reads ──────────────────────────────────────────
  // The /templates GET endpoints are unauthenticated (the gallery is public), so
  // strip internal fields — the render templates and the creator uid — from what
  // the browser receives.
  private toPublic(t: Template): Omit<Template, 'htmlTemplate' | 'cssTemplate' | 'createdBy' | 'isActive'> {
    const { htmlTemplate, cssTemplate, createdBy, isActive, ...rest } = t;
    void htmlTemplate;
    void cssTemplate;
    void createdBy;
    void isActive;
    return rest;
  }

  async listPublic(category?: TemplateCategory, tier?: SubscriptionPlan) {
    const templates = await this.list(category, tier);
    return templates.map((t) => this.toPublic(t));
  }

  async findPublicById(id: string) {
    const template = await this.findById(id);
    if (!template.isActive) throw new NotFoundException('Template not found');
    return this.toPublic(template);
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
    // Named fields only — never spread the body. `usageCount`, `createdBy`,
    // `id`, `rating`, and timestamps are not caller-writable.
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of TEMPLATE_UPDATABLE_FIELDS) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    await this.firebaseAdmin.firestore.collection(this.collection).doc(id).update(updateData);
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
        descriptionLocalized: {
          en: 'Clean and modern design with a sidebar layout',
          es: 'Diseño limpio y moderno con barra lateral',
          fr: 'Design épuré et moderne avec une colonne latérale',
          de: 'Klares, modernes Design mit Seitenleiste',
          ar: 'تصميم عصري وأنيق مع شريط جانبي',
          ur: 'سائیڈبار لے آؤٹ کے ساتھ صاف اور جدید ڈیزائن',
        },
        ...cvPreviewStills('modern'),
      },
      {
        slug: 'classic',
        name: 'Classic',
        description: 'Traditional professional CV layout',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Classic', es: 'Clásico', fr: 'Classique', de: 'Klassisch', ar: 'كلاسيكي', ur: 'کلاسیکی' },
        descriptionLocalized: {
          en: 'Traditional professional CV layout',
          es: 'Diseño de CV profesional y tradicional',
          fr: 'Mise en page de CV professionnelle et traditionnelle',
          de: 'Traditionelles, professionelles Lebenslauf-Layout',
          ar: 'تخطيط سيرة ذاتية مهني تقليدي',
          ur: 'روایتی پیشہ ورانہ سی وی لے آؤٹ',
        },
        ...cvPreviewStills('classic'),
      },
      {
        slug: 'minimal',
        name: 'Minimal',
        description: 'Simple and elegant minimalist design',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Minimal', es: 'Minimalista', fr: 'Minimaliste', de: 'Minimal', ar: 'بسيط', ur: 'کم سے کم' },
        descriptionLocalized: {
          en: 'Simple and elegant minimalist design',
          es: 'Diseño minimalista, sencillo y elegante',
          fr: 'Design minimaliste, simple et élégant',
          de: 'Schlichtes, elegantes minimalistisches Design',
          ar: 'تصميم بسيط وأنيق',
          ur: 'سادہ اور نفیس کم سے کم ڈیزائن',
        },
        ...cvPreviewStills('minimal'),
      },
      {
        slug: 'professional',
        name: 'Professional',
        description: 'Corporate professional template with accent colors',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Professional', es: 'Profesional', fr: 'Professionnel', de: 'Professionell', ar: 'احترافي', ur: 'پیشہ ورانہ' },
        descriptionLocalized: {
          en: 'Corporate professional template with accent colors',
          es: 'Plantilla profesional corporativa con colores de acento',
          fr: 'Modèle professionnel d’entreprise avec couleurs d’accent',
          de: 'Professionelle Business-Vorlage mit Akzentfarben',
          ar: 'قالب مهني للشركات بألوان مميِّزة',
          ur: 'نمایاں رنگوں کے ساتھ کارپوریٹ پیشہ ورانہ ٹیمپلیٹ',
        },
        ...cvPreviewStills('professional'),
      },
      {
        slug: 'creative',
        name: 'Creative',
        description: 'Bold creative design for designers and artists',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Creative', es: 'Creativo', fr: 'Créatif', de: 'Kreativ', ar: 'إبداعي', ur: 'تخلیقی' },
        descriptionLocalized: {
          en: 'Bold creative design for designers and artists',
          es: 'Diseño creativo y llamativo para diseñadores y artistas',
          fr: 'Design créatif et audacieux pour designers et artistes',
          de: 'Auffälliges, kreatives Design für Designer und Künstler',
          ar: 'تصميم إبداعي لافت للمصممين والفنانين',
          ur: 'ڈیزائنرز اور فنکاروں کے لیے نمایاں تخلیقی ڈیزائن',
        },
        ...cvPreviewStills('creative'),
      },
      {
        slug: 'executive',
        name: 'Executive',
        description: 'Corporate executive with bold header and structured sections',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Executive', es: 'Ejecutivo', fr: 'Exécutif', de: 'Führungskraft', ar: 'تنفيذي', ur: 'ایگزیکٹو' },
        descriptionLocalized: {
          en: 'Corporate executive with bold header and structured sections',
          es: 'Estilo ejecutivo con encabezado destacado y secciones estructuradas',
          fr: 'Style cadre dirigeant avec en-tête affirmé et sections structurées',
          de: 'Führungskräfte-Stil mit markanter Kopfzeile und klar gegliederten Abschnitten',
          ar: 'أسلوب تنفيذي بترويسة بارزة وأقسام منظَّمة',
          ur: 'نمایاں ہیڈر اور منظم حصوں کے ساتھ ایگزیکٹو انداز',
        },
        ...cvPreviewStills('executive'),
      },
      {
        slug: 'compact',
        name: 'Compact',
        description: 'Dense single-page layout maximizing content',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Compact', es: 'Compacto', fr: 'Compact', de: 'Kompakt', ar: 'مضغوط', ur: 'مختصر' },
        descriptionLocalized: {
          en: 'Dense single-page layout maximizing content',
          es: 'Diseño compacto de una página que aprovecha al máximo el espacio',
          fr: 'Mise en page dense sur une page pour un maximum de contenu',
          de: 'Kompaktes einseitiges Layout für möglichst viel Inhalt',
          ar: 'تخطيط مكثّف من صفحة واحدة يستوعب أكبر قدر من المحتوى',
          ur: 'ایک صفحے کا گھنا لے آؤٹ جو زیادہ سے زیادہ مواد سموتا ہے',
        },
        ...cvPreviewStills('compact'),
      },
      {
        slug: 'two-column',
        name: 'Two-Column',
        description: 'Side-by-side layout with sidebar for skills and contact',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Two-Column', es: 'Dos Columnas', fr: 'Deux Colonnes', de: 'Zwei Spalten', ar: 'عمودين', ur: 'دو کالم' },
        descriptionLocalized: {
          en: 'Side-by-side layout with sidebar for skills and contact',
          es: 'Diseño a dos columnas con barra lateral para habilidades y contacto',
          fr: 'Mise en page sur deux colonnes avec un volet pour les compétences et les coordonnées',
          de: 'Zweispaltiges Layout mit Seitenleiste für Kenntnisse und Kontakt',
          ar: 'تخطيط من عمودين مع شريط جانبي للمهارات وبيانات التواصل',
          ur: 'مہارتوں اور رابطے کے لیے سائیڈبار کے ساتھ دو کالم لے آؤٹ',
        },
        ...cvPreviewStills('two-column'),
      },
      {
        slug: 'academic',
        name: 'Academic',
        description: 'Serif single-column layout suited to academic and research CVs',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Academic', es: 'Académico', fr: 'Académique', de: 'Akademisch', ar: 'أكاديمي', ur: 'تعلیمی' },
        descriptionLocalized: {
          en: 'Serif single-column layout suited to academic and research CVs',
          es: 'Diseño de una columna con tipografía serif, adecuado para CV académicos y de investigación',
          fr: 'Mise en page sur une colonne en police à empattements, adaptée aux CV universitaires et de recherche',
          de: 'Einspaltiges Layout in Serifenschrift für akademische und Forschungslebensläufe',
          ar: 'تخطيط من عمود واحد بخط مذيَّل يناسب السير الذاتية الأكاديمية والبحثية',
          ur: 'سیرف فونٹ میں ایک کالم کا لے آؤٹ، تعلیمی اور تحقیقی سی ویز کے لیے موزوں',
        },
        ...cvPreviewStills('academic'),
      },
      {
        slug: 'bold',
        name: 'Bold',
        description: 'High-impact design with strong typography and color blocks',
        category: TemplateCategory.CV,
        tier: SubscriptionPlan.ENTERPRISE,
        nameLocalized: { en: 'Bold', es: 'Audaz', fr: 'Audacieux', de: 'Kühn', ar: 'جريء', ur: 'بولڈ' },
        descriptionLocalized: {
          en: 'High-impact design with strong typography and color blocks',
          es: 'Diseño de gran impacto con tipografía marcada y bloques de color',
          fr: 'Design percutant avec une typographie forte et des blocs de couleur',
          de: 'Wirkungsvolles Design mit kräftiger Typografie und Farbflächen',
          ar: 'تصميم قوي التأثير بخطوط بارزة وكتل لونية',
          ur: 'مضبوط ٹائپوگرافی اور رنگین بلاکس کے ساتھ پُراثر ڈیزائن',
        },
        ...cvPreviewStills('bold'),
      },
      {
        slug: 'cl-classic',
        name: 'Classic',
        description: 'Traditional business letter with clean dividers',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Classic', es: 'Clásico', fr: 'Classique', de: 'Klassisch', ar: 'كلاسيكي', ur: 'کلاسیکی' },
        descriptionLocalized: {
          en: 'Traditional business letter with clean dividers',
          es: 'Carta comercial tradicional con separadores limpios',
          fr: 'Lettre commerciale traditionnelle avec des séparateurs nets',
          de: 'Klassischer Geschäftsbrief mit klaren Trennlinien',
          ar: 'خطاب عمل تقليدي بفواصل أنيقة',
          ur: 'صاف ستھری تقسیمی لکیروں کے ساتھ روایتی کاروباری خط',
        },
      },
      {
        slug: 'cl-modern',
        name: 'Modern',
        description: 'Bold colored header band, contemporary style',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.FREE,
        nameLocalized: { en: 'Modern', es: 'Moderno', fr: 'Moderne', de: 'Modern', ar: 'عصري', ur: 'جدید' },
        descriptionLocalized: {
          en: 'Bold colored header band, contemporary style',
          es: 'Franja de encabezado en color, estilo contemporáneo',
          fr: 'Bandeau d’en-tête coloré, style contemporain',
          de: 'Farbiges Kopfband im zeitgemäßen Stil',
          ar: 'شريط ترويسة ملوَّن بأسلوب معاصر',
          ur: 'رنگین ہیڈر پٹی، عصری انداز',
        },
      },
      {
        slug: 'cl-minimalist',
        name: 'Minimalist',
        description: 'Clean and spacious with generous whitespace',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Minimalist', es: 'Minimalista', fr: 'Minimaliste', de: 'Minimal', ar: 'بسيط', ur: 'کم سے کم' },
        descriptionLocalized: {
          en: 'Clean and spacious with generous whitespace',
          es: 'Limpio y espacioso, con amplios márgenes en blanco',
          fr: 'Épuré et aéré, avec de généreux espaces blancs',
          de: 'Klar und luftig mit viel Weißraum',
          ar: 'تصميم نظيف وفسيح بمساحات بيضاء واسعة',
          ur: 'کھلی سفید جگہ کے ساتھ صاف اور کشادہ',
        },
      },
      {
        slug: 'cl-creative',
        name: 'Creative',
        description: 'Side accent strip with vivid color heading',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.PRO,
        nameLocalized: { en: 'Creative', es: 'Creativo', fr: 'Créatif', de: 'Kreativ', ar: 'إبداعي', ur: 'تخلیقی' },
        descriptionLocalized: {
          en: 'Side accent strip with vivid color heading',
          es: 'Franja lateral de acento y encabezado en color vivo',
          fr: 'Bande d’accent latérale et titre aux couleurs vives',
          de: 'Seitlicher Akzentstreifen und Überschrift in kräftiger Farbe',
          ar: 'شريط جانبي مميِّز وعنوان بلون زاهٍ',
          ur: 'سائیڈ پر نمایاں پٹی اور شوخ رنگ کی سرخی',
        },
      },
      {
        slug: 'cl-corporate',
        name: 'Corporate',
        description: 'Formal letterhead with top color bar',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.ENTERPRISE,
        nameLocalized: { en: 'Corporate', es: 'Corporativo', fr: 'Corporatif', de: 'Unternehmen', ar: 'مؤسسي', ur: 'کارپوریٹ' },
        descriptionLocalized: {
          en: 'Formal letterhead with top color bar',
          es: 'Membrete formal con barra de color superior',
          fr: 'En-tête de lettre formel avec barre de couleur en haut',
          de: 'Formeller Briefkopf mit farbigem Balken oben',
          ar: 'ترويسة رسمية مع شريط ملوَّن في الأعلى',
          ur: 'اوپر رنگین پٹی کے ساتھ رسمی لیٹر ہیڈ',
        },
      },
      {
        slug: 'cl-executive',
        name: 'Executive',
        description: 'Premium right-aligned header with gradient divider',
        category: TemplateCategory.COVER_LETTER,
        tier: SubscriptionPlan.ENTERPRISE,
        nameLocalized: { en: 'Executive', es: 'Ejecutivo', fr: 'Exécutif', de: 'Führungskraft', ar: 'تنفيذي', ur: 'ایگزیکٹو' },
        descriptionLocalized: {
          en: 'Premium right-aligned header with gradient divider',
          es: 'Encabezado premium alineado a la derecha con separador degradado',
          fr: 'En-tête haut de gamme aligné à droite avec séparateur en dégradé',
          de: 'Hochwertige rechtsbündige Kopfzeile mit Farbverlauf-Trennlinie',
          ar: 'ترويسة فاخرة محاذاة إلى الجهة المقابلة مع فاصل متدرّج',
          ur: 'گریڈینٹ تقسیمی لکیر کے ساتھ دوسری جانب سیدھا پریمیم ہیڈر',
        },
      },
    ];

    for (const tmpl of defaults) {
      const existing = await this.firebaseAdmin.firestore
        .collection(this.collection)
        .doc(tmpl.slug)
        .get();
      if (!existing.exists) {
        await this.create(tmpl, 'system');
      } else {
        // Re-seeding keeps the code-owned fields (tier/name/description/category/
        // localization) in sync; usageCount/rating/createdBy and preview URLs
        // are preserved. Stills are create-only — a live preview change is
        // PUT /templates/:id, not a re-seed.
        await this.update(tmpl.slug, {
          name: tmpl.name,
          description: tmpl.description,
          category: tmpl.category,
          tier: tmpl.tier,
          nameLocalized: tmpl.nameLocalized,
          // Re-applied on every boot, so templates stored before translations
          // existed get them too (idempotent: same value every run).
          descriptionLocalized: tmpl.descriptionLocalized,
        });
      }
    }
  }
}
