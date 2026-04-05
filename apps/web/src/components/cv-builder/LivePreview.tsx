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
      // indexOf returns -1 for IDs not yet in sectionOrder (e.g. just added and
      // not yet synced). Treat those as Infinity so they sort to the end, not
      // the beginning — keeps the preview order consistent with the saved CV.
      const normA = oa === -1 ? Infinity : oa;
      const normB = ob === -1 ? Infinity : ob;
      return normA - normB;
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
