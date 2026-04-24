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
import { useTranslations } from 'next-intl';
import type { LayoutProps } from './shared';
import {
  getTokens, hexToRgba, darken,
  splitSections, formatCVDate, SkillBadge,
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
    <div style={{ marginBottom: '10px' }}>
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
    <div style={{ marginBottom: '8px' }}>
      <h3 style={{
        fontFamily: headingFont,
        fontSize: `${fs.sectionTitle - 1}px`,
        fontWeight: 700,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: gold,
        margin: 0,
        paddingBottom: '5px',
        borderBottom: `1px solid rgba(201,168,76,0.30)`,
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
  const isExperience = !!(item.position || item.company);
  const isEducation  = !!item.institution;

  const title    = isExperience ? item.position : isEducation ? `${item.degree || ''}${item.field ? ` in ${item.field}` : ''}` : (item.name || item.title || '');
  const subtitle = isExperience ? `${item.company || ''}${item.location ? ` · ${item.location}` : ''}` : isEducation ? item.institution : (item.issuer || item.proficiency || '');
  const start    = formatCVDate(item.startDate);
  const end      = isExperience ? (item.isCurrent ? 'Present' : formatCVDate(item.endDate) || 'Present')
                                : formatCVDate(item.endDate);
  const dateStr  = start ? `${start}${end ? ` – ${end}` : ''}` : (end || formatCVDate(item.date) || '');

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
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
          <p style={{
            fontFamily: bodyFont,
            fontSize: `${fs.name}px`,
            fontWeight: 500,
            color: '#5a6a7a',
            margin: '2px 0 4px',
            lineHeight: 1.4,
          }}>
            {subtitle}
          </p>
        )}

        {/* Description */}
        {item.description && (
          <p style={{
            fontFamily: bodyFont,
            fontSize: `${fs.body}px`,
            color: '#4b5563',
            lineHeight: 1.7,
            margin: 0,
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}>
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Generic sidebar item ───────────────────────────────────────────────────── */

function SideItem({ item, gold, bodyFont, fs, sp }: {
  item: any; gold: string; bodyFont: string;
  fs: ReturnType<typeof getTokens>['fs'];
  sp: ReturnType<typeof getTokens>['sp'];
}) {
  const label  = item.name || item.title || item.degree || item.issuer || '';
  const detail = item.description || item.proficiency || item.field || '';
  const date   = formatCVDate(item.date || item.startDate);
  return (
    <div style={{ marginBottom: `${sp.item}px` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: bodyFont, fontSize: `${fs.name}px`, fontWeight: 600, color: 'rgba(255,255,255,0.90)' }}>
          {label}
        </span>
        {date && (
          <span style={{ fontSize: `${fs.meta}px`, color: gold }}>
            {date}
          </span>
        )}
      </div>
      {detail && (
        <p style={{ fontFamily: bodyFont, fontSize: `${fs.body}px`, color: 'rgba(255,255,255,0.60)', margin: '2px 0 0', lineHeight: 1.5 }}>
          {detail}
        </p>
      )}
    </div>
  );
}

/* ─── Main layout ────────────────────────────────────────────────────────────── */

export default function SlateGoldLayout({ cv, sections }: LayoutProps) {
  const t = useTranslations('cv_builder');
  const { primary, bodyFont, headingFont, fs, sp, br } = getTokens(cv);
  const gold   = primary;   // user's primaryColor doubles as the gold accent
  const goldDim = hexToRgba(gold, 0.80);

  const showPhoto = cv.styling.showPhoto && cv.personalInfo.photoURL;
  const { sidebar: sidebarSections, main: mainSections } = splitSections(sections);

  const initials =
    ((cv.personalInfo.firstName?.[0] || '') + (cv.personalInfo.lastName?.[0] || '')).toUpperCase();

  return (
    <div style={{
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
        borderTop: `4px solid ${gold}`,
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
                boxShadow: `0 0 0 4px ${hexToRgba(gold, 0.15)}`,
              }}
            />
          ) : (
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: hexToRgba(gold, 0.15),
              border: `2px solid ${hexToRgba(gold, 0.55)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
              fontFamily: headingFont,
              fontSize: `${fs.nameTop - 2}px`, fontWeight: 800,
              color: gold,
            }}>
              {initials}
            </div>
          )}

          {/* Name */}
          <h1 style={{
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
          </h1>

          {/* Headline */}
          {cv.personalInfo.headline && (
            <p style={{
              fontFamily: bodyFont,
              fontSize: `${fs.body}px`,
              color: goldDim,
              margin: '7px 0 0',
              lineHeight: 1.45,
              letterSpacing: '0.2px',
            }}>
              {cv.personalInfo.headline}
            </p>
          )}
        </div>

        {/* ── Contact ── */}
        <div style={{ padding: `${sp.section * 0.7}px ${sp.pad * 0.55}px` }}>
          <SideHeading title={t('template_contact')} gold={gold} headingFont={headingFont} fs={fs} />
          {[
            cv.personalInfo.email,
            cv.personalInfo.phone,
            [cv.personalInfo.city, cv.personalInfo.country].filter(Boolean).join(', '),
            cv.personalInfo.linkedin,
            cv.personalInfo.website,
          ].filter(Boolean).map((line, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '5px' }}>
              {/* Gold bullet */}
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: gold, marginTop: '5px', flexShrink: 0 }} />
              <p style={{
                fontFamily: bodyFont,
                fontSize: `${fs.body}px`,
                color: 'rgba(255,255,255,0.75)',
                margin: 0,
                lineHeight: 1.45,
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}>
                {line}
              </p>
            </div>
          ))}
        </div>

        {/* ── Sidebar sections (skills, languages, certs, awards) ── */}
        {sidebarSections.map(section => (
          <div key={section.id} style={{ padding: `0 ${sp.pad * 0.55}px ${sp.section * 0.7}px` }}>
            <SideHeading title={section.title} gold={gold} headingFont={headingFont} fs={fs} />

            {section.type === 'skills' ? (
              <div style={{ lineHeight: 'normal', marginBottom: '-4px' }}>
                {section.items.map((item: any, i: number) => (
                  <span key={i} style={{ display: 'inline-block', marginRight: '4px', marginBottom: '4px' }}>
                    <span style={{
                      display: 'inline-block',
                      verticalAlign: 'middle',
                      lineHeight: 1,
                      whiteSpace: 'nowrap',
                      background: hexToRgba(gold, 0.18),
                      color: goldDim,
                      border: `1px solid ${hexToRgba(gold, 0.35)}`,
                      padding: '4px 9px',
                      borderRadius: br,
                      fontSize: `${fs.body}px`,
                      fontWeight: 500,
                    }}>
                      {item.name}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              section.items.map((item: any, i: number) => (
                <SideItem key={i} item={item} gold={gold} bodyFont={bodyFont} fs={fs} sp={sp} />
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
            <MainHeading title={t('template_profile')} gold={gold} headingFont={headingFont} fs={fs} />
            <p style={{
              fontFamily: bodyFont,
              fontSize: `${fs.name}px`,
              color: '#374151',
              lineHeight: 1.8,
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              fontStyle: 'italic',
            }}>
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
                /* Skills in the main column: pill row */
                <div style={{ lineHeight: 'normal', marginBottom: '-4px' }}>
                  {section.items.map((item: any, i: number) => (
                    <span key={i} style={{ display: 'inline-block', marginRight: '4px', marginBottom: '4px' }}>
                      <SkillBadge name={item.name} primary={gold} fs={fs} br={br} variant="pill" />
                    </span>
                  ))}
                </div>
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
                  const label  = item.name || item.title || '';
                  const detail = item.description || item.issuer || item.proficiency || '';
                  const date   = formatCVDate(item.date || item.startDate);
                  return (
                    <div key={i} style={{ marginBottom: `${sp.item}px` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontFamily: headingFont, fontSize: `${fs.name}px`, fontWeight: 600, color: SLATE }}>
                          {label}
                        </span>
                        {date && (
                          <span style={{ fontSize: `${fs.meta}px`, fontWeight: 600, color: gold, flexShrink: 0 }}>
                            {date}
                          </span>
                        )}
                      </div>
                      {detail && (
                        <p style={{ fontFamily: bodyFont, fontSize: `${fs.body}px`, color: '#4b5563', marginTop: '2px', lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {detail}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
