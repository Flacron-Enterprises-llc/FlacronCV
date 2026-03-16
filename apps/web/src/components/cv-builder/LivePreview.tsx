'use client';

import React from 'react';
import { useCVStore } from '@/store/cv-store';
import type { CVSection } from '@flacroncv/shared-types';
import ClassicLayout from './templates/ClassicLayout';
import SidebarLayout from './templates/SidebarLayout';
import TopBarLayout  from './templates/TopBarLayout';
import CompactLayout from './templates/CompactLayout';

export default function LivePreview() {
  const { cv, sections } = useCVStore();
  if (!cv) return null;

  const layout = (cv.styling as any).layout || 'classic';

  const visibleSections: CVSection[] = sections
    .filter(s => s.isVisible)
    .sort((a, b) => {
      const oa = cv.sectionOrder.indexOf(a.id);
      const ob = cv.sectionOrder.indexOf(b.id);
      return oa - ob;
    });

  const props = { cv, sections: visibleSections };

  return (
    <div className="mx-auto max-w-[595px]">
      <div id="cv-preview-content" className="rounded-lg shadow-lg overflow-hidden" style={{ background: '#fff' }}>
        {layout === 'sidebar'  && <SidebarLayout  {...props} />}
        {layout === 'top-bar'  && <TopBarLayout   {...props} />}
        {layout === 'compact'  && <CompactLayout  {...props} />}
        {(layout === 'classic' || !['sidebar','top-bar','compact'].includes(layout)) && (
          <ClassicLayout {...props} />
        )}
      </div>
    </div>
  );
}
