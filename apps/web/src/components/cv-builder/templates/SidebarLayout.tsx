'use client';

/**
 * Sidebar Layout — "Corporate Professional"
 * 30/70 split · Solid-color left sidebar · Photo, contact & metadata on left · Experience & education on right
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import type { LayoutProps } from './shared';
import {
  getTokens, ensureDarkSurface, INK,
  splitSections, SidebarSectionHeading, SectionHeading,
  ItemRenderer, SkillLines,
} from './shared';

export default function SidebarLayout({ cv, sections }: LayoutProps) {
  const t = useTranslations('cv_builder');
  const { primary, bodyFont, headingFont, fs, sp, br, sectionStyle } = getTokens(cv);
  const showPhoto = cv.styling.showPhoto && cv.personalInfo.photoURL;
  const { sidebar: sidebarSections, main: mainSections } = splitSections(sections);

  // Every mark in the sidebar is white or white-alpha, so the panel has to be
  // dark enough to carry white. A 5% darken of the accent was fine for the
  // preset navys and left a pale accent as a blank white-on-white column.
  const sidebarBg = ensureDarkSurface(primary);
  const sidebarWidth = '30%';
  const mainWidth = '70%';

  return (
    <div style={{
      fontFamily: bodyFont,
      color: '#1a1a1a',
      background: '#fff',
      // 1122px = A4 height at 96dpi (794px wide capture). Using this as minHeight
      // ensures the sidebar color fills the full page even when content is short.
      // The flex default align-items:stretch then extends the sidebar to match.
      minHeight: '1122px',
      display: 'flex',
    }}>
      {/* ── Left Sidebar ── */}
      <div style={{
        width: sidebarWidth,
        minWidth: 0,
        background: sidebarBg,
        padding: `${sp.headerPad}px ${sp.pad * 0.6}px`,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: `${sp.section}px`,
      }}>
        {/* Photo + Name */}
        <div style={{ textAlign: 'center' }}>
          {showPhoto ? (
            <img
              src={cv.personalInfo.photoURL!}
              alt="Profile"
              style={{
                width: '80px', height: '80px', borderRadius: '50%',
                objectFit: 'cover', display: 'block', margin: '0 auto 10px',
                border: '3px solid rgba(255,255,255,0.6)',
              }}
            />
          ) : (
            /* Monogram placeholder */
            <div style={{
              width: '70px', height: '70px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 10px',
              fontSize: `${fs.nameTop}px`, fontWeight: 700,
              color: '#fff', fontFamily: headingFont,
            }}>
              {(cv.personalInfo.firstName?.[0] || '') + (cv.personalInfo.lastName?.[0] || '')}
            </div>
          )}

          {/* Given name light, family name bold, on two lines. The column is
              only 30% wide, so the name would break somewhere regardless —
              breaking it deliberately at the space is better than letting it
              land mid-word, and the weight contrast turns the forced break into
              part of the design. overflowWrap catches the genuinely long single
              name that still will not fit on one line. */}
          <h1 style={{
            fontFamily: headingFont,
            fontSize: `${fs.nameTop}px`,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.92)',
            margin: 0,
            lineHeight: 1.18,
            letterSpacing: '0.2px',
            overflowWrap: 'break-word',
          }}>
            {cv.personalInfo.firstName}
            {cv.personalInfo.lastName && (
              <>
                <br />
                <span style={{ fontWeight: 800, color: '#fff' }}>{cv.personalInfo.lastName}</span>
              </>
            )}
          </h1>

          {cv.personalInfo.headline && (
            <p style={{
              fontSize: `${fs.body}px`,
              color: 'rgba(255,255,255,0.78)',
              margin: '7px 0 0',
              lineHeight: 1.5,
              letterSpacing: '0.3px',
            }}>
              {cv.personalInfo.headline}
            </p>
          )}
        </div>

        {/* Contact */}
        <div>
          <SidebarSectionHeading title={t('template_contact')} headingFont={headingFont} fs={fs} />
          {[
            cv.personalInfo.email,
            cv.personalInfo.phone,
            [cv.personalInfo.city, cv.personalInfo.country].filter(Boolean).join(', '),
            cv.personalInfo.linkedin,
            cv.personalInfo.website,
          ].filter(Boolean).map((line, i) => (
            <p key={i} style={{ fontSize: `${fs.body}px`, color: 'rgba(255,255,255,0.84)', margin: '4px 0', lineHeight: 1.45, wordBreak: 'break-word' }}>
              {line}
            </p>
          ))}
        </div>

        {/* Sidebar sections (skills, languages, certs, awards) */}
        {sidebarSections.map(section => (
          <div key={section.id}>
            <SidebarSectionHeading title={section.title} headingFont={headingFont} fs={fs} />
            {section.type === 'skills' ? (
              <SkillLines items={section.items.map((i: any) => i.name)} primary={primary} fs={fs} tone="dark" />
            ) : (
              section.items.map((item: any, i) => (
                <ItemRenderer key={i} item={item} sectionType={section.type} primary={primary} fs={fs} sp={sp} br={br} variant="sidebar" />
              ))
            )}
          </div>
        ))}
      </div>

      {/* ── Main Content ── */}
      <div style={{
        width: mainWidth,
        minWidth: 0,
        padding: `${sp.headerPad}px ${sp.pad * 0.75}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: `${sp.section}px`,
      }}>
        {/* Summary */}
        {cv.personalInfo.summary && (
          <div>
            <SectionHeading title={t('template_profile')} primary={primary} headingFont={headingFont} fs={fs} sectionStyle={sectionStyle} br={br} />
            <p style={{ fontSize: `${fs.name}px`, lineHeight: 1.75, color: INK.body, margin: 0, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>
              {cv.personalInfo.summary}
            </p>
          </div>
        )}

        {/* Main sections */}
        {mainSections.map(section => (
          <div key={section.id}>
            <SectionHeading title={section.title} primary={primary} headingFont={headingFont} fs={fs} sectionStyle={sectionStyle} br={br} />
            {section.items.map((item: any, i) => (
              <ItemRenderer key={i} item={item} sectionType={section.type} primary={primary} fs={fs} sp={sp} br={br} variant="default" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
