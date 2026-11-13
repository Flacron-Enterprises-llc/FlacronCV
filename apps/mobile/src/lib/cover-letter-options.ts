import { t } from '../i18n';
import { SubscriptionPlan } from '../types/enums';
import type { CoverLetterLength, CoverLetterStyling, CoverLetterTone } from '../types/cover-letter.types';

/**
 * Cover-letter template registry, copied from the website
 * (`apps/web/src/components/cover-letter/CoverLetterPreview.tsx` COVER_LETTER_TEMPLATES)
 * with the English names/descriptions from `public/locales/en/common.json`
 * (`coverLetters.tpl_*`), translated like the website (`coverLetters.templates.*` here;
 * `name`/`description` read the current language each time). Tiers match `packages/shared-types` COVER_LETTER_TEMPLATE_TIER,
 * which the API enforces on a templateId change.
 */
export interface CoverLetterTemplateOption {
  id: string;
  name: string;
  description: string;
  defaultColor: string;
  tier: SubscriptionPlan;
}

/** A template whose `name`/`description` are getters in the current language. */
function template(id: string, defaultColor: string, tier: SubscriptionPlan, name: () => string, description: () => string): CoverLetterTemplateOption {
  return {
    id,
    defaultColor,
    tier,
    get name() {
      return name();
    },
    get description() {
      return description();
    },
  };
}

export const COVER_LETTER_TEMPLATES: readonly CoverLetterTemplateOption[] = [
  template('classic', '#1e3a5f', SubscriptionPlan.FREE, () => t('coverLetters.templates.classic.name'), () => t('coverLetters.templates.classic.description')),
  template('modern', '#2563eb', SubscriptionPlan.FREE, () => t('coverLetters.templates.modern.name'), () => t('coverLetters.templates.modern.description')),
  template('minimalist', '#374151', SubscriptionPlan.PRO, () => t('coverLetters.templates.minimalist.name'), () => t('coverLetters.templates.minimalist.description')),
  template('creative', '#7c3aed', SubscriptionPlan.PRO, () => t('coverLetters.templates.creative.name'), () => t('coverLetters.templates.creative.description')),
  template('corporate', '#0f766e', SubscriptionPlan.ENTERPRISE, () => t('coverLetters.templates.corporate.name'), () => t('coverLetters.templates.corporate.description')),
  template('executive', '#0c0c0c', SubscriptionPlan.ENTERPRISE, () => t('coverLetters.templates.executive.name'), () => t('coverLetters.templates.executive.description')),
];

/** The website's preset accent swatches, in the same order. */
export const ACCENT_COLORS: readonly string[] = [
  '#2563eb',
  '#0f766e',
  '#7c3aed',
  '#dc2626',
  '#1e3a5f',
  '#374151',
  '#c2410c',
  '#0c4a6e',
];

export const DEFAULT_TEMPLATE_ID = 'modern';

/** The web treats a missing id (and the legacy 'standard' alias) as Modern. */
export function activeTemplateId(templateId: string | null | undefined): string {
  if (!templateId || templateId === 'standard') return DEFAULT_TEMPLATE_ID;
  return templateId;
}

export function templateById(templateId: string | null | undefined): CoverLetterTemplateOption | undefined {
  const id = activeTemplateId(templateId);
  return COVER_LETTER_TEMPLATES.find((t) => t.id === id);
}

/**
 * True when the accent is still one of the templates' factory colours, i.e. the
 * user never chose one. Same rule as the web editor's `isFactoryColor`.
 */
export function isFactoryColor(color?: string | null): boolean {
  const c = (color || '').trim().toLowerCase();
  if (!c) return true;
  return COVER_LETTER_TEMPLATES.some((t) => t.defaultColor.toLowerCase() === c);
}

/**
 * What picking a template changes. Like the website, it adopts the new
 * template's colour only when the current colour is still a factory default, so
 * trying a template never silently discards a colour the user picked.
 */
export function pickTemplate(
  template: CoverLetterTemplateOption,
  styling: CoverLetterStyling | null | undefined,
): { templateId: string; primaryColor: string | null } {
  const current = styling?.primaryColor;
  return {
    templateId: template.id,
    primaryColor: isFactoryColor(current) ? template.defaultColor : null,
  };
}

/** Same comparison the web swatch uses (exact string), but case-insensitive. */
export function isSameColor(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

/** Tones the API prompt understands (GenerateAiCoverLetterDto / GenerateCoverLetterDto). */
/** Labels are getters, so they follow the current language. */
export const TONE_OPTIONS: readonly { value: CoverLetterTone; label: string; icon: string }[] = [
  { value: 'professional', get label() { return t('coverLetters.tones.professional'); }, icon: 'business-outline' },
  { value: 'friendly', get label() { return t('coverLetters.tones.friendly'); }, icon: 'happy-outline' },
  { value: 'enthusiastic', get label() { return t('coverLetters.tones.enthusiastic'); }, icon: 'rocket-outline' },
  { value: 'formal', get label() { return t('coverLetters.tones.formal'); }, icon: 'ribbon-outline' },
];

/** Must match AIService's COVER_LETTER_LENGTHS keys (web `LENGTHS`). */
export const LENGTH_OPTIONS: readonly { value: CoverLetterLength; label: string }[] = [
  { value: 'short', get label() { return t('coverLetters.lengths.short'); } },
  { value: 'medium', get label() { return t('coverLetters.lengths.medium'); } },
  { value: 'long', get label() { return t('coverLetters.lengths.long'); } },
];

/** "Short is about 150–200 words, …" in the current language. */
export function lengthHint(): string {
  return t('coverLetters.lengths.hint');
}
