'use client';

/**
 * CVThumbnail
 *
 * A miniature, layout-accurate representation of a CV used across:
 *  - The "My CVs" list cards
 *  - The Template-picker on /cv/new
 *  - The Design panel in the editor toolbar
 *
 * Accepts either a full CV object (uses real color + personal info) or
 * just `layout` + `color` scalars (used where no CV exists yet).
 */

import React from 'react';
import type { CV } from '@flacroncv/shared-types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface CVThumbnailCVProps {
  /** Full CV object — color, layout, name all come from here. */
  cv: CV;
  layout?: never;
  color?: never;
  name?: never;
}

interface CVThumbnailRawProps {
  cv?: never;
  /** Layout key when no CV is available (e.g. template picker). */
  layout: 'classic' | 'sidebar' | 'top-bar' | 'compact';
  /** Accent / primary color. */
  color: string;
  /** Optional display name shown in the header area. */
  name?: string;
}

export type CVThumbnailProps = CVThumbnailCVProps | CVThumbnailRawProps;

// ─── Tiny reusable "paper bar" ────────────────────────────────────────────────

function Bar({
  width,
  height = 3,
  bg = '#f3f4f6',
  style,
}: {
  width: string | number;
  height?: number;
  bg?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        height,
        width: typeof width === 'number' ? `${width}%` : width,
        background: bg,
        borderRadius: 2,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

// ─── Layout renderers ─────────────────────────────────────────────────────────

interface RendererProps {
  color: string;
  initials: string;
  hasName: boolean;
}

function SidebarThumb({ color, initials, hasName }: RendererProps) {
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div
        style={{
          width: '32%',
          background: color,
          padding: '6px 4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        {/* Avatar circle */}
        <div
          style={{
            width: 20, height: 20, borderRadius: '50%',
            background: 'rgba(255,255,255,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 5, fontWeight: 700, color: '#fff',
            flexShrink: 0, marginBottom: 3,
          }}
        >
          {initials}
        </div>
        {/* Name bar */}
        {hasName && (
          <Bar width="80%" bg="rgba(255,255,255,0.75)" height={2} />
        )}
        {/* Content stubs */}
        {[60, 90, 70, 55, 80].map((w, i) => (
          <Bar key={i} width={`${w}%`} bg="rgba(255,255,255,0.28)" height={2} />
        ))}
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1, background: '#fff', padding: '6px 5px',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}
      >
        {/* Section heading stub */}
        <Bar width="55%" bg={`${color}55`} height={3} />
        {[80, 65, 90, 50, 75, 60, 85].map((w, i) => (
          <Bar key={i} width={`${w}%`} bg={i % 3 === 0 ? '#d1d5db' : '#f3f4f6'} height={3} />
        ))}
      </div>
    </div>
  );
}

function TopBarThumb({ color, initials, hasName }: RendererProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Top bar header */}
      <div
        style={{
          background: color, padding: '7px 6px',
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
        }}
      >
        {/* Photo placeholder */}
        <div
          style={{
            width: 18, height: 18, borderRadius: 3,
            background: 'rgba(255,255,255,0.3)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 4, fontWeight: 700, color: '#fff',
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Bar width={hasName ? '60%' : '65%'} bg="rgba(255,255,255,0.88)" height={4} />
          <Bar width="45%" bg="rgba(255,255,255,0.50)" height={2} />
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1, background: '#fff', padding: '5px 6px',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}
      >
        <Bar width="50%" bg={`${color}55`} height={3} />
        {[85, 70, 90, 60, 80, 55].map((w, i) => (
          <Bar key={i} width={`${w}%`} bg={i === 0 || i === 3 ? '#d1d5db' : '#f3f4f6'} height={3} />
        ))}
      </div>
    </div>
  );
}

function CompactThumb({ color, initials, hasName }: RendererProps) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
        background: '#fff', padding: 6, gap: 3,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4, borderBottom: `2px solid ${color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div
            style={{
              width: 14, height: 14, borderRadius: 2,
              background: color, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 4, fontWeight: 700, color: '#fff',
            }}
          >
            {initials}
          </div>
          <Bar width={hasName ? 40 : 36} bg={color} height={4} />
        </div>
        <Bar width={28} bg="#e5e7eb" height={3} />
      </div>

      {/* Two-column content */}
      <div style={{ display: 'flex', gap: 5, flex: 1 }}>
        <div style={{ flex: '0 0 58%', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Bar width="75%" bg={`${color}55`} height={3} />
          {[90, 75, 85, 60, 80].map((w, i) => (
            <Bar key={i} width={`${w}%`} bg="#f3f4f6" height={3} />
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Bar width="70%" bg={`${color}55`} height={3} />
          {[85, 70, 60, 80, 55].map((w, i) => (
            <Bar key={i} width={`${w}%`} bg="#f3f4f6" height={3} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ClassicThumb({ color, initials, hasName }: RendererProps) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
        background: '#fff', padding: '8px 6px', alignItems: 'center', gap: 3,
      }}
    >
      {/* Name */}
      <Bar width={hasName ? '55%' : '50%'} bg={color} height={5} />
      {/* Headline */}
      <Bar width="38%" bg="#d1d5db" height={2.5} />
      {/* Divider */}
      <div style={{ height: 2, width: '100%', background: `linear-gradient(90deg, ${color}, transparent)`, marginBottom: 2, borderRadius: 1 }} />
      {/* Section heading */}
      <Bar width="45%" bg={`${color}55`} height={3} />
      {/* Content bars */}
      {[90, 75, 85, 60, 80, 65].map((w, i) => (
        <Bar key={i} width={`${w}%`} bg="#f3f4f6" height={3} />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CVThumbnail(props: CVThumbnailProps) {
  const layout  = props.cv ? ((props.cv.styling as any).layout || 'classic') as string : props.layout;
  const color   = props.cv ? (props.cv.styling.primaryColor || '#2563eb') : props.color;
  const rawName = props.cv
    ? `${props.cv.personalInfo?.firstName ?? ''} ${props.cv.personalInfo?.lastName ?? ''}`.trim()
    : (props.name ?? '');

  const hasName = rawName.length > 0;
  const parts   = rawName.split(' ').filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : parts[0]
      ? parts[0].slice(0, 2).toUpperCase()
      : '';

  const rendererProps: RendererProps = { color, initials, hasName };

  if (layout === 'sidebar')  return <SidebarThumb  {...rendererProps} />;
  if (layout === 'top-bar')  return <TopBarThumb   {...rendererProps} />;
  if (layout === 'compact')  return <CompactThumb  {...rendererProps} />;
  return <ClassicThumb {...rendererProps} />;
}
