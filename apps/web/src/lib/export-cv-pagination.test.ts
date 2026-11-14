/**
 * PDF page planning and cover-letter text extraction (`__testables`).
 *
 * The planner decides where a tall CV is cut into A4 pages. It used to cut at
 * fixed 297mm steps, straight through lines of text, with no margin on
 * continuation pages. These tests pin the rules that replace that.
 */
import { describe, it, expect } from 'vitest';
import { __testables } from './export-cv';

const { planPageSlices, htmlToParagraphs } = __testables;

const PAGE = 1000;
const MARGIN = 40;
const opts = { pageH: PAGE, margin: MARGIN };

/** Lines of `h` px every `pitch` px from `from` to `to`. */
function lines(from: number, to: number, pitch = 20, h = 14): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = from; y + h <= to; y += pitch) out.push([y, y + h]);
  return out;
}

function cutsThrough(y: number, busy: Array<[number, number]>): boolean {
  return busy.some(([a, b]) => y > a && y < b);
}

describe('planPageSlices', () => {
  it('keeps a document that fits on one page as one slice', () => {
    const slices = planPageSlices(PAGE, lines(40, 900), opts);
    expect(slices).toEqual([{ srcTop: 0, srcBottom: PAGE, destTop: 0 }]);
  });

  it('never breaks inside a line, and leaves margins on every page', () => {
    const busy = lines(40, 2600, 21, 15);
    const slices = planPageSlices(2650, busy, opts);
    expect(slices.length).toBeGreaterThan(2);
    slices.forEach((s, i) => {
      if (i < slices.length - 1) expect(cutsThrough(s.srcBottom, busy)).toBe(false);
      // Page 1 starts at the document's own top; later pages get a top margin.
      expect(s.destTop).toBe(i === 0 ? 0 : MARGIN);
      // Content never reaches the bottom margin (except the final page's tail).
      if (i < slices.length - 1) expect(s.destTop + (s.srcBottom - s.srcTop)).toBeLessThanOrEqual(PAGE - MARGIN);
    });
    // Slices are contiguous: nothing is lost or duplicated.
    for (let i = 1; i < slices.length; i++) expect(slices[i].srcTop).toBe(slices[i - 1].srcBottom);
  });

  it('prefers a wide gap between items over the gap between two lines', () => {
    // Two "items" of dense lines with a 30px gap at 800–830, then more content.
    const busy = [...lines(0, 800, 18, 14), ...lines(830, 1900, 18, 14)];
    const [first] = planPageSlices(1900, busy, opts);
    // The page limit is 960 (1000 - 40 margin). The 830 item boundary is in
    // the window, so the break lands there rather than at the last line gap.
    expect(first.srcBottom).toBe(830);
  });

  it('falls back to a cut at the page limit when one element is taller than the window', () => {
    // A single unbroken block (e.g. an image) from 100 to 1800.
    const slices = planPageSlices(1900, [[100, 1800]], opts);
    expect(slices[0].srcBottom).toBe(PAGE - MARGIN);
    expect(slices.length).toBeGreaterThan(1);
  });

  it('respects gaps that are free in every column (two-column layouts)', () => {
    // Left column lines at one pitch, right column at another: a break must be
    // clear of both.
    const left = lines(0, 2000, 22, 15);
    const right = lines(5, 2000, 17, 12);
    const busy = [...left, ...right];
    const slices = planPageSlices(2000, busy, opts);
    slices.slice(0, -1).forEach((s) => {
      // Either a clean gap was found, or (no common gap) the fallback limit.
      const clean = !cutsThrough(s.srcBottom, busy);
      const fallback = s.srcBottom === s.srcTop + (PAGE - s.destTop - MARGIN);
      expect(clean || fallback).toBe(true);
    });
  });

  it('terminates on empty or degenerate input', () => {
    expect(planPageSlices(0, [], opts)).toEqual([]);
    expect(planPageSlices(5000, [], opts).length).toBeGreaterThan(0);
  });
});

describe('htmlToParagraphs (cover-letter DOCX body)', () => {
  it('decodes every HTML entity exactly once', () => {
    expect(htmlToParagraphs('<p>It&#39;s &quot;great&quot; &amp; done</p>')).toEqual(['It\'s "great" & done']);
    // "&amp;lt;" is the literal text "&lt;" — it must not become "<".
    expect(htmlToParagraphs('<p>Use &amp;lt;b&amp;gt; tags</p>')).toEqual(['Use &lt;b&gt; tags']);
    expect(htmlToParagraphs('<p>Caf&eacute;&nbsp;Paris</p>')).toEqual(['Café Paris']);
  });

  it('keeps paragraphs, list items and line breaks as separate paragraphs', () => {
    const html = '<p>Dear team,</p><ul><li>One</li><li>Two &amp; three</li></ul><p>Line one<br>Line two</p>';
    expect(htmlToParagraphs(html)).toEqual(['Dear team,', '• One', '• Two & three', 'Line one', 'Line two']);
  });

  it('handles plain newline-separated text and empty input', () => {
    expect(htmlToParagraphs('First para\n\nSecond para')).toEqual(['First para', 'Second para']);
    expect(htmlToParagraphs('')).toEqual([]);
    expect(htmlToParagraphs(undefined)).toEqual([]);
  });
});

describe('planPageSlices — two columns and soft hints', () => {
  it('moves the break up to a gap that is free in BOTH columns rather than cutting a sidebar line', () => {
    // Main column: dense lines all the way down. Sidebar: a list whose lines
    // interleave with the main column's gaps near the bottom, so the only
    // common gap is at 500–520 (above the 40% window, below the top quarter).
    const main = [...lines(0, 500, 20, 15), ...lines(520, 2000, 20, 15)];
    const side = [...lines(0, 500, 20, 15), ...lines(522, 2000, 20, 15).map(([a, b]) => [a + 8, b + 8] as [number, number])];
    const busy = [...main, ...side];
    const [first] = planPageSlices(2000, busy, opts);
    expect(cutsThrough(first.srcBottom, busy)).toBe(false);
    expect(first.srcBottom).toBe(520);
  });

  it('when no column ever has a common gap, cuts the fewest lines', () => {
    // Two columns whose lines overlap everywhere except single points.
    const busy: Array<[number, number]> = [...lines(0, 2000, 20, 20), ...lines(10, 2000, 20, 20)];
    const [first] = planPageSlices(2000, busy, opts);
    const cut = busy.filter(([a, b]) => first.srcBottom > a && first.srcBottom < b).length;
    expect(cut).toBeLessThanOrEqual(1);
  });

  it('keeps a soft "keep with next" zone together when it can', () => {
    // A title at 930–950 whose keep-together zone runs to 994: the break must
    // fall before the title (gap at 920–930), not after it.
    const busy = [...lines(0, 920, 20, 15), [930, 950] as [number, number], ...lines(960, 2000, 20, 15)];
    const soft: Array<[number, number]> = [[929, 994]];
    const [first] = planPageSlices(2000, busy, { ...opts, soft });
    expect(first.srcBottom).toBeLessThanOrEqual(930);
    expect(first.srcBottom).toBeGreaterThan(900);
  });
});

describe('htmlToParagraphs — editor list markup', () => {
  it('keeps bullets and numbers for <li><p>…</p></li> (what the editor stores)', () => {
    const html = '<ul><li><p>Led payments</p></li><li><p>Mentored &amp; hired</p></li></ul>'
      + '<ol><li><p>First</p></li><li><p>Second</p><ul><li><p>Nested</p></li></ul></li></ol>';
    expect(htmlToParagraphs(html)).toEqual(['• Led payments', '• Mentored & hired', '1. First', '2. Second', '• Nested']);
  });
});

describe('estimateRasterOffset', () => {
  const { estimateRasterOffset } = __testables as any;
  it('measures how far below its DOM box html2canvas drew each line', () => {
    // DOM lines every 20px; ink runs start 9px lower (2px ascender room + a 7px shift).
    const dom: Array<[number, number]> = [[100, 116], [120, 136], [140, 156], [160, 176]];
    const ink: Array<[number, number]> = dom.map(([a]) => [a + 9, a + 21]);
    expect(estimateRasterOffset(dom, ink)).toBe(7);
  });
  it('is 0 without matching ink', () => {
    expect(estimateRasterOffset([[100, 116]], [])).toBe(0);
  });
});
