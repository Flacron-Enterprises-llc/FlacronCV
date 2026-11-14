'use client';

/**
 * Slate & Gold Layout — "High-Impact Minimalist"
 *
 * Design language:
 *   • Deep slate sidebar (#1a2332) — contact, skills, extras
 *   • Gold accent (user's primaryColor, default #C9A84C) — headings, dates, timeline dots
 *   • Pure white main column — generous whitespace, clear typographic hierarchy
 *   • Montserrat/Inter headings — bold name, tracked-uppercase section titles
 *   • Experience entries rendered with a continuous gold timeline rail
 */

import React from 'react';
import type { LayoutProps } from './shared';
import {
  getTokens, hexToRgba, readableOn, INK,
  splitSections, formatDegree, SkillList, SkillLines,
  sidebarContactParts, referenceLines,
  useCVDocument, useDocument, CVDocumentProvider,
  genericItemParts, ItemLineView, formatDocDateRange,
  type ItemLine,
} from './shared';

/* ─── Palette ────────────────────────────────────────────────────────────────── */

const SLATE      = '#1a2332';          // sidebar background
const SLATE_DARK = '#111827';          // sidebar top stripe
const WHITE      = '#ffffff';

/* ─── Section heading (main column) ─────────────────────────────────────────── */

interface MainHeadingProps {
  title: string;
  gold: string;
  headingFont: string;
  fs: ReturnType<typeof getTokens>['fs'];
}

function MainHeading({ title, gold, headingFont, fs }: MainHeadingProps) {
  return (
    <div data-pdf-keep-next="" style={{ marginBottom: '10px' }}>
      {/* Thick gold bar above the text */}
      <div style={{ width: '28px', height: '3px', background: gold, borderRadius: '2px', marginBottom: '6px' }} />
      <h2 style={{
        fontFamily: headingFont,
        fontSize: `${fs.sectionTitle}px`,
        fontWeight: 800,
        letterSpacing: '1.2px',
        textTransform: 'uppercase',
        color: SLATE,
        margin: 0,
        lineHeight: 1,
      }}>
        {title}
      </h2>
      {/* Full-width hairline rule */}
      <div style={{ height: '1px', background: hexToRgba(SLATE, 0.12), marginTop: '6px' }} />
    </div>
  );
}

/* ─── Sidebar section heading ────────────────────────────────────────────────── */

interface SideHeadingProps {
  title: string;
  gold: string;
  headingFont: string;
  fs: ReturnType<typeof getTokens>['fs'];
}

function SideHeading({ title, gold, headingFont, fs }: SideHeadingProps) {
  return (
    <div data-pdf-keep-next="" style={{ marginBottom: '8px' }}>
      <h3 style={{
        fontFamily: headingFont,
        fontSize: `${fs.sectionTitle - 1}px`,
        fontWeight: 700,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: gold,
        margin: 0,
        paddingBottom: '5px',
        // Derived from the accent actually in use, not from the literal gold
        // this template was first drawn with — otherwise every sidebar heading
        // sat above a rule in a colour appearing nowhere else on the page.
        borderBottom: `1px solid ${hexToRgba(gold, 0.32)}`,
      }}>
        {title}
      </h3>
    </div>
  );
}

/* ─── Experience / Education item (timeline style) ──────────────────────────── */

interface TimelineItemProps {
  item: any;
  gold: string;
  bodyFont: string;
  headingFont: string;
  fs: ReturnType<typeof getTokens>['fs'];
  sp: ReturnType<typeof getTokens>['sp'];
  isLast: boolean;
}

function TimelineItem({ item, gold, bodyFont, headingFont, fs, sp, isLast }: TimelineItemProps) {
  const { lang, labels } = useDocument();
  const isExperience = !!(item.position || item.company);
  const isEducation  = !!item.institution;

  const title    = isExperience ? item.position : isEducation ? formatDegree(item) : (item.name || item.title || '');
  const subtitle = isExperience || isEducation
    ? `${(isExperience ? item.company : item.institution) || ''}${item.location ? ` · ${item.location}` : ''}`
    : (item.issuer || item.proficiency || '');
  const dateStr  = isExperience
    ? formatDocDateRange(item.startDate, item.endDate, lang, { current: !!item.isCurrent, openEndedIsPresent: true })
    : formatDocDateRange(item.startDate, item.endDate, lang) || formatDocDateRange(item.date, null, lang);

  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: isLast ? 0 : `${sp.item + 4}px` }}>
      {/* Timeline rail + dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '10px' }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: gold, flexShrink: 0, marginTop: '4px',
          boxShadow: `0 0 0 2px ${hexToRgba(gold, 0.22)}`,
        }} />
        {!isLast && (
          <div style={{ flex: 1, width: '1px', background: hexToRgba(gold, 0.25), marginTop: '4px' }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div data-pdf-keep-next="" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: headingFont,
            fontSize: `${fs.headline}px`,
            fontWeight: 700,
            color: SLATE,
            lineHeight: 1.3,
          }}>
            {title}
          </span>
          {dateStr && (
            <span style={{
              fontSize: `${fs.meta}px`,
              fontWeight: 600,
              color: gold,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {dateStr}
            </span>
          )}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <p data-pdf-keep-next="" style={{
            fontFamily: bodyFont,
            fontSize: `${fs.name}px`,
            fontWeight: 500,
            color: INK.subtle,
            margin: '3px 0 5px',
            lineHeight: 1.4,
          }}>
            {subtitle}
          </p>
        )}

        {isEducation && item.gpa && (
          <p style={{ fontFamily: bodyFont, fontSize: `${fs.meta}px`, color: INK.meta, margin: '0 0 4px' }}>
            {labels.gpa}: <bdi>{item.gpa}</bdi>
          </p>
        )}

        {/* Description */}
        {item.description && (
          <p dir="auto" style={{
            fontFamily: bodyFont,
            fontSize: `${fs.body}px`,
            color: INK.body,
            lineHeight: 1.7,
            margin: 0,
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'pre-line',
          }}>
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Generic sidebar item ───────────────────────────────────────────────────── */

function SideItem({ item, sectionType, gold, bodyFont, fs, sp }: {
  item: any; sectionType: string; gold: string; bodyFont: string;
  fs: ReturnType<typeof getTokens>['fs'];
  sp: ReturnType<typeof getTokens>['sp'];
}) {
  const { lang } = useDocument();
  const parts = genericItemParts(item, sectionType, lang);
  // Older content may carry the label in degree/issuer only.
  const label = parts.label || item.degree || item.issuer || '';
  const base: React.CSSProperties = { fontFamily: bodyFont, fontSize: `${fs.body}px`, color: 'rgba(255,255,255,0.60)', margin: '2px 0 0', lineHeight: 1.5, whiteSpace: 'pre-line', overflowWrap: 'break-word' };
  const lineStyle: Record<ItemLine['kind'], React.CSSProperties> = {
    subtitle: { ...base, color: 'rgba(255,255,255,0.74)' },
    detail: base,
    meta: { ...base, fontSize: `${fs.meta}px` },
    link: { ...base, fontSize: `${fs.meta}px`, color: 'rgba(255,255,255,0.80)', wordBreak: 'break-all' },
  };
  return (
    <div style={{ marginBottom: `${sp.item}px` }}>
      {/* Title, then the date on its own line: in a 30% column a date beside
          the title was pushed past the edge and clipped. */}
      <span dir="auto" style={{ display: 'block', fontFamily: bodyFont, fontSize: `${fs.name}px`, fontWeight: 600, color: 'rgba(255,255,255,0.90)', overflowWrap: 'break-word' }}>
        {label}
      </span>
      {parts.date && (
        <span style={{ display: 'block', fontSize: `${fs.meta}px`, color: gold, marginTop: '1px' }}>
          {parts.date}
        </span>
      )}
      {parts.lines.map((line, i) => <ItemLineView key={i} line={line} style={lineStyle[line.kind]} />)}
    </div>
  );
}

/* ─── Main layout ────────────────────────────────────────────────────────────── */

export default function SlateGoldLayout({ cv, sections, nameAs: NameTag = 'div' }: LayoutProps) {
  const doc = useCVDocument(cv, sections);
  const { primary, bodyFont, headingFont, fs, sp } = getTokens(cv);

  // This layout paints the accent onto two fixed, opposite backgrounds: the
  // slate sidebar and the white main column. One colour cannot serve both. The
  // template was drawn around a literal gold (#C9A84C), which happens to work
  // on either — but the accent is the user's own primaryColor, and a deep navy
  // or maroon on #1a2332 is a sidebar with invisible headings, invisible skill
  // tags and an invisible job title. Derive one accent per surface instead, each
  // nudged only as far as legibility requires so the chosen hue still reads.
  const gold     = readableOn(primary, WHITE, 4.0);   // main column, on white
  const goldSide = readableOn(primary, SLATE, 4.5);   // sidebar, on slate
  const goldDim  = hexToRgba(goldSide, 0.85);

  const showPhoto = cv.styling.showPhoto && cv.personalInfo.photoURL;
  const { sidebar: sidebarSections, main: mainSections } = splitSections(sections);

  const initials =
    ((cv.personalInfo.firstName?.[0] || '') + (cv.personalInfo.lastName?.[0] || '')).toUpperCase();

  return (
    <CVDocumentProvider doc={doc}>
    <div dir={doc.dir} lang={doc.lang} style={{
      fontFamily: bodyFont,
      display: 'flex',
      minHeight: '1122px',
      background: WHITE,
      color: '#111',
    }}>
      {/* ═══════════════════════ LEFT SIDEBAR ═══════════════════════ */}
      <div style={{
        width: '30%',
        flexShrink: 0,
        minWidth: 0,
        background: SLATE,
        display: 'flex',
        flexDirection: 'column',
        // Top stripe — slightly darker for depth
        borderTop: `4px solid ${goldSide}`,
      }}>
        {/* ── Identity block ── */}
        <div style={{
          padding: `${sp.headerPad}px ${sp.pad * 0.55}px ${sp.section * 0.8}px`,
          textAlign: 'center',
          background: `linear-gradient(180deg, ${SLATE_DARK} 0%, ${SLATE} 100%)`,
        }}>
          {/* Photo / Monogram */}
          {showPhoto ? (
            <img
              src={cv.personalInfo.photoURL!}
              alt="Profile"
              style={{
                width: '76px', height: '76px', borderRadius: '50%',
                objectFit: 'cover', display: 'block',
                margin: '0 auto 12px',
                border: `3px solid ${goldDim}`,
                boxShadow: `0 0 0 4px ${hexToRgba(goldSide, 0.15)}`,
              }}
            />
          ) : (
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: hexToRgba(goldSide, 0.15),
              border: `2px solid ${hexToRgba(goldSide, 0.55)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
              fontFamily: headingFont,
              fontSize: `${fs.nameTop - 2}px`, fontWeight: 800,
              color: goldSide,
            }}>
              {initials}
            </div>
          )}

          {/* Name */}
          <NameTag style={{
            fontFamily: headingFont,
            fontSize: `${fs.nameTop}px`,
            fontWeight: 900,
            color: WHITE,
            margin: 0,
            lineHeight: 1.15,
            letterSpacing: '-0.3px',
          }}>
            {cv.personalInfo.firstName}
            {cv.personalInfo.lastName && (
              <>
                <br />
                <span style={{ fontWeight: 300, color: 'rgba(255,255,255,0.80)' }}>
                  {cv.personalInfo.lastName}
                </span>
              </>
            )}
          </NameTag>

          {/* Headline — the job title, which is the second thing anyone reads.
              It used to be painted in the accent at 80% opacity, so on a dark
              accent it disappeared into the panel entirely. Accent belongs on
              headings and dates; the person's own title gets plain white. */}
          {cv.personalInfo.headline && (
            <p style={{
              fontFamily: bodyFont,
              fontSize: `${fs.body}px`,
              color: 'rgba(255,255,255,0.78)',
              margin: '7px 0 0',
              lineHeight: 1.45,
              letterSpacing: '0.3px',
            }}>
              {cv.personalInfo.headline}
            </p>
          )}
        </div>

        {/* ── Contact ── */}
        <div style={{ padding: `${sp.section * 0.7}px ${sp.pad * 0.55}px` }}>
          <SideHeading title={doc.labels.contact} gold={goldSide} headingFont={headingFont} fs={fs} />
          {sidebarContactParts(cv).map((part, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '5px' }}>
              {/* Gold bullet */}
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: goldSide, marginTop: '5px', flexShrink: 0 }} />
              <p style={{
                fontFamily: bodyFont,
                fontSize: `${fs.body}px`,
                color: 'rgba(255,255,255,0.75)',
                margin: 0,
                lineHeight: 1.45,
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}>
                <bdi data-pdf-link={part.href}>{part.text}</bdi>
              </p>
            </div>
          ))}
        </div>

        {/* ── Sidebar sections (skills, languages, certs, awards) ── */}
        {sidebarSections.map(section => (
          <div key={section.id} style={{ padding: `0 ${sp.pad * 0.55}px ${sp.section * 0.7}px` }}>
            <SideHeading title={section.title} gold={goldSide} headingFont={headingFont} fs={fs} />

            {section.type === 'skills' ? (
              <SkillLines items={section.items.map((i: any) => i.name)} primary={goldSide} fs={fs} tone="dark" />
            ) : (
              section.items.map((item: any, i: number) => (
                <SideItem key={i} item={item} sectionType={section.type} gold={goldSide} bodyFont={bodyFont} fs={fs} sp={sp} />
              ))
            )}
          </div>
        ))}
      </div>

      {/* ═══════════════════════ MAIN CONTENT ═══════════════════════ */}
      <div style={{
        flex: 1,
        minWidth: 0,
        padding: `${sp.headerPad}px ${sp.pad * 0.85}px`,
        display: 'flex',
        flexDirection: 'column',
        background: WHITE,
      }}>
        {/* ── Summary ── */}
        {cv.personalInfo.summary && (
          <div style={{ marginBottom: `${sp.section}px` }}>
            <MainHeading title={doc.labels.profile} gold={gold} headingFont={headingFont} fs={fs} />
            <p style={{
              fontFamily: bodyFont,
              fontSize: `${fs.name}px`,
              color: INK.body,
              lineHeight: 1.8,
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              whiteSpace: 'pre-line',
              fontStyle: 'italic',
            }} dir="auto">
              {cv.personalInfo.summary}
            </p>
          </div>
        )}

        {/* ── Main sections ── */}
        {mainSections.map(section => {
          const isExperienceOrEdu = section.type === 'experience' || section.type === 'education';
          return (
            <div key={section.id} style={{ marginBottom: `${sp.section}px` }}>
              <MainHeading title={section.title} gold={gold} headingFont={headingFont} fs={fs} />

              {section.type === 'skills' ? (
                /* Skills in the main column: a separated run */
                <SkillList items={section.items.map((i: any) => i.name)} primary={gold} fs={fs} />
              ) : isExperienceOrEdu ? (
                /* Experience / Education — timeline style */
                <div>
                  {section.items.map((item: any, i: number) => (
                    <TimelineItem
                      key={i}
                      item={item}
                      gold={gold}
                      bodyFont={bodyFont}
                      headingFont={headingFont}
                      fs={fs}
                      sp={sp}
                      isLast={i === section.items.length - 1}
                    />
                  ))}
                </div>
              ) : (
                /* Generic sections */
                section.items.map((item: any, i: number) => {
                  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' };
                  const labelStyle: React.CSSProperties = { fontFamily: headingFont, fontSize: `${fs.name}px`, fontWeight: 600, color: SLATE };
                  const detailStyle: React.CSSProperties = { fontFamily: bodyFont, fontSize: `${fs.body}px`, color: INK.body, marginTop: '3px', lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-line' };

                  // References: name, "title, company", "email · phone",
                  // relationship — plain text in the generic styles, no date.
                  if (section.type === 'references') {
                    const ref = referenceLines(item);
                    return (
                      <div key={i} style={{ marginBottom: `${sp.item}px` }}>
                        {ref.name && (
                          <div style={rowStyle}>
                            <span style={labelStyle}>{ref.name}</span>
                          </div>
                        )}
                        {ref.details.map((line, j) => (
                          <p key={j} style={detailStyle}>{line}</p>
                        ))}
                      </div>
                    );
                  }

                  const parts = genericItemParts(item, section.type, doc.lang);
                  const lineStyle: Record<ItemLine['kind'], React.CSSProperties> = {
                    subtitle: { ...detailStyle, fontSize: `${fs.name}px`, fontWeight: 500, color: INK.subtle },
                    detail: detailStyle,
                    meta: { ...detailStyle, fontSize: `${fs.meta}px`, color: INK.meta },
                    link: { ...detailStyle, fontSize: `${fs.meta}px`, color: gold, wordBreak: 'break-all' },
                  };
                  return (
                    <div key={i} style={{ marginBottom: `${sp.item}px` }}>
                      <div style={rowStyle}>
                        <span dir="auto" style={labelStyle}>
                          {parts.label}
                        </span>
                        {parts.date && (
                          <span style={{ fontSize: `${fs.meta}px`, fontWeight: 600, color: gold, flexShrink: 0 }}>
                            {parts.date}
                          </span>
                        )}
                      </div>
                      {parts.lines.map((line, j) => <ItemLineView key={j} line={line} style={lineStyle[line.kind]} />)}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
    </CVDocumentProvider>
  );
}
