import type { CV, CVSection, CVSectionType } from '@flacroncv/shared-types';
import type { CoverLetter } from '@flacroncv/shared-types';
import { getTokens, formatCVDate, referenceLines, genericItemParts, toHref } from '@/components/cv-builder/templates/shared';
import { cvDocLabels, cvDocDir, formatDocDateRange, resolveCVDocumentLocale } from '@/components/cv-builder/templates/document-locale';
import type { CLLabels } from '@/components/cover-letter/templates/types';
import { renderLayout, SIDEBAR_LEFT_TYPES, type LayoutDescriptor } from '@/lib/render-layout';
import { serializeCVToText } from '@/lib/serializeCV';
import {
  EN_COVER_LETTER_LABELS, RTL_LETTER_LOCALES, coverLetterSalutation, coverLetterScaffold,
  formatLetterDate, htmlToParagraphs, paragraphDirection,
} from '@/lib/export-cv-cover-letter';

// ─── Shared helpers (for PDF — image-based, pixel-perfect) ───────────────────

/** Clone a preview element off-screen at A4 width, ready for html2canvas */
function cloneForCapture(el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  // Use individual property setters — NOT cssText — so that existing inline
  // styles (padding, fontFamily, display, minHeight…) are preserved on the
  // root element. Replacing cssText would wipe `padding` (breaking available-
  // width for skills badges) and `display:flex` (collapsing SidebarLayout).
  //
  // position:absolute (not fixed) so html2canvas renders the element in the
  // normal document layer — fixed elements are clipped to windowHeight
  // internally, which silently truncates tall CVs.
  //
  // box-sizing:border-box makes width:794px the outer width (including padding),
  // matching the preview container which constrains the element from outside.
  clone.style.position   = 'absolute';
  clone.style.top        = '0';
  clone.style.left       = '-9999px';
  clone.style.width      = '794px';
  clone.style.boxSizing  = 'border-box';
  clone.style.overflow   = 'visible';
  clone.style.borderRadius = '0';
  clone.style.boxShadow  = 'none';
  clone.style.maxWidth   = 'none';
  clone.style.background = '#fff';
  document.body.appendChild(clone);
  return clone;
}

async function getHtml2Canvas() {
  const m = await import('html2canvas');
  return (typeof m.default === 'function' ? m.default
    : typeof (m as any).html2canvas === 'function' ? (m as any).html2canvas
    : m) as typeof import('html2canvas').default;
}

async function getJsPDF() {
  const m = await import('jspdf');
  return (typeof m.jsPDF === 'function' ? m.jsPDF
    : typeof (m as any).default === 'function' ? (m as any).default
    : m) as typeof import('jspdf').jsPDF;
}

/**
 * @param onClone Called with html2canvas's own copy of `el`, laid out inside
 *   its iframe, just before it is painted. Page breaks and link areas must be
 *   measured THERE: html2canvas re-lays the content out in that iframe, and
 *   positions measured in the page's copy drift from it by a fraction of a
 *   pixel per line — enough, a page down, for a "safe" break to cut a line.
 */
async function captureToCanvas(el: HTMLElement, onClone?: (cloned: HTMLElement) => void) {
  // Wait for all web fonts (Google Fonts, next/font) to finish loading before
  // capture — otherwise html2canvas falls back to system fonts and the PDF
  // looks different from the editor.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }
  const html2canvas = await getHtml2Canvas();
  // Read the full rendered height AFTER layout has settled. Passing it
  // explicitly prevents html2canvas from under-estimating canvas height for
  // very tall content (long description, many sections).
  const elHeight = el.scrollHeight || el.offsetHeight;
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    width: 794,
    height: elHeight,
    windowWidth: 794,
    windowHeight: elHeight,
    ...(onClone ? { onclone: (_doc: Document, cloned: HTMLElement) => onClone(cloned) } : {}),
  });
  return canvas;
}

// ─── Invisible text layer (makes the image-based PDF machine-readable) ───────
//
// The visible PDF is a rasterised screenshot of the preview, which is what gives
// it pixel-perfect fidelity with the editor — and what makes it completely
// unreadable to an applicant tracking system, because a PNG contains no text.
//
// Rather than swap to a different renderer (which would change how every
// existing user's PDF LOOKS), we add the document's text to the page in PDF
// rendering mode 3 — "neither fill nor stroke". The glyphs are positioned and
// recorded in the content stream, so `pdftotext`, an ATS parser, or Ctrl+F all
// find them, while nothing is painted. This is the same technique that makes a
// scanned PDF searchable. Visible output is byte-for-byte unchanged.

/**
 * Fold common typographic characters to their ASCII equivalents.
 *
 * jsPDF's built-in fonts are WinAnsi/Latin-1. Curly quotes, en/em dashes,
 * ellipses, bullets and the euro sign all sit OUTSIDE Latin-1 — and they are
 * everywhere in real CVs, both from ordinary typing and from our own AI output.
 * Rejecting text because it contained an em dash would have meant almost no CV
 * got a text layer, which is the opposite of the point (a unit test caught
 * exactly that). Fold them instead: the layer is never painted, and an ATS
 * reads "Engineer - Acme" just as happily as "Engineer \u2014 Acme".
 */
function toEncodableText(text: string): string {
  return text
    .replace(/[\u2010-\u2015\u2212]/g, '-')   // hyphens, en/em dash, minus
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, '...')                  // ellipsis
    .replace(/[\u2022\u2023\u25E6\u2043]/g, '-') // bullets
    .replace(/\u20AC/g, 'EUR')
    .replace(/\u2122/g, '(TM)')
    .replace(/\u2044/g, '/')
    .replace(/[\u2190-\u21FF]/g, '->')          // arrows
    .replace(/\u00A0/g, ' ');                    // non-breaking space
}

/**
 * True when (after folding) the text can be written with a built-in font.
 *
 * Arabic, Urdu and CJK cannot be: embedding them would emit mojibake into the
 * extraction stream, which is actively worse for a parser than no text layer at
 * all. Those documents keep today's behaviour until a subsetted Unicode font is
 * embedded — tracked separately for the client.
 */
function isEncodableByStandardFont(text: string): boolean {
  return !/[^\u0020-\u00FF\n\r\t]/.test(toEncodableText(text));
}

/**
 * Write `text` across the PDF's existing pages as invisible, extractable text.
 *
 * Lines are distributed proportionally across the pages that the image already
 * occupies, so global reading order is preserved and a per-page extractor sees
 * roughly the right content on the right page. Must be called AFTER all
 * addImage/addPage calls so the page count is final.
 */
function addInvisibleTextLayer(pdf: any, text: string, pageCount: number): void {
  const trimmed = (text || '').trim();
  if (!trimmed || pageCount < 1) return;

  if (!isEncodableByStandardFont(trimmed)) {
    // Arabic / Urdu / CJK CVs keep today's behaviour. Making these extractable
    // needs a subsetted Unicode font embedded in the PDF — a real but separate
    // piece of work, tracked for the client.
    console.debug('[exportToPDF] text layer skipped — content needs a Unicode font');
    return;
  }

  const encodable = toEncodableText(trimmed);
  const marginMm = 10;
  const usableW = pdf.internal.pageSize.getWidth() - marginMm * 2;
  const usableH = pdf.internal.pageSize.getHeight() - marginMm * 2;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const lineH = 3.6; // mm, comfortably fits ~9pt

  // Wrap to the usable width first so nothing is lost off the edge, then split
  // the resulting lines evenly across the pages.
  const wrapped: string[] = [];
  for (const raw of encodable.split('\n')) {
    if (!raw.trim()) {
      wrapped.push('');
      continue;
    }
    for (const piece of pdf.splitTextToSize(raw, usableW) as string[]) wrapped.push(piece);
  }

  const perPage = Math.max(1, Math.ceil(wrapped.length / pageCount));
  const maxLinesPerPage = Math.max(1, Math.floor(usableH / lineH));

  for (let page = 0; page < pageCount; page++) {
    const slice = wrapped.slice(page * perPage, (page + 1) * perPage);
    if (!slice.length) continue;
    pdf.setPage(page + 1);
    // Never overflow the page box; anything beyond is already covered by the
    // next page's slice in the common case.
    slice.slice(0, maxLinesPerPage).forEach((line, i) => {
      if (!line) return;
      pdf.text(line, marginMm, marginMm + i * lineH, {
        renderingMode: 'invisible',
        baseline: 'top',
      });
    });
  }
}

// ─── Paginated PDF rendering ─────────────────────────────────────────────────
//
// The preview is one tall element. It used to be captured as one canvas and
// placed on every page at a fixed A4 offset, so page breaks fell wherever 297mm
// happened to land — through the middle of a line of text — and continuation
// pages had no top or bottom margin. It was also embedded as a full 2x PNG on
// EVERY page (10–48 MB files).
//
// Now: measure where every line of text, image and link sits in the export
// clone, choose break points that fall in the gaps between them, and give each
// page its own JPEG slice with real margins.

/** A4 at the 794px capture width (96dpi): 794 × 297/210. */
const PAGE_W_PX = 794;
const PAGE_H_PX = (PAGE_W_PX * 297) / 210;
/** Margin above continuation pages and below every page break, in CSS px (~10.6mm). */
const PAGE_MARGIN_PX = 40;
/** A break may move up by at most this share of the page to find a clean gap. */
const MAX_PULLBACK = 0.4;
/**
 * html2canvas draws text 2–3px LOWER than the browser lays it out (see the
 * skills note in templates/shared.tsx). A text range's box is the font's
 * content area, which already sits ~1–2px outside the ink, so 2px below is
 * enough to keep pushed-down descenders on their page. Keep it small: lines
 * of a paragraph are only ~3–5px apart, and a larger slack merged every
 * paragraph into one unbreakable block — two-column layouts then had almost
 * no gap shared by both columns and the planner fell back to cutting a line.
 */
const LINE_SLACK_TOP = 0;
const LINE_SLACK_BOTTOM = 2;
/** How far below a keep-with-next element the keep-together zone extends (~two body lines). */
const KEEP_WITH_NEXT_PX = 44;

export interface PageSlice {
  /** Source range in the captured element, CSS px. */
  srcTop: number;
  srcBottom: number;
  /** Where the slice starts on the page (the top margin), CSS px. */
  destTop: number;
}

/** Merge [top, bottom] intervals into a sorted, non-overlapping list. */
function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Choose page slices for content `totalH` px tall.
 *
 * `busy` holds the vertical extents that must never be cut: every text line and
 * image, in EVERY column — a two-column layout's break must be clear of the
 * sidebar's lines as well as the main column's. `opts.soft` holds preferences
 * (a heading or job title plus the lines that follow it, the top of a card)
 * that should not end a page when that can be avoided.
 *
 * Each break is placed in a gap, preferring wide gaps (between items or
 * sections) over the narrow gap between two lines of a paragraph. Search order:
 *   1. hard + soft, in the bottom 40% of the page;
 *   2. hard + soft, anywhere below the top quarter (a stranded heading is
 *      worse than some unused page);
 *   3. hard only, anywhere below the top quarter, each soft hint a break
 *      would violate costing ~a third of a page (two columns rarely share a
 *      gap, so this picks the least-bad one rather than ignoring the hints);
 *   4. the point that cuts the FEWEST lines (only when no column ever has a
 *      common gap, e.g. a single element taller than a page).
 *
 * Page 1 starts at the top of the document (the layout has its own top padding);
 * later pages start below a top margin. Every page ends at least
 * PAGE_MARGIN_PX above the paper edge, except the last, which may use its full
 * height (its own bottom padding is part of the content).
 */
export function planPageSlices(
  totalH: number,
  busy: Array<[number, number]>,
  opts: { pageH?: number; margin?: number; soft?: Array<[number, number]> } = {},
): PageSlice[] {
  const pageH = opts.pageH ?? PAGE_H_PX;
  const margin = opts.margin ?? PAGE_MARGIN_PX;
  const clamp = (list: Array<[number, number]>) =>
    list.map(([a, b]) => [Math.max(0, a), Math.min(totalH, b)] as [number, number]);
  const hardRaw = clamp(busy);
  const hard = mergeIntervals(hardRaw);
  const softRaw = clamp(opts.soft ?? []);
  const withSoft = mergeIntervals([...hardRaw, ...softRaw]);
  const contentBottom = hard.length ? hard[hard.length - 1][1] : 0;

  const slices: PageSlice[] = [];
  let start = 0;
  // Hard stop so malformed input can never spin.
  for (let guard = 0; guard < 500 && start < totalH - 1; guard++) {
    const destTop = slices.length === 0 ? 0 : margin;
    const capacity = pageH - destTop - margin;
    const fitsWhole = totalH - start <= pageH - destTop;
    if (fitsWhole || contentBottom - start <= capacity) {
      slices.push({ srcTop: start, srcBottom: Math.min(totalH, start + pageH - destTop), destTop });
      break;
    }

    const limit = start + capacity;
    const window = start + capacity * (1 - MAX_PULLBACK);
    // Never pull a break above the top quarter: a near-empty page is worse.
    const anywhere = start + capacity * 0.25;
    const y = findGap(withSoft, start, window, limit)
      ?? findGap(withSoft, start, anywhere, limit)
      ?? findGap(hard, start, anywhere, limit, softRaw)
      ?? leastCut(hardRaw, window, limit);
    slices.push({ srcTop: start, srcBottom: y, destTop });
    start = y;
  }
  return slices;
}

/** Best free gap in merged `blocks` with its break point in [floor, limit], or null. */
function findGap(
  blocks: Array<[number, number]>, start: number, floor: number, limit: number,
  penalties: Array<[number, number]> = [],
): number | null {
  let best: { y: number; score: number } | null = null;
  // Free gaps are the spaces between merged blocks (and before the first).
  let prevEnd = start;
  for (const [a, b] of [...blocks, [Infinity, Infinity] as [number, number]]) {
    if (b <= start) { prevEnd = Math.max(prevEnd, b); continue; }
    const gapTop = Math.max(prevEnd, start);
    const gapBottom = a;
    if (gapTop > limit) break;
    const y = Math.min(gapBottom, limit);
    if (gapBottom > gapTop && y >= floor && y > gapTop) {
      // Wide gaps (between items or sections) are worth ~200px of unused
      // page over the 2–6px gap between two lines of one paragraph, so an
      // entry moves to the next page whole when that costs little space.
      const violated = penalties.filter(([pa, pb]) => y > pa && y < pb).length;
      const score = Math.min(gapBottom - gapTop, 48) * 4 - (limit - y) * 0.5 - violated * 180;
      if (!best || score > best.score) best = { y, score };
    }
    prevEnd = Math.max(prevEnd, b);
  }
  return best ? best.y : null;
}

/** The point in [floor, limit] inside the fewest intervals (latest on ties). */
function leastCut(intervals: Array<[number, number]>, floor: number, limit: number): number {
  const candidates = new Set<number>([limit]);
  for (const [a, b] of intervals) {
    if (a >= floor && a <= limit) candidates.add(a);
    if (b >= floor && b <= limit) candidates.add(b);
  }
  let best = limit;
  let bestCount = Infinity;
  for (const y of candidates) {
    const count = intervals.filter(([a, b]) => y > a && y < b).length;
    if (count < bestCount || (count === bestCount && y > best)) { best = y; bestCount = count; }
  }
  return best;
}

/**
 * What the planner must respect, measured in the export clone relative to it:
 * `hard` — every text line and image (all columns); `soft` — keep-together
 * hints from the templates.
 */
function measureBreakConstraints(root: HTMLElement): { hard: Array<[number, number]>; soft: Array<[number, number]> } {
  const origin = root.getBoundingClientRect().top;
  const hard: Array<[number, number]> = [];
  const soft: Array<[number, number]> = [];
  // The root may live in html2canvas's iframe: use ITS document.
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent || !node.textContent.trim()) continue;
    range.selectNodeContents(node);
    // One rect per rendered line of this text node.
    for (const r of Array.from(range.getClientRects())) {
      if (r.height <= 0 || r.width <= 0) continue;
      hard.push([r.top - origin - LINE_SLACK_TOP, r.bottom - origin + LINE_SLACK_BOTTOM]);
    }
  }
  root.querySelectorAll('img, svg, canvas').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0) hard.push([r.top - origin, r.bottom - origin]);
  });
  // Headings and item title/subtitle rows mark themselves `data-pdf-keep-next`:
  // they should not end a page without at least the next ~two lines. When the
  // row opens a bordered card (`data-pdf-card`), the card's top edge and
  // padding come with it, so a page never ends on an empty card frame.
  root.querySelectorAll('[data-pdf-keep-next]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    let top = r.top;
    const card = el.closest('[data-pdf-card]');
    if (card) {
      const cardTop = card.getBoundingClientRect().top;
      if (r.top - cardTop < 40) top = cardTop;
    }
    soft.push([top - origin - LINE_SLACK_TOP, r.bottom - origin + KEEP_WITH_NEXT_PX]);
  });
  // A card's bottom padding and border belong with its last line: breaking
  // inside it left a sliver of empty card frame at the top of the next page.
  root.querySelectorAll('[data-pdf-card]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0) soft.push([r.bottom - origin - 24, r.bottom - origin + 1]);
  });
  return { hard, soft };
}

interface LinkRect { url: string; left: number; top: number; width: number; height: number }

/** Every `[data-pdf-link]` element's boxes (one per line it wraps onto). */
function measureLinks(root: HTMLElement): LinkRect[] {
  const box = root.getBoundingClientRect();
  const out: LinkRect[] = [];
  root.querySelectorAll<HTMLElement>('[data-pdf-link]').forEach((el) => {
    const url = el.getAttribute('data-pdf-link');
    if (!url) return;
    for (const r of Array.from(el.getClientRects())) {
      if (r.width <= 0 || r.height <= 0) continue;
      out.push({ url, left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height });
    }
  });
  return out;
}

/**
 * Replace native list markers with real text in the export clone.
 *
 * html2canvas paints `li` markers itself, at the browser's baseline, but draws
 * the item's text 2–3px lower — so every bullet floated above its line. A text
 * bullet is drawn by the same code path as the words beside it and lands on
 * the same baseline. Only the throwaway clone is touched.
 */
function textualiseListMarkers(root: HTMLElement): void {
  root.querySelectorAll('li').forEach((li) => {
    const cs = getComputedStyle(li);
    if (cs.display !== 'list-item' || cs.listStyleType === 'none') return;
    const list = li.parentElement;
    const ordered = list?.tagName === 'OL';
    let text = '•';
    if (ordered && list) {
      const start = Number(list.getAttribute('start')) || 1;
      text = `${Array.from(list.children).filter((c) => c.tagName === 'LI').indexOf(li) + start}.`;
    } else if (cs.listStyleType === 'circle') {
      text = '◦';
    } else if (cs.listStyleType === 'square') {
      text = '▪';
    }
    const marker = document.createElement('span');
    marker.textContent = text;
    marker.setAttribute('aria-hidden', 'true');
    const rtl = cs.direction === 'rtl';
    // Sits in the space the native "outside" marker occupied.
    Object.assign(marker.style, {
      position: 'absolute',
      top: '0',
      width: ordered ? '2.4em' : '1.2em',
      textAlign: rtl ? 'left' : 'right',
      [rtl ? 'right' : 'left']: ordered ? '-2.9em' : '-1.6em',
    });
    li.style.listStyleType = 'none';
    li.style.position = 'relative';
    li.insertBefore(marker, li.firstChild);
  });
}

/** Rows sampled (in canvas px) to find each column's background next to a page edge. */
const BG_BAND = 48;

/**
 * Per-column background colour of `rows` canvas rows starting at `y0`: for each
 * x, the most frequent colour in that band, so text and anti-aliasing inside the
 * band are ignored. Returns a 1px-high canvas to stretch over a margin. Falls
 * back to the plain edge row if the pixels cannot be read.
 */
function backgroundRow(src: HTMLCanvasElement, y0: number, rows: number): HTMLCanvasElement {
  const W = src.width;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = 1;
  const octx = out.getContext('2d');
  const sctx = src.getContext('2d');
  const top = Math.max(0, Math.min(src.height - 1, Math.round(y0)));
  const h = Math.max(1, Math.min(Math.round(rows), src.height - top));
  if (!octx) return out;
  try {
    if (!sctx) throw new Error('no context');
    const band = sctx.getImageData(0, top, W, h).data;
    const row = octx.createImageData(W, 1);
    for (let x = 0; x < W; x++) {
      const counts = new Map<number, number>();
      let bestKey = 0;
      let bestCount = -1;
      for (let y = 0; y < h; y++) {
        const i = (y * W + x) * 4;
        if (band[i + 3] < 250) continue; // partly transparent edge pixel
        const key = (band[i] << 16) | (band[i + 1] << 8) | band[i + 2];
        const c = (counts.get(key) ?? 0) + 1;
        counts.set(key, c);
        if (c > bestCount) { bestCount = c; bestKey = key; }
      }
      const o = x * 4;
      if (bestCount < 0) bestKey = 0xffffff;
      row.data[o] = (bestKey >> 16) & 255;
      row.data[o + 1] = (bestKey >> 8) & 255;
      row.data[o + 2] = bestKey & 255;
      row.data[o + 3] = 255;
    }
    octx.putImageData(row, 0, 0);
  } catch {
    octx.drawImage(src, 0, top, W, 1, 0, 0, W, 1);
  }
  return out;
}

/**
 * Vertical extents (CSS px) of every row of the capture that carries ink: a
 * pixel that differs from its column's background (the `bg` row). Thin
 * vertical rules — card edges, a timeline rail — touch only a few pixels per
 * row and are ignored, so the space between two lines inside a card still
 * counts as a gap. Returns null when the pixels cannot be read.
 */
function rasterInkIntervals(canvas: HTMLCanvasElement, bg: HTMLCanvasElement): Array<[number, number]> | null {
  try {
    const ctx = canvas.getContext('2d');
    const bctx = bg.getContext('2d');
    if (!ctx || !bctx) return null;
    const W = canvas.width;
    const H = canvas.height;
    const scale = W / PAGE_W_PX;
    const back = bctx.getImageData(0, 0, W, 1).data;
    // More than this many differing pixels in a row is text (or a rule).
    const minInk = Math.max(4, Math.round(8 * scale));
    const out: Array<[number, number]> = [];
    let runStart = -1;
    const CHUNK = 256;
    for (let y0 = 0; y0 < H; y0 += CHUNK) {
      const h = Math.min(CHUNK, H - y0);
      const data = ctx.getImageData(0, y0, W, h).data;
      for (let y = 0; y < h; y++) {
        let count = 0;
        const row = y * W * 4;
        for (let x = 0; x < W && count <= minInk; x++) {
          const i = row + x * 4;
          const o = x * 4;
          if (Math.abs(data[i] - back[o]) > 40 || Math.abs(data[i + 1] - back[o + 1]) > 40 || Math.abs(data[i + 2] - back[o + 2]) > 40) count++;
        }
        const inked = count > minInk;
        const yy = y0 + y;
        if (inked && runStart < 0) runStart = yy;
        if (!inked && runStart >= 0) { out.push([runStart / scale - 1, yy / scale + 1]); runStart = -1; }
      }
    }
    if (runStart >= 0) out.push([runStart / scale - 1, H / scale]);
    return out;
  } catch {
    return null;
  }
}

/**
 * How far below its DOM line box html2canvas actually drew the text: the
 * median distance from each measured line to the ink run that starts closest
 * below it. Used to move DOM-derived hints and link areas onto the pixels.
 */
function estimateRasterOffset(domLines: Array<[number, number]>, ink: Array<[number, number]>): number {
  const samples: number[] = [];
  for (const [a] of domLines) {
    let best = Infinity;
    for (const [ia] of ink) {
      const d = ia - a;
      if (d >= -2 && d < best) best = d;
      if (ia > a + 16) break;
    }
    if (best <= 14) samples.push(best);
  }
  if (!samples.length) return 0;
  samples.sort((x, y) => x - y);
  // Ink starts a few px below the box top (the ascender room); the planner
  // only needs the shift of the box itself, so take that room back out.
  return Math.max(0, samples[Math.floor(samples.length / 2)] - 2);
}

/** JPEG quality for page images: text stays crisp at 2x, a page is ~200–400 KB. */
const JPEG_QUALITY = 0.9;

/**
 * Capture `clone` and write it to a paginated A4 PDF. Returns the PDF and the
 * page count so callers can add the invisible text layer.
 */
async function renderPaginatedPdf(clone: HTMLElement): Promise<{ pdf: any; pageCount: number }> {
  textualiseListMarkers(clone);
  // Measured inside html2canvas's own laid-out copy (see captureToCanvas), so
  // breaks and link areas match the pixels exactly. The page-side clone is the
  // fallback should onclone ever not run.
  type Measured = { totalH: number; hard: Array<[number, number]>; soft: Array<[number, number]>; links: LinkRect[] };
  const box: { m: Measured | null } = { m: null };
  const measure = (el: HTMLElement): Measured => {
    const { hard, soft } = measureBreakConstraints(el);
    box.m = { totalH: el.scrollHeight || el.offsetHeight, hard, soft, links: measureLinks(el) };
    return box.m;
  };

  const jsPDF = await getJsPDF();
  const canvas = await captureToCanvas(clone, measure);
  const { totalH, hard: domHard, soft: domSoft, links: domLinks } = box.m ?? measure(clone);
  const scale = canvas.width / PAGE_W_PX;

  // Each column's plain background, read from the bottom of the capture: every
  // layout ends in its own padding there, so that band holds only the page
  // and sidebar colours — no text, no card borders, no heading bars. (Reading
  // it next to each break instead extended whatever crossed the break — a card
  // edge, a heading bar — up or down through the margin.)
  const bgBand = Math.min(BG_BAND, canvas.height - 3);
  const pageBackground = backgroundRow(canvas, canvas.height - 3 - bgBand, bgBand);

  // What must never be cut is read from the PIXELS: every row that carries ink
  // in any column. html2canvas draws text a font- and line-height-dependent
  // 2–9px below where the browser measures it, so DOM line boxes alone cannot
  // guarantee a clean break. The DOM still supplies the keep-together hints and
  // link areas, shifted by the offset measured between the two.
  const ink = rasterInkIntervals(canvas, pageBackground);
  const offset = ink ? estimateRasterOffset(domHard, ink) : 0;
  const hard = ink ?? domHard;
  // Hints start where their box starts (borders and card edges are drawn where
  // the DOM says; only text moves down) and end below the shifted text.
  const soft = domSoft.map(([a, b]) => [a, b + offset] as [number, number]);
  const links = domLinks.map((l) => ({ ...l, top: l.top + offset }));
  const slices = planPageSlices(totalH, hard, { soft });
  // compress: deflate the content streams (text layer, link annotations).
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const mmPerPx = pdfW / PAGE_W_PX;

  const page = document.createElement('canvas');
  page.width = canvas.width;
  page.height = Math.round(PAGE_H_PX * scale);
  const ctx = page.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  slices.forEach((slice, i) => {
    if (i > 0) pdf.addPage();
    const W = canvas.width;
    const srcTop = Math.round(slice.srcTop * scale);
    let srcH = Math.max(1, Math.min(canvas.height, Math.round(slice.srcBottom * scale)) - srcTop);
    // The capture's last couple of rows are partly transparent (fractional
    // element height); drawn as-is they left a hairline seam above the fill.
    if (srcTop + srcH >= canvas.height - 1 && srcH > 4) srcH -= 2;
    const destTop = Math.round(slice.destTop * scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.drawImage(canvas, 0, srcTop, W, srcH, 0, destTop, W, srcH);
    // Margins continue each column's background (a sidebar's colour, a white
    // page). Never stretch the slice's edge row: that smeared any glyph or
    // border it touched into a streak across the margin.
    ctx.imageSmoothingEnabled = false;
    if (destTop > 0) ctx.drawImage(pageBackground, 0, 0, W, 1, 0, 0, W, destTop);
    const below = page.height - (destTop + srcH);
    if (below > 0) ctx.drawImage(pageBackground, 0, 0, W, 1, 0, destTop + srcH, W, below);
    ctx.imageSmoothingEnabled = true;
    pdf.addImage(page.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');

    // Image PDFs have no text to click, so lay a link annotation over every
    // email/website/profile/project URL that starts on this page.
    for (const link of links) {
      if (link.top < slice.srcTop || link.top >= slice.srcBottom) continue;
      const y = link.top - slice.srcTop + slice.destTop;
      pdf.link(link.left * mmPerPx, y * mmPerPx, link.width * mmPerPx, link.height * mmPerPx, { url: link.url });
    }
  });

  return { pdf, pageCount: slices.length };
}

/**
 * Internals exposed for unit testing only.
 *
 * The exported functions above all require a live DOM + html2canvas, so the text
 * layer and the page planner — the parts with real logic and real consequences
 * if they break — would otherwise be untestable.
 */
export const __testables = { addInvisibleTextLayer, isEncodableByStandardFont, buildCVDocx, buildCoverLetterDocx, planPageSlices, htmlToParagraphs, estimateRasterOffset };

// ─── PDF Export ───────────────────────────────────────────────────────────────
export async function exportToPDF(cv: CV, _sections: CVSection[], locale: string = 'en'): Promise<void> {
  console.debug(`[exportToPDF] locale=${locale}, layout=${(cv.styling as any)?.layout || 'classic'}`);
  const sourceEl = document.getElementById('cv-preview-content');
  if (!sourceEl) throw new Error('CV preview not found — please keep the editor open while exporting.');

  const clone = cloneForCapture(sourceEl);
  // Give the browser extra time to fully lay out the clone before capture.
  await new Promise((r) => setTimeout(r, 300));

  try {
    const { pdf, pageCount } = await renderPaginatedPdf(clone);

    // Make the exported CV readable by applicant tracking systems without
    // altering a single visible pixel. Uses the same serialiser the ATS-check
    // feature already feeds, so what a recruiter's parser sees matches what our
    // own ATS score was calculated from.
    addInvisibleTextLayer(pdf, serializeCVToText(cv, _sections || []), pageCount);

    pdf.save(`${cv.title || 'CV'}.pdf`);
  } finally {
    document.body.removeChild(clone);
  }
}

// ─── CV DOCX helpers ──────────────────────────────────────────────────────────

// ── Map web font names → Word-safe equivalents ──────────────────────────────
const DOCX_FONT_MAP: Record<string, string> = {
  'Inter': 'Calibri', 'Roboto': 'Arial', 'Lato': 'Calibri',
  'Open Sans': 'Arial', 'Montserrat': 'Calibri', 'Raleway': 'Calibri',
  'Nunito': 'Calibri', 'Poppins': 'Calibri', 'Merriweather': 'Georgia',
  'Playfair Display': 'Times New Roman', 'Source Serif Pro': 'Georgia',
  'Lora': 'Georgia', 'PT Serif': 'Georgia', 'EB Garamond': 'Garamond',
  'Garamond': 'Garamond', 'Georgia': 'Georgia',
  'Times New Roman': 'Times New Roman', 'Calibri': 'Calibri', 'Arial': 'Arial',
};
function docxFont(fontFamily?: string): string {
  return DOCX_FONT_MAP[fontFamily || 'Inter'] ?? 'Calibri';
}

function hexColor(color: string): string {
  return color.replace('#', '').slice(0, 6);
}

// ── Unit conversion: screen-px → DOCX units ──────────────────────────────────
// 96 dpi screen → 72 dpi print: 1px = 0.75pt
// DOCX font size  = half-points → px × 1.5
// DOCX paragraph spacing = twips → px × 15
function pxToHalfPt(px: number): number { return Math.round(px * 1.5); }
function pxToTwips(px: number): number   { return Math.round(px * 15);  }

// ── Line-spacing constants — keyed to React template lineHeight values ────────
// Word default "Normal" paragraph style uses 1.15× (276 twips). We set EVERY
// paragraph explicitly so Word cannot override with its own defaults.
//
// Mapping: browser CSS lineHeight → DOCX line (240 = 1× single spacing)
//   1.0×  (tight — headers, meta)  → 240
//   1.15× (normal body)            → 276   ← Word's "Normal" baseline
//   1.4×  (comfortable)            → 336
//   1.65× (descriptions)           → 396   ← matches lineHeight:1.65 in ItemRenderer
//   1.75× (summaries)              → 420   ← matches lineHeight:1.75 in Classic/Sidebar
const LS = {
  tight:   240,
  normal:  276,
  body:    396,
  summary: 420,
} as const;

// ── Labels interface — passed from caller via next-intl t() ──────────────────
// Eliminates the static translation table; DOCX uses same strings as the editor.
export interface DocxLabels {
  professionalSummary: string;
  profile: string;
  contact: string;
  aboutMe: string;
  summary: string;
}

type Tokens = ReturnType<typeof getTokens>;

// ── Paragraph factory ─────────────────────────────────────────────────────────
// Wraps new d.Paragraph() and injects:
//   • explicit line spacing    → prevents Word 1.15× default drift
//   • contextualSpacing: false → prevents Word silently removing paragraph
//                                spacing when adjacent paragraphs share a style
//
// Usage: para(d, { children: [...], spacing: { line: LS.body, ... }, ...rest })
//
// `docxBuild` is the document being built right now. Construction is
// synchronous between the `import('docx')` await and Packer, so module state is
// safe here and avoids threading the direction and language through every one
// of the ~40 paragraph call sites.
const docxBuild = { rtl: false, lang: 'en' };

function para(d: any, opts: { children: any[]; spacing?: Record<string, any>; [k: string]: any }): any {
  const { spacing = {}, ...rest } = opts;
  return new d.Paragraph({
    contextualSpacing: false,
    // An Arabic/Urdu CV opens right-to-left in Word, like its preview and PDF.
    ...(docxBuild.rtl ? { bidirectional: true } : {}),
    ...rest,
    spacing: {
      line:     LS.normal,   // safe default; override via spacing.line
      lineRule: 'auto',
      ...spacing,
    },
  });
}

// ── Text block helper ─────────────────────────────────────────────────────────
function nl2paras(d: any, text: string, halfPtSize: number, lineSpacing: number, color?: string): any[] {
  if (!text) return [];
  const runOpts: any = { size: halfPtSize };
  if (color) runOpts.color = color;
  return text.split(/\n+/).filter(Boolean).map((line: string) =>
    para(d, {
      children: [new d.TextRun({ text: line, ...runOpts })],
      spacing: { line: lineSpacing, after: pxToTwips(4) },
    })
  );
}

// ── Section heading — all 4 sectionStyle variants ────────────────────────────
function sectionHeadingDocx(d: any, title: string, color: string, tokens: Tokens): any {
  const hexCol = hexColor(color);
  const size   = pxToHalfPt(tokens.fs.sectionTitle);
  const before = pxToTwips(tokens.sp.section);
  const after  = pxToTwips(8);

  if (tokens.sectionStyle === 'card') {
    return para(d, {
      children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: 'FFFFFF' })],
      shading: { fill: hexCol, type: 'clear' as any, color: 'auto' },
      spacing: { line: LS.tight, before, after: pxToTwips(10) },
    });
  }
  if (tokens.sectionStyle === 'left-border') {
    return para(d, {
      children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: hexCol })],
      border: { left: { style: d.BorderStyle.SINGLE, size: 18, color: hexCol } },
      indent: { left: pxToTwips(8) },
      spacing: { line: LS.tight, before, after },
    });
  }
  if (tokens.sectionStyle === 'minimal') {
    return para(d, {
      children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: '666666' })],
      border: { bottom: { style: d.BorderStyle.SINGLE, size: 4, color: 'e5e5e5' } },
      spacing: { line: LS.tight, before, after },
    });
  }
  // default: underline
  return para(d, {
    children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: hexCol })],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: hexCol } },
    spacing: { line: LS.tight, before, after },
  });
}

// ── Sidebar section heading ───────────────────────────────────────────────────
function sidebarSectionHeadingDocx(d: any, title: string, tokens: Tokens): any {
  return para(d, {
    children: [new d.TextRun({
      text: title.toUpperCase(), bold: true,
      size: pxToHalfPt(tokens.fs.sectionTitle - 1), color: 'FFFFFF',
    })],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 4, color: 'FFFFFF' } },
    spacing: { line: LS.tight, before: pxToTwips(tokens.sp.section * 0.75), after: pxToTwips(6) },
  });
}

// ── Table cell factory ────────────────────────────────────────────────────────
// Sets verticalAlign: TOP on every cell so Word doesn't auto-center content.
function cell(d: any, opts: { children: any[]; width?: number; shading?: any; margins?: any; borders?: any }): any {
  return new d.TableCell({
    verticalAlign: (d.VerticalAlign?.TOP ?? 'top') as any,
    ...opts,
    borders: opts.borders ?? {
      top: { style: 'nil' as any, size: 0, color: 'auto' },
      bottom: { style: 'nil' as any, size: 0, color: 'auto' },
      left: { style: 'nil' as any, size: 0, color: 'auto' },
      right: { style: 'nil' as any, size: 0, color: 'auto' },
      insideHorizontal: { style: 'nil' as any, size: 0, color: 'auto' },
      insideVertical: { style: 'nil' as any, size: 0, color: 'auto' },
    },
    ...(opts.width !== undefined ? { width: { size: opts.width, type: d.WidthType.PERCENTAGE } } : {}),
  });
}

// ── Section item paragraphs ───────────────────────────────────────────────────
// Uses para() for every paragraph — explicit line spacing, no contextual spacing.
function buildCVSectionParagraphs(
  d: any, section: CVSection, color: string,
  tokens: Tokens, variant: 'default' | 'sidebar' = 'default',
): any[] {
  const { fs, sp } = tokens;
  const paras: any[] = [];
  const type = section.type as string;

  const textColor   = variant === 'sidebar' ? 'FFFFFF' : undefined;
  const dimColor    = variant === 'sidebar' ? 'CCCCCC' : '666666';
  const metaColor   = variant === 'sidebar' ? 'CCCCCC' : '888888';
  const accentColor = variant === 'sidebar' ? 'FFFFFF' : hexColor(color);

  const itemBefore = pxToTwips(sp.item + 2);
  const itemAfter  = pxToTwips(4);

  // ── Skills: grouped inline rows (4 per row) ─────────────────────────────────
  if (type === 'skills') {
    const items = (section.items || []) as any[];
    for (let i = 0; i < items.length; i += 4) {
      const row = items.slice(i, i + 4);
      const runs: any[] = [];
      row.forEach((it: any, j: number) => {
        const lv = it.level ? ` (${it.level})` : '';
        runs.push(new d.TextRun({ text: `${it.name}${lv}`, size: pxToHalfPt(fs.name), color: textColor, bold: true }));
        if (j < row.length - 1)
          runs.push(new d.TextRun({ text: '   ·   ', size: pxToHalfPt(fs.name), color: dimColor }));
      });
      paras.push(para(d, { children: runs, spacing: { line: LS.normal, after: pxToTwips(sp.item) } }));
    }
    return paras;
  }

  // ── Languages: grouped inline rows (3 per row) ──────────────────────────────
  if (type === 'languages') {
    const items = (section.items || []) as any[];
    for (let i = 0; i < items.length; i += 3) {
      const row = items.slice(i, i + 3);
      const runs: any[] = [];
      row.forEach((it: any, j: number) => {
        const prof = it.proficiency ? ` — ${it.proficiency}` : '';
        runs.push(new d.TextRun({ text: `${it.name}${prof}`, size: pxToHalfPt(fs.name), color: textColor }));
        if (j < row.length - 1)
          runs.push(new d.TextRun({ text: '   ·   ', size: pxToHalfPt(fs.name), color: dimColor }));
      });
      paras.push(para(d, { children: runs, spacing: { line: LS.normal, after: pxToTwips(sp.item) } }));
    }
    return paras;
  }

  for (const item of (section.items || [])) {
    const it = item as any;

    if (type === 'experience' || type === 'volunteer') {
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: it.position || it.title || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.company  ? new d.TextRun({ text: `  •  ${it.company}`,  size: pxToHalfPt(fs.name), color: accentColor }) : null,
          it.location ? new d.TextRun({ text: `  |  ${it.location}`, size: pxToHalfPt(fs.meta), color: dimColor    }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: itemBefore, after: itemAfter },
      }));
      const dates = formatDocDateRange(it.startDate, it.endDate, docxBuild.lang, { current: !!it.isCurrent, openEndedIsPresent: true });
      if (dates) paras.push(para(d, {
        children: [new d.TextRun({ text: dates, size: pxToHalfPt(fs.meta), italics: true, color: metaColor })],
        spacing: { line: LS.tight, after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), LS.body, textColor));
      for (const h of (it.highlights || [])) paras.push(para(d, {
        children: [new d.TextRun({ text: `• ${h}`, size: pxToHalfPt(fs.body), color: textColor })],
        spacing: { line: LS.body, after: itemAfter },
      }));
    } else if (type === 'education') {
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: [it.degree, it.field].filter(Boolean).join(' in ') || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.institution ? new d.TextRun({ text: `  •  ${it.institution}`, size: pxToHalfPt(fs.name), color: accentColor }) : null,
          it.location    ? new d.TextRun({ text: `  |  ${it.location}`,    size: pxToHalfPt(fs.meta), color: dimColor    }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: itemBefore, after: itemAfter },
      }));
      const dates = formatDocDateRange(it.startDate, it.endDate, docxBuild.lang);
      if (dates) paras.push(para(d, {
        children: [new d.TextRun({ text: dates, size: pxToHalfPt(fs.meta), italics: true, color: metaColor })],
        spacing: { line: LS.tight, after: itemAfter },
      }));
      if (it.gpa) paras.push(para(d, {
        children: [new d.TextRun({ text: `${cvDocLabels(docxBuild.lang).gpa}: ${it.gpa}`, size: pxToHalfPt(fs.body), color: textColor })],
        spacing: { line: LS.normal, after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), LS.body, textColor));
    } else if (type === 'projects') {
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.url ? new d.TextRun({ text: '  ', size: pxToHalfPt(fs.meta) }) : null,
          it.url ? docxLinkRun(d, it.url, { size: pxToHalfPt(fs.meta), color: accentColor }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: itemBefore, after: itemAfter },
      }));
      const dates = formatDocDateRange(it.startDate, it.endDate, docxBuild.lang);
      if (dates) paras.push(para(d, {
        children: [new d.TextRun({ text: dates, size: pxToHalfPt(fs.meta), italics: true, color: metaColor })],
        spacing: { line: LS.tight, after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), LS.body, textColor));
      if (it.technologies?.length) paras.push(para(d, {
        children: [new d.TextRun({ text: `${cvDocLabels(docxBuild.lang).technologies}: ${it.technologies.join(', ')}`, size: pxToHalfPt(fs.meta), italics: true, color: textColor })],
        spacing: { line: LS.normal, after: itemAfter },
      }));
    } else if (type === 'certifications') {
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.issuer ? new d.TextRun({ text: `  •  ${it.issuer}`, size: pxToHalfPt(fs.name), color: dimColor   }) : null,
          it.date   ? new d.TextRun({ text: `  |  ${formatCVDate(it.date, docxBuild.lang)}`,   size: pxToHalfPt(fs.meta), color: metaColor  }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: pxToTwips(sp.item), after: itemAfter },
      }));
      // Expiry, credential ID and URL — the same lines the preview prints
      // (genericItemParts); they were collected by the editor and then dropped.
      for (const line of genericItemParts(it, 'certifications', docxBuild.lang).lines) {
        if (line.kind === 'subtitle') continue; // issuer is already on the title line
        paras.push(para(d, {
          children: [line.kind === 'link'
            ? docxLinkRun(d, line.text, { size: pxToHalfPt(fs.meta), color: accentColor })
            : new d.TextRun({ text: line.text, size: pxToHalfPt(fs.meta), color: metaColor })],
          spacing: { line: LS.normal, after: itemAfter },
        }));
      }
    } else if (type === 'references') {
      // Same lines as the preview (referenceLines): name, "title, company",
      // "email · phone", relationship — empty ones dropped. Phone and
      // relationship used to be missing from the DOCX.
      const ref = referenceLines(it);
      const lines: Array<{ text: string; run: Record<string, unknown> }> = [];
      if (ref.name)         lines.push({ text: ref.name,         run: { bold: true, size: pxToHalfPt(fs.headline), color: textColor } });
      if (ref.role)         lines.push({ text: ref.role,         run: { size: pxToHalfPt(fs.name), color: dimColor } });
      if (ref.contact)      lines.push({ text: ref.contact,      run: { size: pxToHalfPt(fs.body), color: accentColor } });
      if (ref.relationship) lines.push({ text: ref.relationship, run: { size: pxToHalfPt(fs.body), italics: true, color: metaColor } });
      lines.forEach((line, idx) => paras.push(para(d, {
        children: [new d.TextRun({ text: line.text, ...line.run })],
        spacing: idx === 0
          ? { line: LS.normal, before: pxToTwips(sp.item), after: itemAfter }
          : { line: LS.normal, after: itemAfter },
      })));
    } else {
      // custom / awards / publications
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: it.title || it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.subtitle ? new d.TextRun({ text: `  •  ${it.subtitle}`, size: pxToHalfPt(fs.name), color: dimColor  }) : null,
          it.date     ? new d.TextRun({ text: `  |  ${formatCVDate(it.date, docxBuild.lang)}`,     size: pxToHalfPt(fs.meta), color: metaColor }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: pxToTwips(sp.item), after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), LS.body, textColor));
    }
  }

  return paras;
}

// ─── Layout-aware DOCX builders ──────────────────────────────────────────────
// Each builder receives the LayoutDescriptor so section routing comes from the
// same renderLayout() function used by (and matching) the React templates.

const NoBorder  = { style: 'nil' as any, size: 0, color: 'auto' };
const NoBorders = {
  top: NoBorder, bottom: NoBorder, left: NoBorder, right: NoBorder,
  insideHorizontal: NoBorder, insideVertical: NoBorder,
};

function docxLocation(info: CV['personalInfo'] | undefined): string {
  const cityPostal = [info?.city, info?.postalCode].filter(Boolean).join(' ');
  return [info?.address, cityPostal, info?.country].filter(Boolean).join(', ');
}

/**
 * A run that is a real, clickable hyperlink when the text is an email address,
 * phone number or URL (the same rule as the PDF's link areas), and plain text
 * otherwise — a location or a free-text "website" stays a TextRun.
 */
function docxLinkRun(d: any, text: string, runOpts: Record<string, unknown>): any {
  const value = text.trim();
  const href = /@/.test(value) ? toHref('email', value)
    : /^[+\d][\d\s().-]{4,}$/.test(value) ? toHref('phone', value)
    : toHref('url', value);
  const run = new d.TextRun({ text, ...runOpts });
  if (!href || !d.ExternalHyperlink) return run;
  return new d.ExternalHyperlink({ link: href, children: [run] });
}

function docxContactParts(info: CV['personalInfo'] | undefined): string[] {
  return [
    info?.email, info?.phone, docxLocation(info) || undefined,
    info?.linkedin, info?.website, info?.github,
  ].filter(Boolean) as string[];
}

function docxLinkParts(info: CV['personalInfo'] | undefined): string[] {
  return [info?.linkedin, info?.website, info?.github].filter(Boolean) as string[];
}

// ── Classic ──────────────────────────────────────────────────────────────────
function buildClassicChildren(
  d: any, cv: CV, layout: LayoutDescriptor, color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const name = [cv.personalInfo?.firstName, cv.personalInfo?.lastName].filter(Boolean).join(' ') || cv.title;
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  const contactParts = docxContactParts(info);

  const children: any[] = [];

  children.push(para(d, {
    children: [new d.TextRun({ text: name, bold: true, size: pxToHalfPt(fs.nameHero), color: hexColor(color) })],
    alignment: d.AlignmentType.CENTER,
    spacing: { line: LS.tight, after: pxToTwips(5) },
  }));
  if (info?.headline) children.push(para(d, {
    children: [new d.TextRun({ text: info.headline, size: pxToHalfPt(fs.headline), color: '555555' })],
    alignment: d.AlignmentType.CENTER,
    spacing: { line: LS.tight, after: pxToTwips(5) },
  }));
  if (contactParts.length) children.push(para(d, {
    children: contactParts.flatMap((part, i) => [
      docxLinkRun(d, part, { size: pxToHalfPt(fs.body), color: '888888' }),
      i < contactParts.length - 1 ? new d.TextRun({ text: '  ·  ', size: pxToHalfPt(fs.body), color: '999999' }) : null,
    ]).filter(Boolean) as any[],
    alignment: d.AlignmentType.CENTER,
    spacing: { line: LS.tight, after: pxToTwips(6) },
  }));
  children.push(para(d, {
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: hexColor(color) } },
    spacing: { line: LS.tight, after: pxToTwips(sp.section) },
  }));

  if (info?.summary) {
    children.push(sectionHeadingDocx(d, labels.professionalSummary, color, tokens));
    children.push(...nl2paras(d, info.summary, pxToHalfPt(fs.name), LS.summary));
  }
  // sections come from the layout descriptor — same as React template
  for (const section of layout.columns[0].sections) {
    children.push(sectionHeadingDocx(d, section.title, color, tokens));
    children.push(...buildCVSectionParagraphs(d, section, color, tokens));
  }
  return children;
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function buildSidebarChildren(
  d: any, cv: CV, layout: LayoutDescriptor, color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  const leftCol  = layout.columns[0];  // 30% colored
  const rightCol = layout.columns[1];  // 70% white
  const initials = ((info?.firstName?.[0] ?? '') + (info?.lastName?.[0] ?? '')).toUpperCase();
  const nameParts = [info?.firstName, info?.lastName].filter(Boolean) as string[];

  // ── Left cell paragraphs ──
  const leftParas: any[] = [];

  if (initials) leftParas.push(para(d, {
    children: [new d.TextRun({ text: initials, bold: true, size: pxToHalfPt(fs.nameTop), color: hexColor(color) })],
    alignment: d.AlignmentType.CENTER,
    shading: { fill: 'FFFFFF', type: 'clear' as any, color: 'auto' },
    border: {
      top:    { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
      bottom: { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
      left:   { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
      right:  { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
    },
    spacing: { line: LS.tight, after: pxToTwips(10) },
  }));
  leftParas.push(para(d, {
    children: nameParts.map((part, i) =>
      new d.TextRun({ text: part, bold: true, size: pxToHalfPt(fs.nameTop), color: 'FFFFFF', break: i > 0 ? 1 : 0 })
    ),
    alignment: d.AlignmentType.CENTER,
    spacing: { line: LS.tight, after: pxToTwips(5) },
  }));
  if (info?.headline) leftParas.push(para(d, {
    children: [new d.TextRun({ text: info.headline, size: pxToHalfPt(fs.body), color: 'E0E0E0' })],
    alignment: d.AlignmentType.CENTER,
    spacing: { line: LS.normal, after: pxToTwips(sp.section * 0.5) },
  }));

  leftParas.push(sidebarSectionHeadingDocx(d, labels.contact, tokens));
  const contactLines = docxContactParts(info);
  for (const line of contactLines) leftParas.push(para(d, {
    children: [docxLinkRun(d, line, { size: pxToHalfPt(fs.body), color: 'E0E0E0' })],
    spacing: { line: LS.normal, after: pxToTwips(3) },
  }));

  // Sidebar sections from layout descriptor
  for (const section of leftCol.sections) {
    leftParas.push(sidebarSectionHeadingDocx(d, section.title, tokens));
    leftParas.push(...buildCVSectionParagraphs(d, section, color, tokens, 'sidebar'));
  }

  // ── Right cell paragraphs ──
  const rightParas: any[] = [];
  if (info?.summary) {
    rightParas.push(sectionHeadingDocx(d, labels.profile, color, tokens));
    rightParas.push(...nl2paras(d, info.summary, pxToHalfPt(fs.name), LS.summary));
  }
  for (const section of rightCol.sections) {
    rightParas.push(sectionHeadingDocx(d, section.title, color, tokens));
    rightParas.push(...buildCVSectionParagraphs(d, section, color, tokens));
  }
  if (leftParas.length  === 0) leftParas.push(para(d,  { children: [] }));
  if (rightParas.length === 0) rightParas.push(para(d, { children: [] }));

  return [new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [new d.TableRow({
      children: [
        cell(d, {
          children: leftParas,
          width: leftCol.widthPct,
          shading: { fill: hexColor(color), type: 'clear' as any, color: 'auto' },
          margins: {
            top:    pxToTwips(leftCol.pad.top),
            bottom: pxToTwips(leftCol.pad.bottom),
            left:   pxToTwips(leftCol.pad.left),
            right:  pxToTwips(leftCol.pad.right),
          },
        }),
        cell(d, {
          children: rightParas,
          width: rightCol.widthPct,
          margins: {
            top:    pxToTwips(rightCol.pad.top),
            bottom: pxToTwips(rightCol.pad.bottom),
            left:   pxToTwips(rightCol.pad.left),
            right:  pxToTwips(rightCol.pad.right),
          },
        }),
      ],
    })],
  })];
}

// ── Top-Bar ──────────────────────────────────────────────────────────────────
function buildTopBarChildren(
  d: any, cv: CV, layout: LayoutDescriptor, color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  const col = layout.columns[0];
  const name = [info?.firstName, info?.lastName].filter(Boolean).join(' ') || cv.title;
  const contactParts = [
    info?.email, info?.phone, docxLocation(info) || undefined,
  ].filter(Boolean) as string[];
  const linkParts = docxLinkParts(info);

  const children: any[] = [];

  // Colored header band
  const headerParas: any[] = [
    para(d, {
      children: [new d.TextRun({ text: name, bold: true, size: pxToHalfPt(fs.nameHero), color: 'FFFFFF' })],
      spacing: { line: LS.tight, after: pxToTwips(5) },
    }),
  ];
  if (info?.headline) headerParas.push(para(d, {
    children: [new d.TextRun({ text: info.headline, size: pxToHalfPt(fs.headline), color: 'E8E8E8' })],
    spacing: { line: LS.tight, after: pxToTwips(5) },
  }));
  if (contactParts.length) headerParas.push(para(d, {
    children: contactParts.flatMap((part, i) => [
      docxLinkRun(d, part, { size: pxToHalfPt(fs.body), color: 'DDDDDD' }),
      i < contactParts.length - 1 ? new d.TextRun({ text: '   |   ', size: pxToHalfPt(fs.body), color: 'AAAAAA' }) : null,
    ]).filter(Boolean) as any[],
    spacing: { line: LS.tight, after: pxToTwips(3) },
  }));
  if (linkParts.length) headerParas.push(para(d, {
    children: linkParts.flatMap((part, i) => [
      docxLinkRun(d, part, { size: pxToHalfPt(fs.meta), color: 'BBBBBB' }),
      i < linkParts.length - 1 ? new d.TextRun({ text: '   ·   ', size: pxToHalfPt(fs.meta), color: '888888' }) : null,
    ]).filter(Boolean) as any[],
    spacing: { line: LS.tight, after: 0 },
  }));

  children.push(new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [new d.TableRow({
      children: [cell(d, {
        children: headerParas,
        shading: { fill: hexColor(color), type: 'clear' as any, color: 'auto' },
        margins: {
          top: pxToTwips(sp.headerPad), bottom: pxToTwips(sp.headerPad),
          left: pxToTwips(sp.pad),      right:  pxToTwips(sp.pad),
        },
      })],
    })],
  }));

  children.push(para(d, {
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 8, color: hexColor(color) } },
    spacing: { line: LS.tight, before: 0, after: pxToTwips(sp.section) },
  }));

  if (info?.summary) {
    children.push(sectionHeadingDocx(d, labels.aboutMe, color, tokens));
    children.push(...nl2paras(d, info.summary, pxToHalfPt(fs.name), LS.summary));
  }
  for (const section of col.sections) {
    children.push(sectionHeadingDocx(d, section.title, color, tokens));
    children.push(...buildCVSectionParagraphs(d, section, color, tokens));
  }
  return children;
}

// ── Compact ──────────────────────────────────────────────────────────────────
function buildCompactChildren(
  d: any, cv: CV, layout: LayoutDescriptor, color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  const leftCol  = layout.columns[0];  // 60%
  const rightCol = layout.columns[1];  // 40%
  // tightSp mirrors CompactLayout.tsx
  const tightSp     = { ...sp, section: Math.round(sp.section * 0.85), item: Math.round(sp.item * 0.8) };
  const tightTokens = { ...tokens, sp: tightSp };
  const name = [info?.firstName, info?.lastName].filter(Boolean).join(' ') || cv.title;
  const contactParts = docxContactParts(info);

  const children: any[] = [];

  // Inline header
  const headerRuns: any[] = [
    new d.TextRun({ text: name, bold: true, size: pxToHalfPt(fs.nameTop), color: hexColor(color) }),
  ];
  if (info?.headline) headerRuns.push(new d.TextRun({ text: `   ${info.headline}`, size: pxToHalfPt(fs.name), color: '666666' }));
  children.push(para(d, { children: headerRuns, spacing: { line: LS.tight, after: pxToTwips(4) } }));

  if (contactParts.length) children.push(para(d, {
    children: contactParts.flatMap((part, i) => [
      docxLinkRun(d, part, { size: pxToHalfPt(fs.body), color: '888888' }),
      i < contactParts.length - 1 ? new d.TextRun({ text: '  ·  ', size: pxToHalfPt(fs.body), color: 'AAAAAA' }) : null,
    ]).filter(Boolean) as any[],
    spacing: { line: LS.tight, after: 0 },
  }));

  children.push(para(d, {
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: hexColor(color) } },
    spacing: { line: LS.tight, before: pxToTwips(tightSp.item + 2), after: pxToTwips(tightSp.section) },
  }));

  if (info?.summary) {
    children.push(sectionHeadingDocx(d, labels.summary, color, tightTokens));
    children.push(...nl2paras(d, info.summary, pxToHalfPt(fs.body), LS.summary));
  }

  // Build column content from layout descriptor sections
  const buildColParas = (col: typeof leftCol): any[] => {
    const paras: any[] = [];
    for (const section of col.sections) {
      paras.push(sectionHeadingDocx(d, section.title, color, tightTokens));
      paras.push(...buildCVSectionParagraphs(d, section, color, tightTokens));
    }
    if (paras.length === 0) paras.push(para(d, { children: [] }));
    return paras;
  };

  children.push(new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [new d.TableRow({
      children: [
        cell(d, {
          children: buildColParas(leftCol),
          width:    leftCol.widthPct,
          margins:  { top: 0, bottom: 0, left: 0, right: pxToTwips(leftCol.pad.right) },
        }),
        cell(d, {
          children: buildColParas(rightCol),
          width:    rightCol.widthPct,
          margins:  { top: 0, bottom: 0, left: pxToTwips(rightCol.pad.left), right: 0 },
        }),
      ],
    })],
  }));

  return children;
}

// ─── Main DOCX builder ────────────────────────────────────────────────────────
/**
 * @param labels   Optional heading overrides. By default the headings, dates and
 *                 "Present" follow the CV's own document language — the same
 *                 resolution the preview uses — so the DOCX matches the PDF.
 * @param uiLocale The interface locale, used only when the CV's language cannot
 *                 be told from its content (see resolveCVDocumentLocale).
 */
async function buildCVDocx(cv: CV, sections: CVSection[], labels?: DocxLabels, uiLocale = 'en'): Promise<Blob> {
  const docxModule = await import('docx');
  const d = (docxModule.Document ? docxModule : (docxModule as any).default ?? docxModule) as typeof docxModule;

  const color  = cv.styling?.primaryColor || '#2563eb';
  const toTwip = (in_: number) =>
    (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(in_) : Math.round(in_ * 1440);

  // ── Single source of truth: compute tokens + layout once ─────────────────────
  const tokens  = getTokens(cv);
  const { fs }  = tokens;
  const font    = docxFont((cv.styling as any)?.fontFamily);

  // renderLayout() gives the same column structure as the React templates.
  // All builders consume the descriptor; section routing happens here only.
  const visibleSections = (sections || [])
    .filter((s) => s.isVisible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const descriptor = renderLayout(cv, visibleSections, tokens);

  const docLocale = resolveCVDocumentLocale(cv, visibleSections, uiLocale);
  const docLabels = cvDocLabels(docLocale.lang);
  const L: DocxLabels = labels ?? {
    professionalSummary: docLabels.professionalSummary,
    profile: docLabels.profile,
    contact: docLabels.contact,
    aboutMe: docLabels.aboutMe,
    summary: docLabels.summary,
  };
  docxBuild.rtl = cvDocDir(docLocale.lang) === 'rtl';
  docxBuild.lang = docLocale.lang;
  try {
    return await d.Packer.toBlob(buildCVDocument(d, cv, descriptor, color, tokens, L, toTwip, font, fs));
  } finally {
    docxBuild.rtl = false;
    docxBuild.lang = 'en';
  }
}

function buildCVDocument(
  d: any, cv: CV, descriptor: LayoutDescriptor, color: string, tokens: Tokens, labels: DocxLabels,
  toTwip: (inches: number) => number, font: string, fs: Tokens['fs'],
): any {
  const layoutType = descriptor.layoutType;
  let children: any[];
  let margin: { top: number; bottom: number; left: number; right: number };

  switch (layoutType) {
    // Slate-Gold uses the same two-column [left, right] descriptor as Sidebar,
    // so it must use the sidebar builder — the classic default only reads
    // columns[0] and would drop every right-column section (experience,
    // education, projects, references, custom).
    case 'sidebar':
    case 'slate-gold':
      margin   = { top: toTwip(0.5), bottom: toTwip(0.75), left: toTwip(0.4), right: toTwip(0.4) };
      children = buildSidebarChildren(d, cv, descriptor, color, tokens, labels);
      break;
    case 'top-bar':
      margin   = { top: toTwip(0.4), bottom: toTwip(0.75), left: toTwip(0.5), right: toTwip(0.5) };
      children = buildTopBarChildren(d, cv, descriptor, color, tokens, labels);
      break;
    case 'compact':
      margin   = { top: toTwip(0.5), bottom: toTwip(0.75), left: toTwip(0.75), right: toTwip(0.75) };
      children = buildCompactChildren(d, cv, descriptor, color, tokens, labels);
      break;
    default: // classic
      margin   = { top: toTwip(0.75), bottom: toTwip(0.75), left: toTwip(0.9), right: toTwip(0.9) };
      children = buildClassicChildren(d, cv, descriptor, color, tokens, labels);
  }

  const bodySize = pxToHalfPt(fs.body);

  const doc = new d.Document({
    styles: {
      default: {
        // Document-level defaults — all paragraphs inherit unless overridden
        document: {
          run: { font, size: bodySize, color: '222222' },
          paragraph: {
            spacing: { line: LS.normal, lineRule: 'auto' as any },
          },
        },
      },
      // Override Word built-in heading styles → prevent blue/bold defaults
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: bodySize, font },
          paragraph: { spacing: { line: LS.normal, before: 0, after: 0 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: bodySize, font },
          paragraph: { spacing: { line: LS.normal, before: 0, after: 0 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: bodySize, font },
          paragraph: { spacing: { line: LS.normal, before: 0, after: 0 } } },
      ],
    },
    sections: [{ properties: { page: { margin } }, children }],
  });

  return doc;
}

// ─── DOCX Export ─────────────────────────────────────────────────────────────
export async function exportToDocx(cv: CV, sections: CVSection[], locale: string, labels?: DocxLabels): Promise<void> {
  console.debug(`[exportToDocx] layout=${(cv.styling as any)?.layout || 'classic'}`);
  const blob = await buildCVDocx(cv, sections, labels, locale);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${cv.title || 'CV'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Cover Letter PDF Export ──────────────────────────────────────────────────
export async function exportCoverLetterToPDF(title: string): Promise<void> {
  const sourceEl = document.getElementById('cl-preview-content');
  if (!sourceEl) throw new Error('Cover letter preview not found.');

  // Read the rendered text straight off the preview BEFORE cloning, so the
  // invisible text layer matches exactly what the reader sees — including the
  // localised salutation, date and closing the templates generate. `innerText`
  // (not textContent) respects line breaks and skips hidden nodes.
  const previewText = (sourceEl as HTMLElement).innerText || sourceEl.textContent || '';

  const clone = cloneForCapture(sourceEl);
  // Give the browser extra time to fully lay out the clone before capture.
  await new Promise((r) => setTimeout(r, 300));

  try {
    // Same paginated JPEG pipeline as the CV (was a full 2x PNG per page,
    // ~10 MB for a one-page letter), including the text bullets fix.
    const { pdf, pageCount } = await renderPaginatedPdf(clone);

    addInvisibleTextLayer(pdf, previewText, pageCount);

    pdf.save(`${title || 'cover-letter'}.pdf`);
  } finally {
    document.body.removeChild(clone);
  }
}

// ─── Cover Letter DOCX Export (editable) ─────────────────────────────────────

export interface CoverLetterDocxOptions {
  /**
   * The letter labels the preview renders with — build them with
   * `coverLetterLabels(useTranslations('coverLetters'))`. Without them the
   * scaffolding falls back to English.
   */
  labels?: CLLabels;
  /** Letter locale (date format and direction). Defaults to the page's `<html lang>`. */
  locale?: string;
  /**
   * The template actually rendered (after the plan fallback). Picks the subject
   * prefix and closing; defaults to the stored templateId.
   */
  templateId?: string;
}

async function buildCoverLetterDocx(coverLetter: CoverLetter, opts: CoverLetterDocxOptions = {}): Promise<Blob> {
  const docxModule = await import('docx');
  const d = (docxModule.Document ? docxModule : (docxModule as any).default ?? docxModule) as typeof docxModule;

  const labels = opts.labels ?? EN_COVER_LETTER_LABELS;
  const locale = opts.locale
    || (typeof document !== 'undefined' ? document.documentElement.lang : '')
    || 'en';
  const rtl = RTL_LETTER_LOCALES.includes(locale.split('-')[0]);
  const { subjectPrefix, closing } = coverLetterScaffold(
    opts.templateId ?? coverLetter.templateId,
    labels,
    coverLetter.recipientName,
  );

  const color = coverLetter.styling?.primaryColor || '#2563eb';
  const senderName = coverLetter.styling?.senderName || '';
  const senderEmail = coverLetter.styling?.senderEmail || '';
  const today = formatLetterDate(locale);

  // Every paragraph carries the letter's direction, so an Arabic or Urdu letter
  // opens right-to-left in Word, matching the preview and the PDF.
  const p = (runs: any[], spacing: Record<string, number> = {}, isRtl = rtl) => new d.Paragraph({
    children: runs,
    spacing,
    ...(isRtl ? { bidirectional: true } : {}),
  });
  const run = (text: string, o: Record<string, unknown> = {}, isRtl = rtl) =>
    new d.TextRun({ text, ...(isRtl ? { rightToLeft: true } : {}), ...o });

  const children: any[] = [];

  // ── Sender block ──
  if (senderName) children.push(p([run(senderName, { bold: true, size: 28, color: hexColor(color) })], { after: 60 }));
  if (senderEmail) children.push(p([run(senderEmail, { size: 20, color: '555555' })], { after: 60 }));

  // ── Date ──
  children.push(p([run(today, { size: 20, color: '555555' })], { before: 240, after: 240 }));

  // ── Recipient block ──
  if (coverLetter.recipientName) children.push(p([run(coverLetter.recipientName, { bold: true, size: 22 })], { after: 60 }));
  for (const line of [coverLetter.recipientTitle, coverLetter.companyName, coverLetter.companyAddress]) {
    if (line) children.push(p([run(line, { size: 20 })], { after: 60 }));
  }

  // ── Subject line — the template's own wording ("Position:", "RE:", …) ──
  if (coverLetter.jobTitle) {
    children.push(p([
      run(`${subjectPrefix} `, { bold: true, size: 20 }),
      run(coverLetter.jobTitle, { size: 20, color: hexColor(color) }),
    ], { before: 240, after: 240 }));
  }

  // ── Greeting ──
  children.push(p([run(coverLetterSalutation(labels, coverLetter.recipientName), { size: 22 })], { after: 200 }));

  // ── Body ──
  // Each body paragraph takes its direction from its own text, like the
  // preview's dir="auto": an English paragraph in an Arabic letter stays LTR.
  for (const text of htmlToParagraphs(coverLetter.content)) {
    const paraRtl = paragraphDirection(text) ? paragraphDirection(text) === 'rtl' : rtl;
    children.push(p([run(text, { size: 22 }, paraRtl)], { after: 160 }, paraRtl));
  }

  // ── Closing ──
  children.push(p([run(closing, { size: 22 })], { before: 240, after: 400 }));
  if (senderName) children.push(p([run(senderName, { bold: true, size: 22, color: hexColor(color) })], { after: 60 }));
  if (senderEmail) children.push(p([run(senderEmail, { size: 20, color: '555555' })]));

  const inch = (n: number) => ((d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(n) : Math.round(n * 1440));
  const doc = new d.Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: inch(1), bottom: inch(1), left: inch(1.25), right: inch(1.25) },
        },
      },
      children,
    }],
  });

  return d.Packer.toBlob(doc);
}

export async function exportCoverLetterToDocx(coverLetter: CoverLetter, opts: CoverLetterDocxOptions = {}): Promise<void> {
  const blob = await buildCoverLetterDocx(coverLetter, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${coverLetter.title || 'cover-letter'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
