'use client';

/**
 * Classic Layout — "Modern Minimal"
 * Single column · Centered header · Underline section headings · Clean whitespace
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import type { LayoutProps } from './shared';
import { getTokens, hexToRgba, buildContactLine, buildLinksLine, SectionHeading, ItemRenderer, SkillBadge } from './shared';

export default function ClassicLayout({ cv, sections }: LayoutProps) {
  const t = useTranslations('cv_builder');
  const { primary, bodyFont, headingFont, fs, sp, br, sectionStyle } = getTokens(cv);
  const showPhoto = cv.styling.showPhoto && cv.personalInfo.photoURL;

  return (
    <div style={{
      fontFamily: bodyFont,
      color: '#1a1a1a',
      background: '#fff',
      padding: `${sp.pad}px`,
      minHeight: '842px',
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
          color: primary,
          margin: 0,
          lineHeight: 1.15,
          letterSpacing: '-0.5px',
        }}>
          {cv.personalInfo.firstName} {cv.personalInfo.lastName}
        </h1>

        {cv.personalInfo.headline && (
          <p style={{ fontSize: `${fs.headline}px`, color: '#555', margin: '5px 0 0', letterSpacing: '0.2px' }}>
            {cv.personalInfo.headline}
          </p>
        )}

        <p style={{ fontSize: `${fs.body}px`, color: '#888', margin: '6px 0 0', letterSpacing: '0.3px' }}>
          {buildContactLine(cv)}
        </p>

        {(cv.personalInfo.linkedin || cv.personalInfo.website) && (
          <p style={{ fontSize: `${fs.meta}px`, color: '#aaa', margin: '3px 0 0' }}>
            {buildLinksLine(cv)}
          </p>
        )}
      </div>

      {/* ── Thin divider ── */}
      <div style={{ height: '2px', background: `linear-gradient(90deg, ${primary}, transparent)`, marginBottom: `${sp.section}px` }} />

      {/* ── Summary ── */}
      {cv.personalInfo.summary && (
        <div style={{ marginBottom: `${sp.section}px` }}>
          <SectionHeading title={t('template_professional_summary')} primary={primary} headingFont={headingFont} fs={fs} sectionStyle={sectionStyle} br={br} />
          <p style={{ fontSize: `${fs.name}px`, lineHeight: 1.75, color: '#333' }}>
            {cv.personalInfo.summary}
          </p>
        </div>
      )}

      {/* ── Sections ── */}
      {sections.map(section => (
        <div key={section.id} style={{ marginBottom: `${sp.section}px` }}>
          <SectionHeading title={section.title} primary={primary} headingFont={headingFont} fs={fs} sectionStyle={sectionStyle} br={br} />

          {section.type === 'skills' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {section.items.map((item: any, i) => (
                <SkillBadge key={i} name={item.name} primary={primary} fs={fs} br={br} variant="pill" />
              ))}
            </div>
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
