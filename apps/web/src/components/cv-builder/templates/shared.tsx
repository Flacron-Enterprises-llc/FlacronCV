'use client';

import React from 'react';
import type { CV, CVSection } from '@flacroncv/shared-types';
import { fontNameToCssVar } from '../toolbar/FontPanel';

export interface LayoutProps {
  cv: CV;
  sections: CVSection[];
}

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
  const sp  = spacingScale[(cv.styling.spacing    || 'normal')  as keyof typeof spacingScale];
  const br  = borderRadiusScale[((cv.styling as any).borderRadius || 'small') as keyof typeof borderRadiusScale];
  const sectionStyle: string = (cv.styling as any).sectionStyle || 'underline';
  return { primary, secondary, bodyFont, headingFont, fs, sp, br, sectionStyle };
}

// ─── Colour helpers ──────────────────────────────────────────────────────────

export function hexToRgba(hex: string, alpha: number): string {
  const safe = hex.startsWith('#') ? hex : '#2563eb';
  const r = parseInt(safe.slice(1, 3), 16) || 0;
  const g = parseInt(safe.slice(3, 5), 16) || 0;
  const b = parseInt(safe.slice(5, 7), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function darken(hex: string, amount = 0.15): string {
  const safe = hex.startsWith('#') ? hex : '#2563eb';
  const r = Math.max(0, Math.round(parseInt(safe.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(safe.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(safe.slice(5, 7), 16) * (1 - amount)));
  return `rgb(${r},${g},${b})`;
}

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
  const base: React.CSSProperties = {
    fontFamily: headingFont,
    fontWeight: 700,
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    marginBottom: '8px',
    fontSize: `${fs.sectionTitle}px`,
  };

  if (sectionStyle === 'underline') {
    return (
      <h2 style={{ ...base, color: primary, borderBottom: `2px solid ${primary}`, paddingBottom: '4px' }}>
        {title}
      </h2>
    );
  }
  if (sectionStyle === 'card') {
    return (
      <h2 style={{ ...base, color: '#fff', background: primary, padding: '4px 10px', borderRadius: br, display: 'inline-block', marginBottom: '10px' }}>
        {title}
      </h2>
    );
  }
  if (sectionStyle === 'left-border') {
    return (
      <h2 style={{ ...base, color: primary, borderLeft: `4px solid ${primary}`, paddingLeft: '8px' }}>
        {title}
      </h2>
    );
  }
  // minimal
  return (
    <h2 style={{ ...base, color: '#666', borderBottom: '1px solid #e5e5e5', paddingBottom: '4px' }}>
      {title}
    </h2>
  );
}

// ─── Section-sidebar heading (always left-border, white text) ────────────────

export function SidebarSectionHeading({ title, headingFont, fs }: { title: string; headingFont: string; fs: HeadingProps['fs'] }) {
  return (
    <h3 style={{
      fontFamily: headingFont,
      fontSize: `${fs.sectionTitle - 1}px`,
      fontWeight: 700,
      letterSpacing: '0.8px',
      textTransform: 'uppercase',
      color: '#fff',
      borderBottom: '1px solid rgba(255,255,255,0.25)',
      paddingBottom: '4px',
      marginBottom: '8px',
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
  const isCard = variant === 'card';
  const isSidebar = variant === 'sidebar';

  const cardWrapper: React.CSSProperties = isCard ? {
    background: '#fff',
    border: `1px solid ${hexToRgba(primary, 0.15)}`,
    borderLeft: `3px solid ${primary}`,
    borderRadius: br,
    padding: '10px 12px',
    marginBottom: `${sp.item + 2}px`,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  } : {
    marginBottom: `${sp.item}px`,
  };

  const textColor = isSidebar ? '#e8e8e8' : '#444';
  const subtitleColor = isSidebar ? 'rgba(255,255,255,0.7)' : '#666';
  const metaColor = isSidebar ? 'rgba(255,255,255,0.5)' : '#999';

  if (item.position || item.company) {
    return (
      <div style={cardWrapper}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px' }}>
          <span style={{ fontSize: `${fs.headline}px`, fontWeight: 600, color: isSidebar ? '#fff' : '#1a1a1a' }}>
            {item.position}
          </span>
          <span style={{ fontSize: `${fs.meta}px`, color: metaColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {item.startDate}{item.endDate ? ` – ${item.endDate}` : ' – Present'}
          </span>
        </div>
        <p style={{ fontSize: `${fs.name}px`, color: subtitleColor, margin: '2px 0' }}>
          {item.company}{item.location ? ` · ${item.location}` : ''}
        </p>
        {item.description && (
          <p style={{ fontSize: `${fs.body}px`, color: textColor, marginTop: '4px', lineHeight: 1.65 }}>
            {item.description}
          </p>
        )}
      </div>
    );
  }

  if (item.institution) {
    return (
      <div style={cardWrapper}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px' }}>
          <span style={{ fontSize: `${fs.headline}px`, fontWeight: 600, color: isSidebar ? '#fff' : '#1a1a1a' }}>
            {item.degree}{item.field ? ` in ${item.field}` : ''}
          </span>
          <span style={{ fontSize: `${fs.meta}px`, color: metaColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {item.startDate}
          </span>
        </div>
        <p style={{ fontSize: `${fs.name}px`, color: subtitleColor, margin: '2px 0' }}>
          {item.institution}
        </p>
        {item.description && (
          <p style={{ fontSize: `${fs.body}px`, color: textColor, marginTop: '4px', lineHeight: 1.6 }}>
            {item.description}
          </p>
        )}
      </div>
    );
  }

  // Generic (project, certification, language, custom, award…)
  const label = item.name || item.title || '';
  const detail = item.description || item.issuer || item.proficiency || '';
  const date = item.date || item.startDate || '';
  return (
    <div style={cardWrapper}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: `${fs.name}px`, fontWeight: 600, color: isSidebar ? '#fff' : '#1a1a1a' }}>
          {label}
        </span>
        {date && <span style={{ fontSize: `${fs.meta}px`, color: metaColor, whiteSpace: 'nowrap' }}>{date}</span>}
      </div>
      {detail && (
        <p style={{ fontSize: `${fs.body}px`, color: textColor, marginTop: '2px', lineHeight: 1.55 }}>{detail}</p>
      )}
    </div>
  );
}

// ─── Skill badge ─────────────────────────────────────────────────────────────

export function SkillBadge({ name, primary, fs, br, variant = 'default' }: {
  name: string; primary: string;
  fs: ReturnType<typeof getTokens>['fs'];
  br: string;
  variant?: 'default' | 'sidebar' | 'pill';
}) {
  if (variant === 'sidebar') {
    return (
      <span style={{
        display: 'inline-block',
        background: 'rgba(255,255,255,0.2)',
        color: '#fff',
        padding: '3px 8px',
        borderRadius: br,
        fontSize: `${fs.body}px`,
        marginRight: '4px',
        marginBottom: '4px',
        border: '1px solid rgba(255,255,255,0.3)',
      }}>{name}</span>
    );
  }
  if (variant === 'pill') {
    return (
      <span style={{
        display: 'inline-block',
        background: hexToRgba(primary, 0.1),
        color: primary,
        border: `1px solid ${hexToRgba(primary, 0.3)}`,
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: `${fs.body}px`,
        fontWeight: 500,
        marginRight: '4px',
        marginBottom: '4px',
      }}>{name}</span>
    );
  }
  return (
    <span style={{
      display: 'inline-block',
      background: hexToRgba(primary, 0.1),
      color: primary,
      padding: '3px 10px',
      borderRadius: br,
      fontSize: `${fs.body}px`,
      fontWeight: 500,
      marginRight: '4px',
      marginBottom: '4px',
    }}>{name}</span>
  );
}

// ─── Contact line builder ─────────────────────────────────────────────────────

export function buildContactLine(cv: CV): string {
  return [
    cv.personalInfo.email,
    cv.personalInfo.phone,
    [cv.personalInfo.city, cv.personalInfo.country].filter(Boolean).join(', '),
  ].filter(Boolean).join('  ·  ');
}

export function buildLinksLine(cv: CV): string {
  return [cv.personalInfo.linkedin, cv.personalInfo.website].filter(Boolean).join('  ·  ');
}

// ─── Sidebar section splitter ─────────────────────────────────────────────────
// Skills, languages, certifications, awards → sidebar; rest → main

const SIDEBAR_SECTION_TYPES = new Set(['skills', 'languages', 'certifications', 'awards']);

export function splitSections(sections: CVSection[]) {
  const sidebar = sections.filter(s => SIDEBAR_SECTION_TYPES.has(s.type));
  const main    = sections.filter(s => !SIDEBAR_SECTION_TYPES.has(s.type));
  return { sidebar, main };
}
