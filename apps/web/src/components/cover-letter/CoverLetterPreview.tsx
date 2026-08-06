'use client';
import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/providers/AuthProvider';
import type { CoverLetter } from '@flacroncv/shared-types';
import type { CLLabels } from './templates/types';
import ClassicTemplate    from './templates/ClassicTemplate';
import ModernTemplate     from './templates/ModernTemplate';
import MinimalistTemplate from './templates/MinimalistTemplate';
import CreativeTemplate   from './templates/CreativeTemplate';
import CorporateTemplate  from './templates/CorporateTemplate';
import ExecutiveTemplate  from './templates/ExecutiveTemplate';

interface Props {
  coverLetter: CoverLetter;
  senderName?: string;
  senderEmail?: string;
}

const TEMPLATES = {
  classic:    ClassicTemplate,
  modern:     ModernTemplate,
  minimalist: MinimalistTemplate,
  creative:   CreativeTemplate,
  corporate:  CorporateTemplate,
  executive:  ExecutiveTemplate,
  standard:   ModernTemplate, // default alias
};

import { SubscriptionPlan, resolveEffectivePlan, effectiveCoverLetterTemplate } from '@flacroncv/shared-types';

/**
 * Template registry. `nameKey`/`descKey` resolve against the coverLetters
 * i18n namespace so the picker labels localize; ids/colors/tiers are static.
 */
export const COVER_LETTER_TEMPLATES = [
  { id: 'classic',    nameKey: 'tpl_classic',    descKey: 'tpl_classic_desc',    defaultColor: '#1e3a5f', tier: SubscriptionPlan.FREE },
  { id: 'modern',     nameKey: 'tpl_modern',     descKey: 'tpl_modern_desc',     defaultColor: '#2563eb', tier: SubscriptionPlan.FREE },
  { id: 'minimalist', nameKey: 'tpl_minimalist', descKey: 'tpl_minimalist_desc', defaultColor: '#374151', tier: SubscriptionPlan.PRO },
  { id: 'creative',   nameKey: 'tpl_creative',   descKey: 'tpl_creative_desc',   defaultColor: '#7c3aed', tier: SubscriptionPlan.PRO },
  { id: 'corporate',  nameKey: 'tpl_corporate',  descKey: 'tpl_corporate_desc',  defaultColor: '#0f766e', tier: SubscriptionPlan.ENTERPRISE },
  { id: 'executive',  nameKey: 'tpl_executive',  descKey: 'tpl_executive_desc',  defaultColor: '#0c0c0c', tier: SubscriptionPlan.ENTERPRISE },
];

const RTL_LOCALES = ['ar', 'ur'];

export default function CoverLetterPreview({ coverLetter, senderName, senderEmail }: Props) {
  const t = useTranslations('coverLetters');
  const locale = useLocale();
  const { user } = useAuth();
  // Graceful tier fallback: a premium template on a downgraded account renders as
  // the free default (stored id untouched; server blocks new premium selections).
  const templateId = effectiveCoverLetterTemplate(
    coverLetter.templateId,
    resolveEffectivePlan(user?.subscription),
  );
  const Template = (TEMPLATES as any)[templateId] ?? ModernTemplate;

  // Locale-aware date so the letter's date matches its language.
  let today: string;
  try {
    today = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  const labels: CLLabels = {
    dear: t('cl_dear'),
    hiringManager: t('cl_hiring_manager'),
    placeholder: t('cl_placeholder'),
    yourName: t('cl_your_name'),
    re: t('cl_re'),
    subjectApplication: t('cl_subject_application'),
    position: t('cl_position'),
    closingSincerely: t('closing_sincerely'),
    closingBestRegards: t('closing_best_regards'),
    closingRegards: t('closing_regards'),
    closingEnthusiasm: t('closing_enthusiasm'),
    closingFaithfully: t('closing_faithfully'),
    closingRespectfully: t('closing_respectfully'),
  };

  return (
    <div id="cl-preview-content" dir={RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr'}>
      <Template
        coverLetter={coverLetter}
        senderName={senderName}
        senderEmail={senderEmail}
        today={today}
        labels={labels}
      />
    </div>
  );
}
