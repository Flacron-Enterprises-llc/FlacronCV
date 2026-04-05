'use client';

/**
 * Sidebar Layout — "Corporate Professional"
 * 30/70 split · Solid-color left sidebar · Photo, contact & metadata on left · Experience & education on right
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import type { LayoutProps } from './shared';
import {
  getTokens, darken, buildContactLine, buildLinksLine,
  splitSections, SidebarSectionHeading, SectionHeading,
  ItemRenderer, SkillBadge,
} from './shared';

export default function SidebarLayout({ cv, sections }: LayoutProps) {
  const t = useTranslations('cv_builder');
  const { primary, bodyFont, headingFont, fs, sp, br, sectionStyle } = getTokens(cv);
  const showPhoto = cv.styling.showPhoto && cv.personalInfo.photoURL;
  const { sidebar: sidebarSections, main: mainSections } = splitSections(sections);

  const sidebarBg = darken(primary, 0.05);
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

          <h1 style={{
            fontFamily: headingFont,
            fontSize: `${fs.nameTop}px`,
            fontWeight: 800,
            color: '#fff',
            margin: 0,
            lineHeight: 1.2,
          }}>
            {cv.personalInfo.firstName}
            <br />
            {cv.personalInfo.lastName}
          </h1>

          {cv.personalInfo.headline && (
            <p style={{
              fontSize: `${fs.body}px`,
              color: 'rgba(255,255,255,0.75)',
              margin: '5px 0 0',
              lineHeight: 1.5,
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
            <p key={i} style={{ fontSize: `${fs.body}px`, color: 'rgba(255,255,255,0.8)', margin: '3px 0', lineHeight: 1.4, wordBreak: 'break-word' }}>
              {line}
            </p>
          ))}
        </div>

        {/* Sidebar sections (skills, languages, certs, awards) */}
        {sidebarSections.map(section => (
          <div key={section.id}>
            <SidebarSectionHeading title={section.title} headingFont={headingFont} fs={fs} />
            {section.type === 'skills' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                {section.items.map((item: any, i) => (
                  <SkillBadge key={i} name={item.name} primary={primary} fs={fs} br={br} variant="sidebar" />
                ))}
              </div>
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
        padding: `${sp.headerPad}px ${sp.pad * 0.75}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: `${sp.section}px`,
      }}>
        {/* Summary */}
        {cv.personalInfo.summary && (
          <div>
            <SectionHeading title={t('template_profile')} primary={primary} headingFont={headingFont} fs={fs} sectionStyle={sectionStyle} br={br} />
            <p style={{ fontSize: `${fs.name}px`, lineHeight: 1.75, color: '#333' }}>
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
