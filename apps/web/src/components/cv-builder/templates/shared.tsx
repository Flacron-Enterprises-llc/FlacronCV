'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useLocale } from 'next-intl';
import type { CV, CVSection } from '@flacroncv/shared-types';
import { fontNameToCssVar } from '../toolbar/FontPanel';
import { hexToRgba, contrastRatio, readableOn, INK } from '@/lib/design-tokens';
import {
  cvDocLabels, formatDocDate, formatDocDateRange, resolveCVDocumentLocale,
  type CVDocDir, type CVDocLabels, type CVDocLang,
} from './document-locale';

/** Element the candidate's name is rendered as. */
export type NameHeadingTag = 'h1' | 'h2' | 'div';

export interface LayoutProps {
  cv: CV;
  sections: CVSection[];
  /**
   * Element for the candidate's name. Defaults to a plain `div`: the layouts are
   * also rendered as thumbnails on the homepage and /templates, where a dozen
   * CV names as `<h1>` drowned out the page's own heading. The editor preview
   * (the only place the name IS the page's subject) passes 'h1'.
   */
  nameAs?: NameHeadingTag;
}

// ─── Document language context ───────────────────────────────────────────────

export interface CVDocument {
  lang: CVDocLang;
  dir: CVDocDir;
  labels: CVDocLabels;
}

const DEFAULT_DOC: CVDocument = { lang: 'en', dir: 'ltr', labels: cvDocLabels('en') };
const CVDocumentContext = createContext<CVDocument>(DEFAULT_DOC);

/** Resolve a CV's document language (see document-locale.ts). Used by every layout root. */
export function useCVDocument(cv: CV, sections: CVSection[]): CVDocument {
  const uiLocale = useLocale();
  const { lang, dir } = resolveCVDocumentLocale(cv, sections, uiLocale);
  return useMemo(() => ({ lang, dir, labels: cvDocLabels(lang) }), [lang, dir]);
}

/** Read the enclosing layout's document language (English when rendered standalone). */
export function useDocument(): CVDocument {
  return useContext(CVDocumentContext);
}

/**
 * Wraps a layout's content so items render dates and labels in the document's
 * language. Each layout also sets `dir` and `lang` on its own root element
 * rather than inheriting them from the page, so an English CV stays LTR inside
 * an Arabic UI and an Arabic CV is RTL inside an English one.
 */
export function CVDocumentProvider({ doc, children }: { doc: CVDocument; children: React.ReactNode }) {
  return <CVDocumentContext.Provider value={doc}>{children}</CVDocumentContext.Provider>;
}

export { formatDocDate, formatDocDateRange };

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
      <div data-pdf-keep-next="" style={{ marginBottom: base.marginBottom, position: 'relative' }}>
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
      <h2 data-pdf-keep-next="" style={{ ...base, color: label, background: primary, padding: '4px 11px', borderRadius: br, display: 'inline-block', marginBottom: '10px' }}>
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
      <h2 data-pdf-keep-next="" style={{ ...base, color: ink, borderInlineStart: `3px solid ${primary}`, paddingInlineStart: '9px' }}>
        {title}
      </h2>
    );
  }
  // minimal
  return (
    <h2 data-pdf-keep-next="" style={{ ...base, color: INK.meta, borderBottom: `1px solid ${INK.hair}`, paddingBottom: '5px' }}>
      {title}
    </h2>
  );
}

// ─── Section-sidebar heading (always left-border, white text) ────────────────

export function SidebarSectionHeading({ title, headingFont, fs }: { title: string; headingFont: string; fs: HeadingProps['fs'] }) {
  return (
    <h3 data-pdf-keep-next="" style={{
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
  const { lang, labels } = useDocument();
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
  const dateStyle: React.CSSProperties = isSidebar ? {
    // The sidebar column is ~30% of the page: a nowrap date beside the title
    // pushed long certification dates past the column edge, where they were
    // clipped. In the sidebar the date goes on its own line under the title.
    display: 'block',
    fontSize: `${fs.meta}px`,
    fontWeight: 500,
    letterSpacing: '0.2px',
    color: metaColor,
    marginTop: '2px',
  } : {
    fontSize: `${fs.meta}px`,
    fontWeight: 500,
    letterSpacing: '0.2px',
    color: metaColor,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  // Title + date row. In the sidebar it stacks (see dateStyle).
  const rowStyle: React.CSSProperties = isSidebar
    ? { display: 'block' }
    : { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' };

  // Generic item lines (project, certification, language, custom, award…, and
  // references). One definition so a reference reads exactly like the other
  // name-plus-detail entries on the page.
  const genericLabelStyle: React.CSSProperties = { fontSize: `${fs.name}px`, fontWeight: 600, color: titleColor, lineHeight: 1.3 };
  const genericDetailStyle: React.CSSProperties = { fontSize: `${fs.body}px`, color: textColor, marginTop: '3px', marginBottom: 0, lineHeight: 1.55, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-line' };
  const lineStyles: Record<ItemLine['kind'], React.CSSProperties> = {
    subtitle: { ...genericDetailStyle, fontSize: `${fs.name}px`, fontWeight: 500, color: subtitleColor },
    detail:   genericDetailStyle,
    meta:     { ...genericDetailStyle, fontSize: `${fs.meta}px`, color: metaColor },
    link:     { ...genericDetailStyle, fontSize: `${fs.meta}px`, color: isSidebar ? textColor : readableOn(primary, '#ffffff', 4.5), wordBreak: 'break-all' },
  };

  // References are keyed on the section type, before the experience branch: a
  // reference has a `company` and would otherwise render as a job (no name, a
  // "Present" date). Plain text lines only — no new boxes for html2canvas.
  if (sectionType === 'references') {
    const lines = referenceLines(item);
    return (
      <div style={cardWrapper} data-pdf-card={isCard ? '' : undefined}>
        {lines.name && (
          <div data-pdf-keep-next="" style={rowStyle}>
            <span dir="auto" style={genericLabelStyle}>{lines.name}</span>
          </div>
        )}
        {lines.details.map((line, i) => (
          <p key={i} dir="auto" style={genericDetailStyle}>{line}</p>
        ))}
      </div>
    );
  }

  if (item.position || item.company) {
    const range = formatDocDateRange(item.startDate, item.endDate, lang, { current: !!item.isCurrent, openEndedIsPresent: true });
    return (
      <div style={cardWrapper} data-pdf-card={isCard ? '' : undefined}>
        <div data-pdf-keep-next="" style={rowStyle}>
          <span dir="auto" style={{ fontSize: `${fs.headline}px`, fontWeight: 600, color: titleColor, lineHeight: 1.3 }}>
            {item.position}
          </span>
          <span style={dateStyle}>
            {range}
          </span>
        </div>
        <p dir="auto" data-pdf-keep-next="" style={{ fontSize: `${fs.name}px`, fontWeight: 500, color: subtitleColor, margin: '3px 0 0' }}>
          {item.company}{item.location ? ` · ${item.location}` : ''}
        </p>
        {item.description && (
          <p dir="auto" style={{ fontSize: `${fs.body}px`, color: textColor, marginTop: '5px', marginBottom: 0, lineHeight: 1.65, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>
            {item.description}
          </p>
        )}
      </div>
    );
  }

  if (item.institution) {
    const dateRange = formatDocDateRange(item.startDate, item.endDate, lang);
    return (
      <div style={cardWrapper} data-pdf-card={isCard ? '' : undefined}>
        <div data-pdf-keep-next="" style={rowStyle}>
          <span dir="auto" style={{ fontSize: `${fs.headline}px`, fontWeight: 600, color: titleColor, lineHeight: 1.3 }}>
            {formatDegree(item)}
          </span>
          <span style={dateStyle}>
            {dateRange}
          </span>
        </div>
        <p dir="auto" data-pdf-keep-next="" style={{ fontSize: `${fs.name}px`, fontWeight: 500, color: subtitleColor, margin: '3px 0 0' }}>
          {item.institution}{item.location ? ` · ${item.location}` : ''}
        </p>
        {item.gpa && (
          <p style={lineStyles.meta}>{labels.gpa}: <bdi>{item.gpa}</bdi></p>
        )}
        {item.description && (
          <p dir="auto" style={{ fontSize: `${fs.body}px`, color: textColor, marginTop: '5px', marginBottom: 0, lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>
            {item.description}
          </p>
        )}
      </div>
    );
  }

  // Generic (project, certification, language, custom, award…)
  const parts = genericItemParts(item, sectionType, lang);
  return (
    <div style={cardWrapper} data-pdf-card={isCard ? '' : undefined}>
      <div data-pdf-keep-next="" style={rowStyle}>
        <span dir="auto" style={genericLabelStyle}>
          {parts.label}
        </span>
        {parts.date && <span style={dateStyle}>{parts.date}</span>}
      </div>
      {parts.lines.map((line, i) => <ItemLineView key={i} line={line} style={lineStyles[line.kind]} />)}
    </div>
  );
}

// ─── Generic item content ────────────────────────────────────────────────────

export interface ItemLine {
  kind: 'subtitle' | 'detail' | 'meta' | 'link';
  text: string;
  /** Target for a clickable line (a project or credential URL). */
  href?: string;
}

/**
 * What a non-experience, non-education item prints, in order. One definition
 * shared by every layout (and mirrored by the DOCX builder) so the project URL,
 * dates and technologies and the certification issuer, expiry, credential ID
 * and URL that the editor collects actually reach the page. They used to be
 * collected and then silently dropped by a generic "name + one detail" row.
 */
export function genericItemParts(item: any, sectionType: string, lang: string): { label: string; date: string; lines: ItemLine[] } {
  const labels = cvDocLabels(lang);
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const lines: ItemLine[] = [];

  if (sectionType === 'projects') {
    const description = str(item.description);
    const url = str(item.url);
    const tech: string[] = Array.isArray(item.technologies) ? item.technologies.map(str).filter(Boolean) : [];
    if (description) lines.push({ kind: 'detail', text: description });
    if (tech.length) lines.push({ kind: 'meta', text: `${labels.technologies}: ${tech.join(', ')}` });
    if (url) lines.push({ kind: 'link', text: url, href: toHref('url', url) });
    return {
      label: str(item.name) || str(item.title),
      date: formatDocDateRange(item.startDate, item.endDate, lang),
      lines,
    };
  }

  if (sectionType === 'certifications') {
    const issuer = str(item.issuer);
    const expiry = formatDocDate(item.expiryDate, lang);
    const credentialId = str(item.credentialId);
    const url = str(item.url);
    if (issuer) lines.push({ kind: 'subtitle', text: issuer });
    const meta = [expiry ? `${labels.expires} ${expiry}` : '', credentialId ? `${labels.credentialId}: ${credentialId}` : '']
      .filter(Boolean).join(' · ');
    if (meta) lines.push({ kind: 'meta', text: meta });
    if (url) lines.push({ kind: 'link', text: url, href: toHref('url', url) });
    return { label: str(item.name) || str(item.title), date: formatDocDate(item.date, lang), lines };
  }

  // Languages, custom, awards, publications, volunteer…
  const subtitle = str(item.subtitle);
  const detail = str(item.description) || str(item.issuer) || str(item.proficiency);
  if (subtitle) lines.push({ kind: 'subtitle', text: subtitle });
  if (detail) lines.push({ kind: 'detail', text: detail });
  return {
    label: str(item.name) || str(item.title),
    date: formatDocDate(item.date || item.startDate, lang),
    lines,
  };
}

/** One line of {@link genericItemParts}, with links marked for the PDF exporter. */
export function ItemLineView({ line, style }: { line: ItemLine; style: React.CSSProperties }) {
  if (line.kind === 'link' && line.href) {
    return (
      <p style={style}>
        <bdi data-pdf-link={line.href}>{line.text}</bdi>
      </p>
    );
  }
  return <p dir="auto" style={style}>{line.text}</p>;
}

// ─── Links ───────────────────────────────────────────────────────────────────

/**
 * Turn a contact value into a link target, or undefined when it does not look
 * like one. The exported PDF is an image, so links only work because the
 * exporter lays a clickable rectangle over every `[data-pdf-link]` element.
 */
export function toHref(kind: 'email' | 'phone' | 'url', raw: string | null | undefined): string | undefined {
  const v = (raw ?? '').trim();
  if (!v) return undefined;
  if (kind === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v}` : undefined;
  if (kind === 'phone') {
    const dial = v.replace(/[^\d+]/g, '');
    return dial.replace(/\D/g, '').length >= 5 ? `tel:${dial}` : undefined;
  }
  if (/^https?:\/\/\S+$/i.test(v)) return v;
  // "linkedin.com/in/jane", "www.site.dev" — typed without a scheme.
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v)) return `https://${v}`;
  return undefined;
}

export interface ContactPart { text: string; href?: string }

/** Email · phone · location, as separate parts so each can carry a link. */
export function contactParts(cv: CV): ContactPart[] {
  const p = cv.personalInfo;
  const location = locationLine(cv);
  const parts: ContactPart[] = [];
  if (p.email) parts.push({ text: p.email, href: toHref('email', p.email) });
  if (p.phone) parts.push({ text: p.phone, href: toHref('phone', p.phone) });
  if (location) parts.push({ text: location });
  return parts;
}

/** LinkedIn · website · GitHub. */
export function linkParts(cv: CV): ContactPart[] {
  const p = cv.personalInfo;
  return [p.linkedin, p.website, p.github]
    .filter((v): v is string => Boolean(v))
    .map((text) => ({ text, href: toHref('url', text) }));
}

/** The stacked sidebar contact list — same entries and order as contactSidebarLines. */
export function sidebarContactParts(cv: CV): ContactPart[] {
  return [...contactParts(cv), ...linkParts(cv)];
}

/**
 * A run of contact parts separated by `sep`. Each part is its own element
 * carrying `data-pdf-link`, which the PDF exporter turns into a clickable area,
 * and is bidi-isolated so an email address or URL inside an RTL CV is never
 * reordered. Text content is identical to buildContactLine / buildLinksLine.
 */
export function ContactRun({ parts, sep = '  ·  ' }: { parts: ContactPart[]; sep?: string }) {
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ whiteSpace: 'pre' }}>{sep}</span>}
          <bdi data-pdf-link={part.href}>{part.text}</bdi>
        </React.Fragment>
      ))}
    </>
  );
}

// ─── Reference lines ─────────────────────────────────────────────────────────

/**
 * The text lines of a reference entry, empty ones dropped:
 * name, then "title, company", then "email · phone", then relationship.
 * Shared by every layout and the DOCX export so they agree on what a
 * reference says.
 */
export function referenceLines(item: {
  name?: unknown; title?: unknown; company?: unknown;
  email?: unknown; phone?: unknown; relationship?: unknown;
} | null | undefined): { name: string; role: string; contact: string; relationship: string; details: string[] } {
  const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const it = item ?? {};
  const name = txt(it.name);
  const role = [txt(it.title), txt(it.company)].filter(Boolean).join(', ');
  const contact = [txt(it.email), txt(it.phone)].filter(Boolean).join(' · ');
  const relationship = txt(it.relationship);
  return { name, role, contact, relationship, details: [role, contact, relationship].filter(Boolean) };
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
// Month names and "Present" follow `lang` (the CV's document language — see
// document-locale.ts); English is the default and is unchanged.

export function formatCVDate(dateStr?: string | null, lang: string = 'en'): string {
  return formatDocDate(dateStr, lang);
}

// ─── Contact line builder ─────────────────────────────────────────────────────

function locationLine(cv: CV): string {
  const cityPostal = [cv.personalInfo.city, cv.personalInfo.postalCode].filter(Boolean).join(' ');
  return [cv.personalInfo.address, cityPostal, cv.personalInfo.country].filter(Boolean).join(', ');
}

export function buildContactLine(cv: CV): string {
  return [
    cv.personalInfo.email,
    cv.personalInfo.phone,
    locationLine(cv),
  ].filter(Boolean).join('  ·  ');
}

export function buildLinksLine(cv: CV): string {
  return [cv.personalInfo.linkedin, cv.personalInfo.website, cv.personalInfo.github].filter(Boolean).join('  ·  ');
}

export function contactSidebarLines(cv: CV): string[] {
  return [
    cv.personalInfo.email,
    cv.personalInfo.phone,
    locationLine(cv),
    cv.personalInfo.linkedin,
    cv.personalInfo.website,
    cv.personalInfo.github,
  ].filter(Boolean);
}

// ─── Sidebar section splitter ─────────────────────────────────────────────────
// Skills, languages, certifications, awards → sidebar; rest → main

const SIDEBAR_SECTION_TYPES = new Set(['skills', 'languages', 'certifications', 'awards']);

export function splitSections(sections: CVSection[]) {
  const sidebar = sections.filter(s => SIDEBAR_SECTION_TYPES.has(s.type));
  const main    = sections.filter(s => !SIDEBAR_SECTION_TYPES.has(s.type));
  return { sidebar, main };
}
