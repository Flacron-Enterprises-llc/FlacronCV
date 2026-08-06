'use client';

import React from 'react';
import type { CV, CVSection } from '@flacroncv/shared-types';
import { fontNameToCssVar } from '../toolbar/FontPanel';
import { hexToRgba, contrastRatio, readableOn, INK } from '@/lib/design-tokens';

export interface LayoutProps {
  cv: CV;
  sections: CVSection[];
}

// ─── Style token resolution ──────────────────────────────────────────────────

const fontSizeScale = {
  small:  { name: 11, headline: 13, sectionTitle: 12, body: 10, meta: 9,  nameHero: 22, nameTop: 18 },
  medium: { name: 12, headline: 14, sectionTitle: 13, body: 11, meta: 10, nameHero: 28, nameTop: 22 },
  large:  { name: 13, headline: 16, sectionTitle: 14, body: 12, meta: 11, nameHero: 34, nameTop: 26 },
};

const spacingScale = {
  compact:  { section: 12, item: 6,  pad: 24, headerPad: 20 },
  normal:   { section: 18, item: 10, pad: 36, headerPad: 28 },
  relaxed:  { section: 24, item: 14, pad: 44, headerPad: 36 },
};

const borderRadiusScale = {
  none:   '0px',
  small:  '4px',
  medium: '8px',
  large:  '14px',
};

export function getTokens(cv: CV) {
  const primary  = cv.styling.primaryColor  || '#2563eb';
  const secondary = (cv.styling as any).secondaryColor || hexToRgba(primary, 0.08);
  const bodyFont    = fontNameToCssVar(cv.styling.fontFamily || 'Inter');
  const headingFont = fontNameToCssVar((cv.styling as any).headingFontFamily || cv.styling.fontFamily || 'Inter');
  const fs  = fontSizeScale[(cv.styling.fontSize  || 'medium') as keyof typeof fontSizeScale];
  const spBase = spacingScale[(cv.styling.spacing || 'normal')  as keyof typeof spacingScale];
  // Auto-fit multiplier (set by LivePreview via useAutoFitPage): lets a short CV
  // expand to fill the A4 page and a slightly-long one compress back onto it.
  // Only VERTICAL rhythm is scaled — `pad` is deliberately excluded so the left/
  // right page margins never shift. Absent/invalid ⇒ 1 ⇒ byte-identical layout.
  const rawFit = Number((cv.styling as any).__autoFit);
  const fit = Number.isFinite(rawFit) && rawFit > 0 ? rawFit : 1;
  const sp = fit === 1 ? spBase : {
    ...spBase,
    section:   spBase.section   * fit,
    item:      spBase.item      * fit,
    headerPad: spBase.headerPad * fit,
  };
  const br  = borderRadiusScale[((cv.styling as any).borderRadius || 'small') as keyof typeof borderRadiusScale];
  const sectionStyle: string = (cv.styling as any).sectionStyle || 'underline';
  return { primary, secondary, bodyFont, headingFont, fs, sp, br, sectionStyle };
}

// ─── Colour helpers ──────────────────────────────────────────────────────────
// Defined in @/lib/design-tokens (no React import) so the gallery thumbnails —
// and the cover-letter templates, which need exactly the same guarantees — can
// derive their colours with the same maths, without pulling this module's
// component tree into their bundles. Re-exported here because every CV template
// already imports its styling vocabulary from `shared`.

export {
  hexToRgba, darken, lighten,
  luminance, contrastRatio, readableOn, ensureDarkSurface,
  INK,
} from '@/lib/design-tokens';

// ─── Section heading variants ────────────────────────────────────────────────

interface HeadingProps {
  title: string;
  primary: string;
  headingFont: string;
  fs: ReturnType<typeof getTokens>['fs'];
  sectionStyle: string;
  br: string;
}

export function SectionHeading({ title, primary, headingFont, fs, sectionStyle, br }: HeadingProps) {
  // Heading *text* in the accent has to clear a text contrast threshold on
  // white; the rules and bars beside it do not, so they keep the accent exactly
  // as chosen. Splitting the two is what lets a pale accent stay visible as a
  // graphic element while the words it sits next to remain readable.
  const ink = readableOn(primary, '#ffffff', 4.0);
  const base: React.CSSProperties = {
    fontFamily: headingFont,
    fontWeight: 700,
    // Wider tracking on small uppercase. Set solid, uppercase text at 12–14px
    // reads as a cramped block at the browser default; opening it up is the
    // single cheapest thing that makes a heading look typeset rather than
    // <h2>-shaped.
    letterSpacing: '1px',
    textTransform: 'uppercase',
    marginTop: 0,
    marginBottom: '9px',
    fontSize: `${fs.sectionTitle}px`,
  };

  if (sectionStyle === 'underline') {
    // A hairline rule under the whole heading, with the accent carried by a
    // short bar under the words themselves. A full-width 2px accent bar shouts
    // at the same volume as the name at the top of the page and flattens the
    // hierarchy; a 2px stub plus a 1px neutral rule keeps the accent present
    // without letting six section headings out-shout the person's name.
    return (
      <div style={{ marginBottom: base.marginBottom, position: 'relative' }}>
        <h2 style={{ ...base, color: ink, marginBottom: 0, paddingBottom: '5px' }}>
          {title}
        </h2>
        <div style={{ height: '1px', background: INK.hair }} />
        <div style={{ height: '2px', width: '34px', background: primary, marginTop: '-1px' }} />
      </div>
    );
  }
  if (sectionStyle === 'card') {
    // Label colour is chosen against the fill, not assumed. Hard-coding white
    // works for the mid-to-dark accents in the swatch row and fails completely
    // for a pale one — someone who picks a light gold or a pastel gets white
    // text on a near-white block, i.e. section headings that are simply not
    // there. Pick whichever of white/near-black actually reads on their colour.
    const label = contrastRatio('#ffffff', primary) >= contrastRatio('#1f2933', primary)
      ? '#ffffff'
      : '#1f2933';
    return (
      <h2 style={{ ...base, color: label, background: primary, padding: '4px 11px', borderRadius: br, display: 'inline-block', marginBottom: '10px' }}>
        {title}
      </h2>
    );
  }
  if (sectionStyle === 'left-border') {
    // Logical, not physical. The preview inherits the document's direction, so
    // on the Arabic and Urdu locales the whole CV mirrors — and a border-left
    // spine stayed pinned to the left of right-aligned text, which is the one
    // detail that makes an RTL CV look machine-translated. html2canvas 1.4.1
    // resolves border-inline-start correctly under dir=rtl, so the PDF export
    // mirrors along with the preview.
    return (
      <h2 style={{ ...base, color: ink, borderInlineStart: `3px solid ${primary}`, paddingInlineStart: '9px' }}>
        {title}
      </h2>
    );
  }
  // minimal
  return (
    <h2 style={{ ...base, color: INK.meta, borderBottom: `1px solid ${INK.hair}`, paddingBottom: '5px' }}>
      {title}
    </h2>
  );
}

// ─── Section-sidebar heading (always left-border, white text) ────────────────

export function SidebarSectionHeading({ title, headingFont, fs }: { title: string; headingFont: string; fs: HeadingProps['fs'] }) {
  return (
    <h3 style={{
      fontFamily: headingFont,
      fontSize: `${fs.sectionTitle - 1}px`,
      fontWeight: 700,
      letterSpacing: '1.1px',
      textTransform: 'uppercase',
      color: '#fff',
      borderBottom: '1px solid rgba(255,255,255,0.28)',
      paddingBottom: '5px',
      marginBottom: '9px',
    }}>
      {title}
    </h3>
  );
}

// ─── Shared item renderer ────────────────────────────────────────────────────

interface ItemProps {
  item: any;
  sectionType: string;
  primary: string;
  fs: ReturnType<typeof getTokens>['fs'];
  sp: ReturnType<typeof getTokens>['sp'];
  br: string;
  variant?: 'default' | 'card' | 'sidebar';
}

export function ItemRenderer({ item, sectionType, primary, fs, sp, br, variant = 'default' }: ItemProps) {
  const isCard = variant === 'card';
  const isSidebar = variant === 'sidebar';

  const cardWrapper: React.CSSProperties = isCard ? {
    background: '#fff',
    // Neutral hairline + accent spine, and no drop shadow. A soft shadow is a
    // screen affordance — it says "this element floats above the page". On a
    // printed CV there is no page behind the page, so it renders as a grey
    // smear along two edges and nothing else. Structure comes from the spine.
    border: `1px solid ${INK.hair}`,
    // Inline-start, so the spine follows the text in RTL — see SectionHeading.
    borderInlineStart: `3px solid ${primary}`,
    borderRadius: br,
    padding: '11px 13px',
    marginBottom: `${sp.item + 2}px`,
  } : {
    marginBottom: `${sp.item}px`,
  };

  const titleColor    = isSidebar ? '#fff' : INK.heading;
  const textColor     = isSidebar ? 'rgba(255,255,255,0.88)' : INK.body;
  const subtitleColor = isSidebar ? 'rgba(255,255,255,0.74)' : INK.subtle;
  const metaColor     = isSidebar ? 'rgba(255,255,255,0.64)' : INK.meta;

  // Dates sit opposite the title, so they read as a column of their own. Giving
  // them a little weight and tracking keeps that column crisp at 9–11px instead
  // of dissolving into grey the way a plain light-grey date does in print.
  const dateStyle: React.CSSProperties = {
    fontSize: `${fs.meta}px`,
    fontWeight: 500,
    letterSpacing: '0.2px',
    color: metaColor,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  if (item.position || item.company) {
    const start = formatCVDate(item.startDate);
    const end   = item.isCurrent ? 'Present' : formatCVDate(item.endDate) || 'Present';
    return (
      <div style={cardWrapper}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: `${fs.headline}px`, fontWeight: 600, color: titleColor, lineHeight: 1.3 }}>
            {item.position}
          </span>
          <span style={dateStyle}>
            {start}{start ? ` – ${end}` : end}
          </span>
        </div>
        <p style={{ fontSize: `${fs.name}px`, fontWeight: 500, color: subtitleColor, margin: '3px 0 0' }}>
          {item.company}{item.location ? ` · ${item.location}` : ''}
        </p>
        {item.description && (
          <p style={{ fontSize: `${fs.body}px`, color: textColor, marginTop: '5px', marginBottom: 0, lineHeight: 1.65, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>
            {item.description}
          </p>
        )}
      </div>
    );
  }

  if (item.institution) {
    const start = formatCVDate(item.startDate);
    const end   = formatCVDate(item.endDate);
    const dateRange = [start, end].filter(Boolean).join(' – ');
    return (
      <div style={cardWrapper}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: `${fs.headline}px`, fontWeight: 600, color: titleColor, lineHeight: 1.3 }}>
            {formatDegree(item)}
          </span>
          <span style={dateStyle}>
            {dateRange}
          </span>
        </div>
        <p style={{ fontSize: `${fs.name}px`, fontWeight: 500, color: subtitleColor, margin: '3px 0 0' }}>
          {item.institution}
        </p>
        {item.description && (
          <p style={{ fontSize: `${fs.body}px`, color: textColor, marginTop: '5px', marginBottom: 0, lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>
            {item.description}
          </p>
        )}
      </div>
    );
  }

  // Generic (project, certification, language, custom, award…)
  const label = item.name || item.title || '';
  const detail = item.description || item.issuer || item.proficiency || '';
  const date = formatCVDate(item.date || item.startDate);
  return (
    <div style={cardWrapper}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ fontSize: `${fs.name}px`, fontWeight: 600, color: titleColor, lineHeight: 1.3 }}>
          {label}
        </span>
        {date && <span style={dateStyle}>{date}</span>}
      </div>
      {detail && (
        <p style={{ fontSize: `${fs.body}px`, color: textColor, marginTop: '3px', marginBottom: 0, lineHeight: 1.55, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>{detail}</p>
      )}
    </div>
  );
}

// ─── Degree + field ──────────────────────────────────────────────────────────

/**
 * Join an education entry's degree and field into one title.
 *
 * The editor offers both a "Degree" and a "Field of study" box, and most people
 * type the whole qualification into the first one and then dutifully fill in the
 * second as well. Blindly rendering `${degree} in ${field}` turned that into
 * "Bachelor of Science in Computer Science in Computer Science" — on every
 * layout, in the PDF, on the CV they send to employers.
 *
 * So: append the field only when the degree does not already say it. The
 * comparison is normalised (case, punctuation) and padded with spaces so it
 * matches on whole words — a degree of "Bachelor of Arts" must not be treated
 * as already containing a field of "Liberal Arts".
 */
export function formatDegree(item: { degree?: string | null; field?: string | null }): string {
  const degree = (item.degree || '').trim();
  const field  = (item.field  || '').trim();
  if (!field)  return degree;
  if (!degree) return field;
  const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return norm(degree).includes(norm(field)) ? degree : `${degree} in ${field}`;
}

// ─── Skills ──────────────────────────────────────────────────────────────────
//
// Skills are set as typeset text, not as bordered tags. That is a rendering
// decision as much as a design one.
//
// The PDF is produced by html2canvas, which re-implements CSS layout in JS. It
// does not place a text baseline where the browser does: measured against a
// descender-free probe string, the browser centres a label in its box to within
// half a pixel, while html2canvas draws it 2–3px low. Inside a bordered box that
// is glaring — the label sits on the floor of the tag with a band of dead space
// above it — and it is not fixable from the CSS side. Padding, unitless vs px
// line-height, min-height, even inline-flex centring were all measured; every
// one of them still came out 2–3px low, because the error is in how the
// rasteriser positions the baseline, not in how the box is described.
//
// A box is the only thing that makes that error visible. Without one there is no
// edge to be off-centre against, and the skills read as what they are — a list
// of competencies — rather than as UI chips pasted onto a document. This is also
// what senior CVs actually do; tag clouds are a web idiom.

/**
 * Skills as a running, separated list — for full-width and wide columns.
 *
 * Each skill and the separator that follows it form one non-breaking unit, so
 * lines can only break *between* skills. A separator can therefore never begin
 * a line, which is what a naive join would allow.
 */
export function SkillList({ items, primary, fs, tone = 'light' }: {
  items: string[];
  primary: string;
  fs: ReturnType<typeof getTokens>['fs'];
  tone?: 'light' | 'dark';
}) {
  const names = items.map((s) => (s ?? '').trim()).filter(Boolean);
  if (!names.length) return null;

  const textColor = tone === 'dark' ? 'rgba(255,255,255,0.92)' : INK.body;
  const sepColor  = tone === 'dark' ? 'rgba(255,255,255,0.45)' : hexToRgba(primary, 0.55);

  return (
    <div style={{ fontSize: `${fs.name}px`, lineHeight: 1.9, color: textColor }}>
      {names.map((name, i) => (
        <span key={i} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 500 }}>{name}</span>
          {i < names.length - 1 && (
            <span style={{ color: sepColor, padding: '0 9px' }} aria-hidden="true">·</span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * Skills stacked one per line — for the narrow sidebar columns.
 *
 * A separated run in a 30%-wide column wraps every two or three items and stops
 * reading as a list at all; stacked, the same content scans instantly. Each row
 * is plain text on its own line, so there is again no box to mis-centre.
 */
export function SkillLines({ items, primary, fs, tone = 'dark' }: {
  items: string[];
  primary: string;
  fs: ReturnType<typeof getTokens>['fs'];
  tone?: 'light' | 'dark';
}) {
  const names = items.map((s) => (s ?? '').trim()).filter(Boolean);
  if (!names.length) return null;

  const textColor = tone === 'dark' ? 'rgba(255,255,255,0.92)' : INK.body;
  const dotColor  = tone === 'dark' ? 'rgba(255,255,255,0.55)' : hexToRgba(primary, 0.6);

  return (
    <div style={{ fontSize: `${fs.body}px`, lineHeight: 1.7, color: textColor }}>
      {names.map((name, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '7px' }}>
          <span style={{ color: dotColor, flexShrink: 0 }} aria-hidden="true">·</span>
          <span style={{ minWidth: 0, overflowWrap: 'break-word', fontWeight: 500 }}>{name}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Date formatter ──────────────────────────────────────────────────────────
// Converts stored date strings to human-readable format.
//   "2021-01"  → "Jan 2021"
//   "2020-12"  → "Dec 2020"
//   "2024"     → "2024"
//   "Present"  → "Present"
//   ""         → ""

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatCVDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const s = dateStr.trim();
  if (!s) return '';
  if (s.toLowerCase() === 'present') return 'Present';
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const m = parseInt(ym[2], 10);
    if (m >= 1 && m <= 12) return `${MONTH_NAMES[m - 1]} ${ym[1]}`;
  }
  return s; // year-only "2024" or freeform text passed through as-is
}

// ─── Contact line builder ─────────────────────────────────────────────────────

export function buildContactLine(cv: CV): string {
  return [
    cv.personalInfo.email,
    cv.personalInfo.phone,
    [cv.personalInfo.city, cv.personalInfo.country].filter(Boolean).join(', '),
  ].filter(Boolean).join('  ·  ');
}

export function buildLinksLine(cv: CV): string {
  return [cv.personalInfo.linkedin, cv.personalInfo.website].filter(Boolean).join('  ·  ');
}

// ─── Sidebar section splitter ─────────────────────────────────────────────────
// Skills, languages, certifications, awards → sidebar; rest → main

const SIDEBAR_SECTION_TYPES = new Set(['skills', 'languages', 'certifications', 'awards']);

export function splitSections(sections: CVSection[]) {
  const sidebar = sections.filter(s => SIDEBAR_SECTION_TYPES.has(s.type));
  const main    = sections.filter(s => !SIDEBAR_SECTION_TYPES.has(s.type));
  return { sidebar, main };
}
