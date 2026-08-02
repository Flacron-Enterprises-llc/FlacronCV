'use client';

/**
 * Top-Bar Layout — "Creative/Bold"
 * Full-width color header band · Square photo with radius · Card-based sections with left accent border
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import type { LayoutProps } from './shared';
import { getTokens, hexToRgba, darken, ensureDarkSurface, INK, buildContactLine, buildLinksLine, SectionHeading, ItemRenderer, SkillList } from './shared';

export default function TopBarLayout({ cv, sections }: LayoutProps) {
  const t = useTranslations('cv_builder');
  const { primary, bodyFont, headingFont, fs, sp, br, sectionStyle } = getTokens(cv);
  const showPhoto = cv.styling.showPhoto && cv.personalInfo.photoURL;
  // The hero band carries the name, the job title and the contact line, all in
  // white — so it has to be dark enough for white regardless of which accent
  // the user picked. See ensureDarkSurface.
  const headerBg = ensureDarkSurface(primary);
  const headerTextColor = '#fff';
  const photoSize = fs.nameHero * 2.4; // proportional to name size
  // Trimmed so a missing first/last name yields '' rather than a lone space,
  // which would still render a full-height (but blank) hero heading.
  const fullName = `${cv.personalInfo.firstName ?? ''} ${cv.personalInfo.lastName ?? ''}`.trim();

  return (
    <div style={{
      fontFamily: bodyFont,
      color: INK.heading,
      background: '#fff',
      minHeight: '1122px',
      // Column + a flex:1 body below, so the white page runs to the bottom edge.
      // With the body sized to its content, anything shorter than a full page
      // left the root's own background showing as a grey band across the foot
      // of the sheet — visible in the preview and baked into the exported PDF.
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Hero Header Band ── */}
      <div style={{
        background: `linear-gradient(135deg, ${headerBg} 0%, ${darken(headerBg, 0.2)} 100%)`,
        padding: `${sp.headerPad}px ${sp.pad}px`,
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
      }}>
        {showPhoto && (
          <img
            src={cv.personalInfo.photoURL!}
            alt="Profile"
            style={{
              width: `${photoSize}px`,
              height: `${photoSize}px`,
              borderRadius: br === '0px' ? '4px' : br,
              objectFit: 'cover',
              flexShrink: 0,
              border: '3px solid rgba(255,255,255,0.4)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          />
        )}

        <div style={{ flex: 1 }}>
          {/* Only reserve the hero line when there is actually a name.
              Rendering `{firstName} {lastName}` unconditionally emitted a
              full-height heading containing a single space whenever the user
              had not filled their name in yet — so the banner stayed tall and
              looked empty except for the contact line, which is exactly how a
              half-finished CV ends up looking broken rather than incomplete. */}
          {fullName && (
            <h1 style={{
              fontFamily: headingFont,
              fontSize: `${fs.nameHero}px`,
              fontWeight: 900,
              color: headerTextColor,
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: '-0.8px',
            }}>
              {fullName}
            </h1>
          )}

          {cv.personalInfo.headline && (
            <p style={{
              fontSize: `${fs.headline}px`,
              color: 'rgba(255,255,255,0.85)',
              margin: '5px 0 0',
              fontWeight: 400,
              letterSpacing: '0.3px',
            }}>
              {cv.personalInfo.headline}
            </p>
          )}

          <p style={{
            fontSize: `${fs.body}px`,
            color: 'rgba(255,255,255,0.7)',
            margin: '8px 0 0',
            letterSpacing: '0.2px',
          }}>
            {buildContactLine(cv)}
          </p>

          {(cv.personalInfo.linkedin || cv.personalInfo.website) && (
            <p style={{ fontSize: `${fs.meta}px`, color: 'rgba(255,255,255,0.55)', margin: '3px 0 0' }}>
              {buildLinksLine(cv)}
            </p>
          )}
        </div>
      </div>

      {/* ── Accent strip ── */}
      <div style={{ height: '4px', background: `linear-gradient(90deg, ${darken(primary, 0.25)}, ${hexToRgba(primary, 0.3)}, transparent)` }} />

      {/* ── Body ── */}
      <div style={{ flex: 1, padding: `${sp.section}px ${sp.pad}px`, background: '#fff' }}>
        {/* Summary */}
        {cv.personalInfo.summary && (
          <div style={{ marginBottom: `${sp.section}px` }}>
            <SectionHeading title={t('template_about_me')} primary={primary} headingFont={headingFont} fs={fs} sectionStyle="left-border" br={br} />
            <p style={{ fontSize: `${fs.name}px`, lineHeight: 1.8, color: INK.body, margin: 0, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>
              {cv.personalInfo.summary}
            </p>
          </div>
        )}

        {/* Sections — rendered as card items */}
        {sections.map(section => (
          <div key={section.id} style={{ marginBottom: `${sp.section}px` }}>
            <SectionHeading title={section.title} primary={primary} headingFont={headingFont} fs={fs} sectionStyle="left-border" br={br} />

            {section.type === 'skills' ? (
              // Set as text, directly under the heading — no panel, no tags.
              // Every other section sits directly under its heading; skills now
              // do too, instead of being fenced off in a box of their own.
              <SkillList items={section.items.map((i: any) => i.name)} primary={primary} fs={fs} />
            ) : (
              section.items.map((item: any, i) => (
                <ItemRenderer key={i} item={item} sectionType={section.type} primary={primary} fs={fs} sp={sp} br={br} variant="card" />
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
