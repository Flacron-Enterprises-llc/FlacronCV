'use client';

/**
 * Classic Layout — "Modern Minimal"
 * Single column · Centered header · Underline section headings · Clean whitespace
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import type { LayoutProps } from './shared';
import { getTokens, readableOn, INK, buildContactLine, buildLinksLine, SectionHeading, ItemRenderer, SkillList } from './shared';

export default function ClassicLayout({ cv, sections }: LayoutProps) {
  const t = useTranslations('cv_builder');
  const { primary, bodyFont, headingFont, fs, sp, br, sectionStyle } = getTokens(cv);
  const showPhoto = cv.styling.showPhoto && cv.personalInfo.photoURL;
  // The name is set in the accent at 28px. Large text only needs 3:1, but a
  // pale accent still has to clear it — a name nobody can read is a worse
  // outcome than a name in a slightly deeper shade of the colour they picked.
  const nameInk = readableOn(primary, '#ffffff', 3.0);

  return (
    <div style={{
      fontFamily: bodyFont,
      color: '#1a1a1a',
      background: '#fff',
      padding: `${sp.pad}px`,
      minHeight: '1122px',
    }}>
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: `${sp.section}px` }}>
        {showPhoto && (
          <img
            src={cv.personalInfo.photoURL!}
            alt="Profile"
            style={{
              width: '76px', height: '76px', borderRadius: '50%',
              objectFit: 'cover', display: 'block', margin: '0 auto 12px',
              border: `3px solid ${primary}`,
            }}
          />
        )}

        <h1 style={{
          fontFamily: headingFont,
          fontSize: `${fs.nameHero}px`,
          fontWeight: 800,
          color: nameInk,
          margin: 0,
          lineHeight: 1.15,
          letterSpacing: '-0.5px',
        }}>
          {cv.personalInfo.firstName} {cv.personalInfo.lastName}
        </h1>

        {/* Job title, set in small caps under the name. Tracked uppercase at a
            step down from the name reads as a standing subtitle rather than as
            a second, weaker heading competing with it. */}
        {cv.personalInfo.headline && (
          <p style={{
            fontSize: `${fs.headline - 1}px`,
            color: INK.subtle,
            margin: '6px 0 0',
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>
            {cv.personalInfo.headline}
          </p>
        )}

        {/* Contact details are reference information, not decoration — they get
            read once, when someone decides to make contact, and they have to
            survive a laser printer to be usable at all. #888/#aaa did not. */}
        <p style={{ fontSize: `${fs.body}px`, color: INK.meta, margin: '8px 0 0', letterSpacing: '0.3px' }}>
          {buildContactLine(cv)}
        </p>

        {(cv.personalInfo.linkedin || cv.personalInfo.website) && (
          <p style={{ fontSize: `${fs.meta}px`, color: INK.meta, margin: '3px 0 0' }}>
            {buildLinksLine(cv)}
          </p>
        )}
      </div>

      {/* ── Divider ──
          A short centred accent rule between the identity block and the body.
          The previous full-width accent-to-transparent gradient faded out
          mid-page, which reads as a rendering artefact rather than a rule. */}
      <div style={{ textAlign: 'center', marginBottom: `${sp.section}px` }}>
        <div style={{ height: '2px', width: '56px', background: primary, display: 'inline-block' }} />
      </div>

      {/* ── Summary ── */}
      {cv.personalInfo.summary && (
        <div style={{ marginBottom: `${sp.section}px` }}>
          <SectionHeading title={t('template_professional_summary')} primary={primary} headingFont={headingFont} fs={fs} sectionStyle={sectionStyle} br={br} />
          <p style={{ fontSize: `${fs.name}px`, lineHeight: 1.75, color: INK.body, margin: 0, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>
            {cv.personalInfo.summary}
          </p>
        </div>
      )}

      {/* ── Sections ── */}
      {sections.map(section => (
        <div key={section.id} style={{ marginBottom: `${sp.section}px` }}>
          <SectionHeading title={section.title} primary={primary} headingFont={headingFont} fs={fs} sectionStyle={sectionStyle} br={br} />

          {section.type === 'skills' ? (
            <SkillList items={section.items.map((i: any) => i.name)} primary={primary} fs={fs} />
          ) : (
            section.items.map((item: any, i) => (
              <ItemRenderer key={i} item={item} sectionType={section.type} primary={primary} fs={fs} sp={sp} br={br} variant="default" />
            ))
          )}
        </div>
      ))}
    </div>
  );
}
