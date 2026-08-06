'use client';

import React, { useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { useCVStore } from '@/store/cv-store';
import { useAuth } from '@/providers/AuthProvider';
import type { CVSection } from '@flacroncv/shared-types';
import { resolveEffectivePlan, effectiveCvLayout } from '@flacroncv/shared-types';
import { useAutoFitPage } from '@/hooks/useAutoFitPage';
import ClassicLayout   from './templates/ClassicLayout';
import SidebarLayout   from './templates/SidebarLayout';
import TopBarLayout    from './templates/TopBarLayout';
import CompactLayout   from './templates/CompactLayout';
import SlateGoldLayout from './templates/SlateGoldLayout';

export default function LivePreview() {
  const { cv, sections } = useCVStore();
  const { user } = useAuth();
  const t = useTranslations('cv_builder');
  const pageRef = useRef<HTMLDivElement>(null);

  // NOTE: everything below runs before the `!cv` early return so the hook order
  // stays unconditional (Rules of Hooks).
  const visibleSections: CVSection[] = useMemo(() => {
    const order = cv?.sectionOrder ?? [];
    return sections
      .filter((s) => s.isVisible)
      .sort((a, b) => {
        const oa = order.indexOf(a.id);
        const ob = order.indexOf(b.id);
        // indexOf returns -1 for IDs not yet in sectionOrder (e.g. just added and
        // not yet synced). Treat those as Infinity so they sort to the end, not
        // the beginning — keeps the preview order consistent with the saved CV.
        const normA = oa === -1 ? Infinity : oa;
        const normB = ob === -1 ? Infinity : ob;
        return normA - normB;
      });
  }, [sections, cv?.sectionOrder]);

  // Restarts the auto-fit measurement loop whenever anything that changes the
  // rendered height changes.
  const signature = useMemo(
    () => JSON.stringify({ s: cv?.styling, p: cv?.personalInfo, v: visibleSections }),
    [cv?.styling, cv?.personalInfo, visibleSections],
  );

  const { factor: fit, pageCount } = useAutoFitPage(pageRef, signature);

  if (!cv) return null;

  // Render the layout the user is actually entitled to. A premium layout stored
  // on a since-downgraded account gracefully falls back to a free one (the stored
  // value is untouched, so re-upgrading restores it). New premium selections are
  // blocked server-side (CVService.update), so a free user never stores one.
  const layout = effectiveCvLayout((cv.styling as any).layout, resolveEffectivePlan(user?.subscription));

  // The factor rides along on styling so getTokens() can pick it up without
  // threading a new prop through all five templates. Export clones this same
  // DOM, so the PDF matches the preview exactly.
  const fittedCV = fit === 1 ? cv : { ...cv, styling: { ...cv.styling, __autoFit: fit } };
  const props = { cv: fittedCV, sections: visibleSections };

  return (
    <div className="mx-auto max-w-[595px]">
      {/* Overflow notice. The auto-fit pass already compresses a CV that only
          slightly overruns; past that the document genuinely needs more pages,
          and the user should learn that here rather than from the exported PDF.
          Deliberately a quiet inline note, not a modal — a two-page CV is a
          normal, legitimate choice, not an error. */}
      {pageCount > 1 && (
        <div
          role="status"
          className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {t('overflow_warning', { pages: pageCount })}{' '}
            <span className="text-amber-700 dark:text-amber-300">{t('overflow_hint')}</span>
          </span>
        </div>
      )}

      <div
        ref={pageRef}
        id="cv-preview-content"
        className="rounded-lg shadow-lg overflow-hidden"
        style={{ background: '#fff' }}
      >
        {layout === 'sidebar'    && <SidebarLayout   {...props} />}
        {layout === 'top-bar'    && <TopBarLayout    {...props} />}
        {layout === 'compact'    && <CompactLayout   {...props} />}
        {layout === 'slate-gold' && <SlateGoldLayout {...props} />}
        {(layout === 'classic' || !['sidebar','top-bar','compact','slate-gold'].includes(layout)) && (
          <ClassicLayout {...props} />
        )}
      </div>
    </div>
  );
}
