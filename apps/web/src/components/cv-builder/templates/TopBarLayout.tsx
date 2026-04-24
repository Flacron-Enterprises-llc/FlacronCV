'use client';

/**
 * Top-Bar Layout — "Creative/Bold"
 * Full-width color header band · Square photo with radius · Card-based sections with left accent border
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import type { LayoutProps } from './shared';
import { getTokens, hexToRgba, darken, buildContactLine, buildLinksLine, SectionHeading, ItemRenderer, SkillBadge } from './shared';

export default function TopBarLayout({ cv, sections }: LayoutProps) {
  const t = useTranslations('cv_builder');
  const { primary, bodyFont, headingFont, fs, sp, br, sectionStyle } = getTokens(cv);
  const showPhoto = cv.styling.showPhoto && cv.personalInfo.photoURL;
  const headerBg = primary;
  const headerTextColor = '#fff';
  const photoSize = fs.nameHero * 2.4; // proportional to name size

  return (
    <div style={{
      fontFamily: bodyFont,
      color: '#1a1a1a',
      background: '#f8f9fa',
      minHeight: '1122px',
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
          <h1 style={{
            fontFamily: headingFont,
            fontSize: `${fs.nameHero}px`,
            fontWeight: 900,
            color: headerTextColor,
            margin: 0,
            lineHeight: 1.1,
            letterSpacing: '-0.8px',
          }}>
            {cv.personalInfo.firstName}{' '}
            <span style={{ fontWeight: 300 }}>{cv.personalInfo.lastName}</span>
          </h1>

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
      <div style={{ padding: `${sp.section}px ${sp.pad}px`, background: '#fff' }}>
        {/* Summary */}
        {cv.personalInfo.summary && (
          <div style={{ marginBottom: `${sp.section}px` }}>
            <SectionHeading title={t('template_about_me')} primary={primary} headingFont={headingFont} fs={fs} sectionStyle="left-border" br={br} />
            <p style={{ fontSize: `${fs.name}px`, lineHeight: 1.8, color: '#333', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              {cv.personalInfo.summary}
            </p>
          </div>
        )}

        {/* Sections — rendered as card items */}
        {sections.map(section => (
          <div key={section.id} style={{ marginBottom: `${sp.section}px` }}>
            <SectionHeading title={section.title} primary={primary} headingFont={headingFont} fs={fs} sectionStyle="left-border" br={br} />

            {section.type === 'skills' ? (
              <div style={{
                background: hexToRgba(primary, 0.04),
                border: `1px solid ${hexToRgba(primary, 0.15)}`,
                borderRadius: br,
                padding: '10px 12px',
                lineHeight: 'normal',
                marginBottom: '-5px',
              }}>
                {section.items.map((item: any, i) => (
                  <span key={i} style={{ display: 'inline-block', marginRight: '5px', marginBottom: '5px' }}>
                    <SkillBadge name={item.name} primary={primary} fs={fs} br={br} variant="pill" />
                  </span>
                ))}
              </div>
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
