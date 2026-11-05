'use client';

import React, { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { CoverLetter, CV, CVSection } from '@flacroncv/shared-types';
import ClassicLayout from '@/components/cv-builder/templates/ClassicLayout';
import SidebarLayout from '@/components/cv-builder/templates/SidebarLayout';
import TopBarLayout from '@/components/cv-builder/templates/TopBarLayout';
import CompactLayout from '@/components/cv-builder/templates/CompactLayout';
import SlateGoldLayout from '@/components/cv-builder/templates/SlateGoldLayout';
import ClassicTemplate from '@/components/cover-letter/templates/ClassicTemplate';
import ModernTemplate from '@/components/cover-letter/templates/ModernTemplate';
import MinimalistTemplate from '@/components/cover-letter/templates/MinimalistTemplate';
import CreativeTemplate from '@/components/cover-letter/templates/CreativeTemplate';
import CorporateTemplate from '@/components/cover-letter/templates/CorporateTemplate';
import ExecutiveTemplate from '@/components/cover-letter/templates/ExecutiveTemplate';
import type { CLLabels } from '@/components/cover-letter/templates/types';
import { COVER_LETTER_TEMPLATES } from '@/components/cover-letter/CoverLetterPreview';
import { buildSampleCVForTemplate, SAMPLE_SECTIONS } from '@/lib/previewSampleCV';

/**
 * Miniature, full-page previews for the homepage. They render the same layout
 * components the editor and the PDF export use, at A4 width (794 px), then
 * scale the whole page down to the card. The frame keeps the A4 ratio, so a page
 * is never stretched or cut mid-way; content is sample data, labelled as such
 * by the caller.
 */

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

function ScaledA4({ children, label }: { children: ReactNode; label: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const apply = () => {
      const width = frame.clientWidth;
      if (width > 0) setScale(width / A4_WIDTH);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      role="img"
      aria-label={label}
      className="fc-paper relative w-full overflow-hidden bg-white"
      style={{ aspectRatio: `${A4_WIDTH} / ${A4_HEIGHT}` }}
    >
      {scale > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute start-0 top-0 select-none"
          style={{
            width: A4_WIDTH,
            height: A4_HEIGHT,
            overflow: 'hidden',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          // Thumbnails are pictures of a page: the layouts are LTR-authored and
          // scale from the physical top-left corner in every locale.
          dir="ltr"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

type LayoutProps = { cv: CV; sections: CVSection[] };

function layoutFor(cv: CV): React.ComponentType<LayoutProps> {
  switch (cv.styling.layout) {
    case 'sidebar':
      return SidebarLayout;
    case 'top-bar':
      return TopBarLayout;
    case 'compact':
      return CompactLayout;
    case 'slate-gold':
      return SlateGoldLayout;
    default:
      return ClassicLayout;
  }
}

export function CvThumb({ slug, label }: { slug: string; label: string }) {
  const cv = buildSampleCVForTemplate(slug);
  const Layout = layoutFor(cv);
  return (
    <ScaledA4 label={label}>
      <Layout cv={cv} sections={SAMPLE_SECTIONS} />
    </ScaledA4>
  );
}

const LETTER_COMPONENTS: Record<string, React.ComponentType<React.ComponentProps<typeof ModernTemplate>>> = {
  classic: ClassicTemplate,
  modern: ModernTemplate,
  minimalist: MinimalistTemplate,
  creative: CreativeTemplate,
  corporate: CorporateTemplate,
  executive: ExecutiveTemplate,
};

/** Catalog slugs are `cl-<id>`; the renderer registry is keyed by `<id>`. */
export function letterTemplateId(slug: string): string | null {
  const id = slug.replace(/^cl-/, '');
  return id in LETTER_COMPONENTS ? id : null;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export function LetterThumb({ slug, label }: { slug: string; label: string }) {
  const t = useTranslations('home_showcase');
  const tl = useTranslations('coverLetters');
  const locale = useLocale();
  const id = letterTemplateId(slug);
  if (!id) return null;
  const Template = LETTER_COMPONENTS[id];
  const color = COVER_LETTER_TEMPLATES.find((tpl) => tpl.id === id)?.defaultColor ?? '#1e3a5f';
  const now = new Date();
  const body = [t('sample_letter_p1'), t('sample_letter_p2'), t('sample_letter_p3')]
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');
  const letter: CoverLetter = {
    id: 'preview',
    userId: 'preview',
    title: 'Sample',
    recipientName: t('sample_letter_recipient'),
    recipientTitle: t('sample_letter_recipient_title'),
    companyName: t('sample_letter_company'),
    companyAddress: '',
    jobTitle: t('sample_letter_job'),
    jobDescription: '',
    content: body,
    templateId: id,
    styling: { fontFamily: 'Inter', fontSize: 'medium', primaryColor: color },
    aiGenerated: false,
    aiProvider: null,
    linkedCVId: null,
    status: 'draft' as CoverLetter['status'],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  let today: string;
  try {
    today = now.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    today = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  const labels: CLLabels = {
    dear: tl('cl_dear'),
    hiringManager: tl('cl_hiring_manager'),
    placeholder: tl('cl_placeholder'),
    yourName: tl('cl_your_name'),
    re: tl('cl_re'),
    subjectApplication: tl('cl_subject_application'),
    position: tl('cl_position'),
    closingSincerely: tl('closing_sincerely'),
    closingBestRegards: tl('closing_best_regards'),
    closingRegards: tl('closing_regards'),
    closingEnthusiasm: tl('closing_enthusiasm'),
    closingFaithfully: tl('closing_faithfully'),
    closingRespectfully: tl('closing_respectfully'),
  };
  const rtl = locale === 'ar' || locale === 'ur';
  return (
    <ScaledA4 label={label}>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ width: A4_WIDTH, minHeight: A4_HEIGHT, background: '#fff' }}>
        <Template
          coverLetter={letter}
          senderName="Alexandra Chen"
          senderEmail="alex.chen@example.com"
          today={today}
          labels={labels}
        />
      </div>
    </ScaledA4>
  );
}
