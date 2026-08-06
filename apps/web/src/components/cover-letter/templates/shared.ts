/**
 * Shared vocabulary for the six cover-letter templates.
 *
 * The templates previously each declared their own page height, their own
 * greys, their own font fallback and their own accent handling. Six independent
 * copies of the same decisions is six chances to get one of them wrong, and
 * that is exactly what happened: all six inherited a page height from the wrong
 * DPI system, four painted the accent as text with no contrast floor, and none
 * resolved the font the editor actually stores. This module holds the decisions
 * once.
 */

import { INK, readableOn, ensureDarkSurface, hexToRgba } from '@/lib/design-tokens';
import type { CoverLetter } from '@flacroncv/shared-types';

export { INK, readableOn, ensureDarkSurface, hexToRgba };

// ─── Page geometry ───────────────────────────────────────────────────────────

/**
 * A4 height in CSS pixels at 96dpi.
 *
 * The templates hardcoded 842, which is A4 height in PostScript *points*
 * (595×842 @ 72dpi) — while the exporter pins the capture width to 794px, which
 * is A4 width at 96dpi. Two DPI systems in one box: the reserved page came out
 * 794×842 (aspect 0.94) instead of 794×1122 (aspect 0.707), i.e. not the shape
 * of a sheet of paper. Mostly invisible in the PDF because unpainted jsPDF page
 * area is white and so is the letter — except in Creative, whose full-height
 * accent rail stretches to the container and so stopped 74mm short of the
 * bottom edge. The CV layouts already use 1122; this makes the two agree.
 */
export const A4_PAGE_PX = 1122;

/**
 * Page margin, in CSS px at 96dpi.
 *
 * 72px ≈ 0.75in. Business-letter convention is 1–1.25in and the DOCX export of
 * the same letter uses 1in, but the binding constraint here is measure, not
 * convention: at the old 48–56px side padding the body ran to ~110 characters
 * per line, against a typographic norm of 60–80. Wider margins are what buy the
 * shorter line — the padding is the mechanism, the line length is the point.
 */
export const PAGE_PAD_X = 72;
export const PAGE_PAD_Y = 64;

// ─── Font resolution ─────────────────────────────────────────────────────────

/**
 * Font stacks for the families the cover-letter editor offers.
 *
 * The bug this fixes: the editor stores a bare family name and the templates
 * dropped it straight into an inline `fontFamily`. Six of the seven choices are
 * system fonts and resolved fine — but the default and first option, Inter, is
 * loaded by next/font, which registers it under a generated name reachable only
 * through `--font-inter`. The plain string "Inter" matches nothing, and an
 * unmatched family list falls back to the browser's *standard* font, not to the
 * inherited stack. So the default cover letter was typeset in Times New Roman,
 * silently, for everyone who never touched the font control.
 *
 * Every entry ends in a generic so there is always a real family to land on.
 */
const FONT_STACKS: Record<string, string> = {
  // Webfonts loaded by next/font in the locale layout — reachable only by var.
  'Inter':            'var(--font-inter), system-ui, -apple-system, "Segoe UI", sans-serif',
  'Roboto':           'var(--font-roboto), system-ui, sans-serif',
  'Open Sans':        'var(--font-opensans), system-ui, sans-serif',
  'Montserrat':       'var(--font-montserrat), system-ui, sans-serif',
  'Lora':             'var(--font-lora), Georgia, serif',
  'Merriweather':     'var(--font-merriweather), Georgia, serif',
  'Playfair Display': 'var(--font-playfair), Georgia, serif',
  // System families. Named companions first, then the generic.
  'Arial':            'Arial, Helvetica, "Liberation Sans", sans-serif',
  'Helvetica':        'Helvetica, Arial, "Liberation Sans", sans-serif',
  'Verdana':          'Verdana, Geneva, DejaVu Sans, sans-serif',
  'Calibri':          'Calibri, Carlito, Candara, "Segoe UI", sans-serif',
  'Georgia':          'Georgia, "Liberation Serif", "Times New Roman", serif',
  'Times New Roman':  '"Times New Roman", Times, "Liberation Serif", Georgia, serif',
};

/** Families that should fall back to a serif when we don't recognise them. */
const SERIF_HINT = /serif|georgia|times|garamond|baskerville|caslon|book|roman|playfair|lora|merriweather/i;

/**
 * Turn whatever is stored in `styling.fontFamily` into a usable CSS stack.
 *
 * Accepts a bare family name ("Inter", "Times New Roman") or a stack, because
 * the templates' own former defaults were stacks ("Inter, sans-serif",
 * "Georgia, serif") and those values are sitting in real documents. Either way
 * the decision keys off the *first* family, so a stored "Inter, sans-serif"
 * resolves to the actual webfont rather than passing through unmatched.
 */
export function resolveFont(family?: string | null): string {
  const raw = (family ?? '').trim();
  if (!raw) return FONT_STACKS['Inter'];

  const head = raw.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const mapped = FONT_STACKS[head];
  if (mapped) return mapped;

  // Unknown family: quote it if it needs quoting, and append a generic so the
  // browser lands on something intentional instead of its standard font.
  const quoted = /\s/.test(head) ? `"${head}"` : head;
  return `${quoted}, ${SERIF_HINT.test(head) ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
}

/** Clamp a stored font size to something a letter can actually be read at. */
export function resolveFontSize(size?: string | null): string {
  const px = parseFloat(String(size ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(px) || px <= 0) return '14px';
  return `${Math.min(20, Math.max(11, px))}px`;
}

// ─── Token bundle ────────────────────────────────────────────────────────────

export interface CLTokens {
  /** Resolved CSS font stack. */
  font: string;
  /** Resolved, clamped base size. */
  fontSize: string;
  /** The accent exactly as chosen — for rules, bars and spines (not text). */
  accent: string;
  /** The accent, guaranteed readable as TEXT on white. */
  ink: string;
  /** The accent, guaranteed dark enough to carry white text as a PANEL. */
  band: string;
  /** A faint accent wash for callout backgrounds. */
  wash: string;
  /** A hairline in the accent, for rules that should read as brand. */
  hairline: string;
}

/**
 * Resolve one letter's styling into the values a template should actually use.
 *
 * The split between `accent`, `ink` and `band` is the important part. The accent
 * is a colour the user typed into a free `<input type="color">`, so it can be
 * anything including near-white and near-black. A 4px decorative rule can be
 * any of those and still read as a rule; the sender's own name cannot. Handing
 * templates one raw value and trusting each of them to think about contrast is
 * how a pale gold ended up rendering an illegible signature.
 */
export function getCLTokens(cl: Pick<CoverLetter, 'styling'>, fallbackAccent = '#1e3a5f'): CLTokens {
  const styling = cl.styling ?? ({} as CoverLetter['styling']);
  const accent = (styling.primaryColor || fallbackAccent).trim() || fallbackAccent;
  return {
    font: resolveFont(styling.fontFamily),
    fontSize: resolveFontSize(styling.fontSize),
    accent,
    // 4.5:1 — a name, a subject line and a sign-off are small body text, not
    // large display type, so they get the full text threshold.
    ink: readableOn(accent, '#ffffff', 4.5),
    band: ensureDarkSurface(accent, 5),
    wash: hexToRgba(accent, 0.07),
    hairline: hexToRgba(accent, 0.3),
  };
}
