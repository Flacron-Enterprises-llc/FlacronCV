/**
 * Shared page geometry for preview and export.
 * A4 portrait at 96 CSS pixels; PDF uses US Letter points (612×792)
 * with equivalent margins and chrome ratios.
 */

export const PAGE_CSS_WIDTH = 794;
export const PAGE_CSS_HEIGHT = 1123;
export const PDF_PAGE_WIDTH = 612;
export const PDF_PAGE_HEIGHT = 792;
export const PDF_SIDEBAR_WIDTH = 168;
export const PDF_EDITORIAL_RAIL = 36;
export const PDF_STRUCTURED_RULE_X = 118;
export const PDF_MARGIN = 54;
export const DOCUMENT_FONT_STACK = 'Helvetica, Arial, sans-serif';

export const HERO_RESUME_TEMPLATE_IDS = ['professional', 'editorial', 'structured'] as const;
export const HERO_LETTER_TEMPLATE_IDS = ['classic', 'editorial', 'structured'] as const;

export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace('#', '');
  const n = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  return {
    r: Number.parseInt(n.slice(0, 2), 16) / 255,
    g: Number.parseInt(n.slice(2, 4), 16) / 255,
    b: Number.parseInt(n.slice(4, 6), 16) / 255,
  };
}
