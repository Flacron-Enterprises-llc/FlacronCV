'use client';

/**
 * Compact Layout — "Executive"
 * Inline header · 2-column body (experience left 60% / metadata right 40%) · Dense, high info-density
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import type { LayoutProps } from './shared';
import { getTokens, hexToRgba, buildContactLine, buildLinksLine, SectionHeading, ItemRenderer, SkillBadge } from './shared';
import { CVSectionType } from '@flacroncv/shared-types';

// Sections that belong in the right column (secondary)
const RIGHT_TYPES = new Set<string>([
  CVSectionType.SKILLS,
  CVSectionType.EDUCATION,
  CVSectionType.LANGUAGES,
  CVSectionType.CERTIFICATIONS,
  CVSectionType.AWARDS,
  CVSectionType.REFERENCES,
]);

export default function CompactLayout({ cv, sections }: LayoutProps) {
  const t = useTranslations('cv_builder');
  const { primary, bodyFont, headingFont, fs, sp, br, sectionStyle } = getTokens(cv);
  const showPhoto = cv.styling.showPhoto && cv.personalInfo.photoURL;

  // Compact uses tighter spacing regardless of setting
  const tightSp = { ...sp, section: Math.round(sp.section * 0.85), item: Math.round(sp.item * 0.8) };

  const leftSections  = sections.filter(s => !RIGHT_TYPES.has(s.type));
  const rightSections = sections.filter(s => RIGHT_TYPES.has(s.type));

  return (
    <div style={{
      fontFamily: bodyFont,
      color: '#1a1a1a',
      background: '#fff',
      minHeight: '842px',
      padding: `${sp.pad * 0.75}px ${sp.pad}px`,
    }}>
      {/* ── Compact header: photo + name + contact inline ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        borderBottom: `3px solid ${primary}`,
        paddingBottom: `${tightSp.item + 2}px`,
        marginBottom: `${tightSp.section}px`,
      }}>
        {showPhoto && (
          <img
            src={cv.personalInfo.photoURL!}
            alt="Profile"
            style={{
              width: '58px', height: '58px',
              borderRadius: br,
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        )}

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{
              fontFamily: headingFont,
              fontSize: `${fs.nameTop}px`,
              fontWeight: 800,
              color: primary,
              margin: 0,
              letterSpacing: '-0.3px',
            }}>
              {cv.personalInfo.firstName} {cv.personalInfo.lastName}
            </h1>
            {cv.personalInfo.headline && (
              <span style={{ fontSize: `${fs.name}px`, color: '#666', fontWeight: 400 }}>
                {cv.personalInfo.headline}
              </span>
            )}
          </div>
          <p style={{ fontSize: `${fs.body}px`, color: '#888', margin: '4px 0 0', letterSpacing: '0.2px' }}>
            {buildContactLine(cv)}
            {(cv.personalInfo.linkedin || cv.personalInfo.website) && (
              <span style={{ marginLeft: '10px', color: '#aaa' }}>{buildLinksLine(cv)}</span>
            )}
          </p>
        </div>
      </div>

      {/* ── Summary (full-width) ── */}
      {cv.personalInfo.summary && (
        <div style={{ marginBottom: `${tightSp.section}px` }}>
          <SectionHeading title={t('template_summary')} primary={primary} headingFont={headingFont} fs={fs} sectionStyle={sectionStyle} br={br} />
          <p style={{ fontSize: `${fs.body}px`, lineHeight: 1.65, color: '#333' }}>
            {cv.personalInfo.summary}
          </p>
        </div>
      )}

      {/* ── 2-column body ── */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* Left — Experience + Projects + other primary sections */}
        <div style={{ flex: '0 0 60%' }}>
          {leftSections.map(section => (
            <div key={section.id} style={{ marginBottom: `${tightSp.section}px` }}>
              <SectionHeading title={section.title} primary={primary} headingFont={headingFont} fs={fs} sectionStyle={sectionStyle} br={br} />
              {section.items.map((item: any, i) => (
                <ItemRenderer key={i} item={item} sectionType={section.type} primary={primary} fs={fs} sp={tightSp} br={br} variant="default" />
              ))}
            </div>
          ))}
        </div>

        {/* Right — Education, Skills, Languages, Certs */}
        <div style={{ flex: '0 0 calc(40% - 20px)' }}>
          {rightSections.map(section => (
            <div key={section.id} style={{ marginBottom: `${tightSp.section}px` }}>
              <SectionHeading title={section.title} primary={primary} headingFont={headingFont} fs={fs} sectionStyle={sectionStyle} br={br} />
              {section.type === 'skills' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  {section.items.map((item: any, i) => (
                    <SkillBadge key={i} name={item.name} primary={primary} fs={fs} br={br} variant="default" />
                  ))}
                </div>
              ) : (
                section.items.map((item: any, i) => (
                  <ItemRenderer key={i} item={item} sectionType={section.type} primary={primary} fs={fs} sp={tightSp} br={br} variant="default" />
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
