import { SubscriptionPlan } from '../types/enums';
import type { CoverLetterLength, CoverLetterStyling, CoverLetterTone } from '../types/cover-letter.types';

/**
 * Cover-letter template registry, copied from the website
 * (`apps/web/src/components/cover-letter/CoverLetterPreview.tsx` COVER_LETTER_TEMPLATES)
 * with the English names/descriptions from `public/locales/en/common.json`
 * (`coverLetters.tpl_*`). Tiers match `packages/shared-types` COVER_LETTER_TEMPLATE_TIER,
 * which the API enforces on a templateId change.
 */
export interface CoverLetterTemplateOption {
  id: string;
  name: string;
  description: string;
  defaultColor: string;
  tier: SubscriptionPlan;
}

export const COVER_LETTER_TEMPLATES: readonly CoverLetterTemplateOption[] = [
  { id: 'classic', name: 'Classic', description: 'Traditional business letter', defaultColor: '#1e3a5f', tier: SubscriptionPlan.FREE },
  { id: 'modern', name: 'Modern', description: 'Bold colored header', defaultColor: '#2563eb', tier: SubscriptionPlan.FREE },
  { id: 'minimalist', name: 'Minimalist', description: 'Clean and spacious', defaultColor: '#374151', tier: SubscriptionPlan.PRO },
  { id: 'creative', name: 'Creative', description: 'Side accent with vivid color', defaultColor: '#7c3aed', tier: SubscriptionPlan.PRO },
  { id: 'corporate', name: 'Corporate', description: 'Formal letterhead style', defaultColor: '#0f766e', tier: SubscriptionPlan.ENTERPRISE },
  { id: 'executive', name: 'Executive', description: 'Premium right-aligned header', defaultColor: '#0c0c0c', tier: SubscriptionPlan.ENTERPRISE },
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
export const TONE_OPTIONS: readonly { value: CoverLetterTone; label: string; icon: string }[] = [
  { value: 'professional', label: 'Professional', icon: 'business-outline' },
  { value: 'friendly', label: 'Friendly', icon: 'happy-outline' },
  { value: 'enthusiastic', label: 'Enthusiastic', icon: 'rocket-outline' },
  { value: 'formal', label: 'Formal', icon: 'ribbon-outline' },
];

/** Must match AIService's COVER_LETTER_LENGTHS keys (web `LENGTHS`). */
export const LENGTH_OPTIONS: readonly { value: CoverLetterLength; label: string }[] = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
];

export const LENGTH_HINT = 'Short is about 150–200 words, medium about 300–400, long about 500–600.';
