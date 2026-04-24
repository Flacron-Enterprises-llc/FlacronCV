/**
 * Layout Engine — Single Source of Truth for CV column structure.
 *
 * renderLayout(cv, sections, tokens) → LayoutDescriptor
 *
 * This is the canonical mapping of "which sections go in which column".
 * ALL output formats derive from this:
 *   - React templates (implicitly — they use the same filter constants)
 *   - DOCX builder    (explicitly — imports and calls renderLayout)
 *   - PDF             (implicitly — captures the React DOM)
 *
 * If column assignments ever need to change, change them HERE ONLY.
 */

import type { CV, CVSection } from '@flacroncv/shared-types';
import type { getTokens } from '@/components/cv-builder/templates/shared';

// ── Column type constants — mirror React template source exactly ──────────────

/**
 * SidebarLayout.tsx → splitSections():
 * const SIDEBAR_SECTION_TYPES = new Set(['skills','languages','certifications','awards'])
 * sidebar = sections.filter(s => SIDEBAR_SECTION_TYPES.has(s.type))  ← LEFT column
 * main    = sections.filter(s => !SIDEBAR_SECTION_TYPES.has(s.type)) ← RIGHT column
 */
export const SIDEBAR_LEFT_TYPES = new Set([
  'skills', 'languages', 'certifications', 'awards',
]);

/**
 * CompactLayout.tsx:
 * const RIGHT_TYPES = new Set([CVSectionType.SKILLS, CVSectionType.EDUCATION, ...])
 * leftSections  = sections.filter(s => !RIGHT_TYPES.has(s.type)) ← LEFT  60%
 * rightSections = sections.filter(s =>  RIGHT_TYPES.has(s.type)) ← RIGHT 40%
 */
export const COMPACT_RIGHT_TYPES = new Set([
  'skills', 'education', 'languages', 'certifications', 'awards', 'references',
]);

// ── Descriptor types ──────────────────────────────────────────────────────────

export type LayoutType = 'classic' | 'sidebar' | 'top-bar' | 'compact' | 'slate-gold';

/** One column's worth of layout data */
export interface ColumnDescriptor {
  sections: CVSection[];
  /** Width as percentage of total page width */
  widthPct: number;
  /** Solid fill colour (sidebar left column only) */
  background?: string;
  /** True → text colours invert (white on dark background) */
  isSidebar: boolean;
  /** Inner padding in px — maps to DOCX table cell margins via pxToTwips() */
  pad: { top: number; bottom: number; left: number; right: number };
}

export interface LayoutDescriptor {
  layoutType: LayoutType;
  /**
   * Ordered columns:
   *   single-column layouts → 1 entry  (classic, top-bar)
   *   two-column layouts    → 2 entries [left, right]  (sidebar, compact)
   */
  columns: ColumnDescriptor[];
  /**
   * When true, personalInfo.summary is rendered ABOVE the column area at full
   * width (classic / top-bar / compact).
   * When false, summary lives inside the right column (sidebar).
   */
  summaryAboveColumns: boolean;
  /**
   * For two-column layouts: the gap between columns in px.
   * Matches the React template gap value.
   */
  columnGap: number;
}

// ─────────────────────────────────────────────────────────────────────────────

type Tokens = ReturnType<typeof getTokens>;

/**
 * Compute the layout descriptor for a CV.
 * Call once per export — the result is deterministic.
 */
export function renderLayout(
  cv: CV,
  sections: CVSection[],
  tokens: Tokens,
): LayoutDescriptor {
  const layout = ((cv.styling as any)?.layout || 'classic') as LayoutType;
  const { sp } = tokens;
  const color  = cv.styling?.primaryColor || '#2563eb';

  switch (layout) {

    // ── Sidebar — 30 / 70 ─────────────────────────────────────────────────────
    // Left:  skills / languages / certifications / awards (colored background)
    // Right: everything else + summary
    case 'sidebar': {
      const left  = sections.filter(s => SIDEBAR_LEFT_TYPES.has(s.type));
      const right = sections.filter(s => !SIDEBAR_LEFT_TYPES.has(s.type));
      return {
        layoutType: 'sidebar',
        summaryAboveColumns: false,
        columnGap: 0,
        columns: [
          {
            sections:   left,
            widthPct:   30,
            background: color,
            isSidebar:  true,
            pad: {
              top:    sp.headerPad,
              bottom: sp.headerPad,
              left:   Math.round(sp.pad * 0.6),
              right:  Math.round(sp.pad * 0.6),
            },
          },
          {
            sections:  right,
            widthPct:  70,
            isSidebar: false,
            pad: {
              top:    sp.headerPad,
              bottom: sp.headerPad,
              left:   Math.round(sp.pad * 0.75),
              right:  Math.round(sp.pad * 0.75),
            },
          },
        ],
      };
    }

    // ── Compact — 60 / 40 ─────────────────────────────────────────────────────
    // Left:  experience / projects / volunteer + other non-right types
    // Right: skills / education / languages / certifications / awards / references
    // Summary: full-width above columns
    case 'compact': {
      // Mirrors CompactLayout.tsx: tightSp = { section: sp.section * 0.85 }
      const tSection = Math.round(sp.section * 0.85);
      const left  = sections.filter(s => !COMPACT_RIGHT_TYPES.has(s.type));
      const right = sections.filter(s =>  COMPACT_RIGHT_TYPES.has(s.type));
      return {
        layoutType: 'compact',
        summaryAboveColumns: true,
        columnGap: 20,
        columns: [
          {
            sections:  left,
            widthPct:  60,
            isSidebar: false,
            pad: { top: tSection, bottom: tSection, left: 0, right: 20 },
          },
          {
            sections:  right,
            widthPct:  40,
            isSidebar: false,
            pad: { top: tSection, bottom: tSection, left: 20, right: 0 },
          },
        ],
      };
    }

    // ── Slate-Gold — 30 / 70, dark slate sidebar ──────────────────────────────
    // Same column split as Sidebar but sidebar background is fixed slate (#1a2332).
    // Summary lives in the right (main) column, not above.
    case 'slate-gold': {
      const left  = sections.filter(s => SIDEBAR_LEFT_TYPES.has(s.type));
      const right = sections.filter(s => !SIDEBAR_LEFT_TYPES.has(s.type));
      return {
        layoutType: 'slate-gold',
        summaryAboveColumns: false,
        columnGap: 0,
        columns: [
          {
            sections:   left,
            widthPct:   30,
            background: '#1a2332',
            isSidebar:  true,
            pad: {
              top:    sp.headerPad,
              bottom: sp.headerPad,
              left:   Math.round(sp.pad * 0.55),
              right:  Math.round(sp.pad * 0.55),
            },
          },
          {
            sections:  right,
            widthPct:  70,
            isSidebar: false,
            pad: {
              top:    sp.headerPad,
              bottom: sp.headerPad,
              left:   Math.round(sp.pad * 0.85),
              right:  Math.round(sp.pad * 0.85),
            },
          },
        ],
      };
    }

    // ── Top-bar — single column ────────────────────────────────────────────────
    // Header: full-width colored band
    // Body:   single column; summary above sections
    case 'top-bar':
      return {
        layoutType: 'top-bar',
        summaryAboveColumns: true,
        columnGap: 0,
        columns: [{
          sections:  sections,
          widthPct:  100,
          isSidebar: false,
          pad: { top: sp.section, bottom: sp.section, left: sp.pad, right: sp.pad },
        }],
      };

    // ── Classic (default) — single column ─────────────────────────────────────
    // Centered header; summary above sections
    default:
      return {
        layoutType: 'classic',
        summaryAboveColumns: true,
        columnGap: 0,
        columns: [{
          sections:  sections,
          widthPct:  100,
          isSidebar: false,
          pad: { top: sp.pad, bottom: sp.pad, left: sp.pad, right: sp.pad },
        }],
      };
  }
}
