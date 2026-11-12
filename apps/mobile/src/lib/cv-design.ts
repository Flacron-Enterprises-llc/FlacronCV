import {
  CV_LAYOUT_TIER,
  CV_TEMPLATE_TIER,
  planMeetsTier,
} from '../../../../packages/shared-types/src/template.tiers';
import type { SubscriptionPlan as SharedPlan } from '../../../../packages/shared-types/src/enums';

/**
 * CV design options — the same values the website's editor offers
 * (`apps/web/src/components/cv-builder/toolbar/TemplatePanel.tsx` and
 * `FontPanel.tsx`) and the API accepts (`CvStylingDto`). Labels are the web's
 * English strings (`public/locales/en/common.json` template_picker / cv_builder).
 */

export type CVLayout = 'classic' | 'sidebar' | 'top-bar' | 'compact' | 'slate-gold';
export type SectionStyle = 'underline' | 'left-border' | 'card' | 'minimal';
export type BorderRadiusStyle = 'none' | 'small' | 'medium' | 'large';
export type DesignFontSize = 'small' | 'medium' | 'large';
export type DesignSpacing = 'compact' | 'normal' | 'relaxed';

export interface LayoutOption {
  key: CVLayout;
  label: string;
  description: string;
}

export const LAYOUT_OPTIONS: readonly LayoutOption[] = [
  { key: 'classic', label: 'Classic', description: 'Modern minimal' },
  { key: 'sidebar', label: 'Sidebar', description: 'Corporate professional' },
  { key: 'top-bar', label: 'Top bar', description: 'Creative and bold' },
  { key: 'compact', label: 'Compact', description: 'Executive, dense' },
  { key: 'slate-gold', label: 'Slate Gold', description: 'High-impact minimalist' },
];

export const ACCENT_COLORS: readonly { label: string; value: string }[] = [
  { label: 'Indigo', value: '#4f46e5' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Cyan', value: '#0891b2' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Slate', value: '#475569' },
  { label: 'Stone', value: '#78716c' },
  { label: 'Zinc', value: '#3f3f46' },
];

export const SECTION_STYLE_OPTIONS: readonly { key: SectionStyle; label: string }[] = [
  { key: 'underline', label: 'Underline' },
  { key: 'left-border', label: 'Side border' },
  { key: 'card', label: 'Badge' },
  { key: 'minimal', label: 'Minimal' },
];

export const BORDER_RADIUS_OPTIONS: readonly { key: BorderRadiusStyle; label: string }[] = [
  { key: 'none', label: 'Sharp' },
  { key: 'small', label: 'Subtle' },
  { key: 'medium', label: 'Rounded' },
  { key: 'large', label: 'Soft' },
];

export const FONT_OPTIONS: readonly string[] = [
  'Inter',
  'Merriweather',
  'Playfair Display',
  'Roboto',
  'Lora',
  'Open Sans',
  'Montserrat',
];

export const FONT_SIZE_OPTIONS: readonly { key: DesignFontSize; label: string }[] = [
  { key: 'small', label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
];

/** Website fallbacks when a stored CV lacks a key (TemplatePanel / FontPanel). */
export const DESIGN_DEFAULTS = {
  layout: 'classic' as CVLayout,
  primaryColor: '#2563eb',
  sectionStyle: 'underline' as SectionStyle,
  borderRadius: 'small' as BorderRadiusStyle,
  fontFamily: 'Inter',
  fontSize: 'medium' as DesignFontSize,
};

/** Full styling as the API stores it (mobile `CVStyling` lacks the design keys). */
export interface DesignStyling {
  primaryColor: string;
  fontFamily: string;
  headingFontFamily?: string;
  fontSize: DesignFontSize;
  spacing?: DesignSpacing;
  showPhoto?: boolean;
  layout: CVLayout;
  sectionStyle: SectionStyle;
  borderRadius: BorderRadiusStyle;
}

/**
 * Per-template styling applied when a CV is created. Byte-for-byte copy of
 * `CVService.getTemplateStyling` (apps/api/src/modules/cv/cv.service.ts), also
 * mirrored by the web's `lib/cv-template-styling.ts`. Unknown ids → modern.
 */
export const TEMPLATE_STYLING: Record<string, Required<DesignStyling>> = {
  classic: { primaryColor: '#1e3a5f', fontFamily: 'Merriweather', headingFontFamily: 'Merriweather', fontSize: 'medium', spacing: 'normal', showPhoto: false, layout: 'classic', sectionStyle: 'underline', borderRadius: 'small' },
  modern: { primaryColor: '#2563eb', fontFamily: 'Inter', headingFontFamily: 'Inter', fontSize: 'medium', spacing: 'normal', showPhoto: false, layout: 'sidebar', sectionStyle: 'underline', borderRadius: 'small' },
  minimal: { primaryColor: '#374151', fontFamily: 'Inter', headingFontFamily: 'Inter', fontSize: 'small', spacing: 'compact', showPhoto: false, layout: 'classic', sectionStyle: 'minimal', borderRadius: 'none' },
  professional: { primaryColor: '#0f766e', fontFamily: 'Roboto', headingFontFamily: 'Montserrat', fontSize: 'medium', spacing: 'normal', showPhoto: false, layout: 'top-bar', sectionStyle: 'left-border', borderRadius: 'small' },
  creative: { primaryColor: '#7c3aed', fontFamily: 'Open Sans', headingFontFamily: 'Playfair Display', fontSize: 'medium', spacing: 'relaxed', showPhoto: true, layout: 'top-bar', sectionStyle: 'card', borderRadius: 'large' },
  executive: { primaryColor: '#0c0c0c', fontFamily: 'Roboto', headingFontFamily: 'Montserrat', fontSize: 'large', spacing: 'relaxed', showPhoto: false, layout: 'compact', sectionStyle: 'underline', borderRadius: 'none' },
  compact: { primaryColor: '#1d4ed8', fontFamily: 'Inter', headingFontFamily: 'Inter', fontSize: 'small', spacing: 'compact', showPhoto: false, layout: 'compact', sectionStyle: 'underline', borderRadius: 'small' },
  'two-column': { primaryColor: '#059669', fontFamily: 'Lora', headingFontFamily: 'Montserrat', fontSize: 'medium', spacing: 'normal', showPhoto: true, layout: 'sidebar', sectionStyle: 'underline', borderRadius: 'medium' },
  academic: { primaryColor: '#6b21a8', fontFamily: 'Merriweather', headingFontFamily: 'Merriweather', fontSize: 'medium', spacing: 'normal', showPhoto: false, layout: 'classic', sectionStyle: 'minimal', borderRadius: 'none' },
  bold: { primaryColor: '#dc2626', fontFamily: 'Montserrat', headingFontFamily: 'Montserrat', fontSize: 'large', spacing: 'relaxed', showPhoto: true, layout: 'top-bar', sectionStyle: 'left-border', borderRadius: 'medium' },
};

export function templateStyling(templateId: string): Required<DesignStyling> {
  return TEMPLATE_STYLING[templateId] ?? TEMPLATE_STYLING.modern;
}

/** Editable state of the Design screen. `headingFontFamily` unset = follows body (web). */
export interface DesignDraft {
  templateId: string;
  layout: CVLayout;
  primaryColor: string;
  sectionStyle: SectionStyle;
  borderRadius: BorderRadiusStyle;
  fontFamily: string;
  headingFontFamily?: string;
  fontSize: DesignFontSize;
  /** Only set by a template switch (create-time preset); not editable directly, as on the web. */
  spacing?: DesignSpacing;
  showPhoto?: boolean;
}

function isOneOf<T extends string>(value: unknown, options: readonly { key: T }[]): value is T {
  return typeof value === 'string' && options.some((o) => o.key === value);
}

/** Read the stored CV into a draft, with the website's fallbacks. */
export function designDraftFromCV(cv: { templateId?: string; styling?: unknown }): DesignDraft {
  const s = (cv.styling && typeof cv.styling === 'object' ? cv.styling : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  const draft: DesignDraft = {
    templateId: cv.templateId || 'modern',
    layout: isOneOf(s.layout, LAYOUT_OPTIONS) ? s.layout : DESIGN_DEFAULTS.layout,
    primaryColor: str(s.primaryColor) ?? DESIGN_DEFAULTS.primaryColor,
    sectionStyle: isOneOf(s.sectionStyle, SECTION_STYLE_OPTIONS) ? s.sectionStyle : DESIGN_DEFAULTS.sectionStyle,
    borderRadius: isOneOf(s.borderRadius, BORDER_RADIUS_OPTIONS) ? s.borderRadius : DESIGN_DEFAULTS.borderRadius,
    fontFamily: str(s.fontFamily) ?? DESIGN_DEFAULTS.fontFamily,
    fontSize: isOneOf(s.fontSize, FONT_SIZE_OPTIONS) ? s.fontSize : DESIGN_DEFAULTS.fontSize,
  };
  const heading = str(s.headingFontFamily);
  if (heading) draft.headingFontFamily = heading;
  if (s.spacing === 'compact' || s.spacing === 'normal' || s.spacing === 'relaxed') draft.spacing = s.spacing;
  if (typeof s.showPhoto === 'boolean') draft.showPhoto = s.showPhoto;
  return draft;
}

/** Heading font as displayed: explicit value, else the body font (FontPanel). */
export function effectiveHeadingFont(draft: Pick<DesignDraft, 'fontFamily' | 'headingFontFamily'>): string {
  return draft.headingFontFamily || draft.fontFamily;
}

/**
 * Switching template re-applies that template's create-time styling (what
 * `POST /cvs` does with `templateId`), so the CV looks like the chosen design.
 */
export function applyTemplate(draft: DesignDraft, templateId: string): DesignDraft {
  const preset = templateStyling(templateId);
  return {
    templateId,
    layout: preset.layout,
    primaryColor: preset.primaryColor,
    sectionStyle: preset.sectionStyle,
    borderRadius: preset.borderRadius,
    fontFamily: preset.fontFamily,
    headingFontFamily: preset.headingFontFamily,
    fontSize: preset.fontSize,
    spacing: preset.spacing,
    showPhoto: preset.showPhoto,
  };
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc`, `abc`, `#AABBCC` → `#aabbcc`. Anything else → null (the web's colour input only yields #rrggbb). */
export function normalizeHex(input: string): string | null {
  const m = HEX_RE.exec(input.trim());
  if (!m) return null;
  const digits = m[1].toLowerCase();
  const full = digits.length === 3 ? digits.split('').map((c) => c + c).join('') : digits;
  return `#${full}`;
}

export function accentLabel(value: string): string {
  const preset = ACCENT_COLORS.find((c) => c.value.toLowerCase() === value.toLowerCase());
  return preset ? preset.label : 'Custom';
}

export function layoutLabel(layout: string): string {
  return LAYOUT_OPTIONS.find((l) => l.key === layout)?.label ?? 'Classic';
}

/** Required plan for a layout (`CV_LAYOUT_TIER`, unknown → free). */
export function layoutTier(layout: CVLayout): SharedPlan {
  return CV_LAYOUT_TIER[layout] ?? ('free' as SharedPlan);
}

/**
 * The API blocks NEWLY selecting a layout above the plan but always accepts
 * re-sending the stored one (`CvService.update`), so a downgraded user keeps it.
 */
export function canSelectLayout(layout: CVLayout, plan: SharedPlan, storedLayout: CVLayout): boolean {
  if (layout === storedLayout) return true;
  return planMeetsTier(plan, layoutTier(layout));
}

/**
 * Template tier: the built-in table first (API `checkTemplateAccess`), else
 * the catalog doc's tier, else free. The stored template is always allowed.
 */
export function templateTier(templateId: string, catalogTier?: string): string {
  return CV_TEMPLATE_TIER[templateId] ?? catalogTier ?? 'free';
}

export function canSelectTemplate(
  templateId: string,
  plan: SharedPlan,
  storedTemplateId: string,
  catalogTier?: string,
): boolean {
  if (templateId === storedTemplateId) return true;
  return planMeetsTier(plan, templateTier(templateId, catalogTier) as SharedPlan);
}

export interface DesignUpdatePayload {
  templateId?: string;
  styling?: Partial<DesignStyling>;
}

/**
 * `PUT /cvs/:id` body with only what changed (the API merges `styling.*` keys,
 * so unchanged keys need not be sent). Null when nothing changed.
 */
export function buildDesignUpdate(original: DesignDraft, draft: DesignDraft): DesignUpdatePayload | null {
  const styling: Partial<DesignStyling> = {};
  const keys = [
    'layout',
    'primaryColor',
    'sectionStyle',
    'borderRadius',
    'fontFamily',
    'headingFontFamily',
    'fontSize',
    'spacing',
    'showPhoto',
  ] as const;
  for (const key of keys) {
    const next = draft[key];
    if (next === undefined) continue;
    if (next !== original[key]) {
      (styling as Record<string, unknown>)[key] = next;
    }
  }
  const payload: DesignUpdatePayload = {};
  if (draft.templateId && draft.templateId !== original.templateId) payload.templateId = draft.templateId;
  if (Object.keys(styling).length) payload.styling = styling;
  return Object.keys(payload).length ? payload : null;
}
