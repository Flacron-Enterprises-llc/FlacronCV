'use client';

import React, { useMemo } from 'react';
import ClassicLayout from '@/components/cv-builder/templates/ClassicLayout';
import SidebarLayout from '@/components/cv-builder/templates/SidebarLayout';
import TopBarLayout from '@/components/cv-builder/templates/TopBarLayout';
import CompactLayout from '@/components/cv-builder/templates/CompactLayout';
import { buildSampleCVForTemplate, SAMPLE_SECTIONS } from '@/lib/previewSampleCV';
import type { CV } from '@flacroncv/shared-types';

const PAGE_W = 794;
const PAGE_H = 1122;
const THUMB_W = 800;
const THUMB_H = 480;
const THUMB_SCALE = THUMB_W / PAGE_W;

function LayoutFor({ cv }: { cv: CV }) {
  const props = { cv, sections: SAMPLE_SECTIONS };
  switch (cv.styling.layout) {
    case 'sidebar':
      return <SidebarLayout {...props} />;
    case 'top-bar':
      return <TopBarLayout {...props} />;
    case 'compact':
      return <CompactLayout {...props} />;
    default:
      return <ClassicLayout {...props} />;
  }
}

export default function CaptureClient({ templateId }: { templateId: string }) {
  const cv = useMemo(() => buildSampleCVForTemplate(templateId), [templateId]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#d6d3d1',
        padding: 24,
        display: 'flex',
        gap: 32,
        alignItems: 'flex-start',
      }}
    >
      <div
        id="capture-page"
        style={{
          width: PAGE_W,
          height: PAGE_H,
          overflow: 'hidden',
          background: '#fff',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      >
        <LayoutFor cv={cv} />
      </div>
      <div
        id="capture-thumb"
        style={{
          width: THUMB_W,
          height: THUMB_H,
          overflow: 'hidden',
          background: '#fff',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: PAGE_W,
            transform: `scale(${THUMB_SCALE})`,
            transformOrigin: 'top left',
          }}
        >
          <LayoutFor cv={cv} />
        </div>
      </div>
    </div>
  );
}
