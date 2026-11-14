'use client';
import React, { useEffect, useState } from 'react';
import { useLocale, useMessages } from 'next-intl';
import { useAuth } from '@/providers/AuthProvider';
import type { CoverLetter } from '@flacroncv/shared-types';
import type { CLLabels } from './templates/types';
import {
  buildCoverLetterLabels,
  formatLetterDate,
  isLetterLocale,
  isRtlLetterLocale,
  resolveLetterLocale,
  type CoverLetterWithLocale,
  type LetterLocale,
} from './letter-locale';
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

type Messages = Record<string, unknown>;

/**
 * The `coverLetters` messages of the LETTER's language.
 *
 * Same language as the interface (the common case): the messages next-intl
 * already has. Otherwise that locale's file is loaded on demand — the same
 * per-locale JSON the server loads — so only letters written in another
 * language pay for a second message file. Until it arrives the interface
 * strings stand in, which is a moment's flash rather than a blank letter.
 */
function useLetterMessages(letterLocale: LetterLocale, uiLocale: string): Messages {
  const uiMessages = (useMessages() as Messages).coverLetters as Messages | undefined;
  const [loaded, setLoaded] = useState<{ locale: LetterLocale; messages: Messages } | null>(null);

  useEffect(() => {
    if (letterLocale === uiLocale) return;
    let cancelled = false;
    import(`../../../public/locales/${letterLocale}/common.json`)
      .then((mod: { default?: Messages } & Messages) => {
        const all = (mod.default ?? mod) as Messages;
        if (!cancelled) setLoaded({ locale: letterLocale, messages: (all.coverLetters ?? {}) as Messages });
      })
      .catch(() => {
        /* keep the interface strings — still a complete, readable letter */
      });
    return () => {
      cancelled = true;
    };
  }, [letterLocale, uiLocale]);

  if (letterLocale !== uiLocale && loaded?.locale === letterLocale) return loaded.messages;
  return uiMessages ?? {};
}

/**
 * The letter's language and its labels — for the preview and for the DOCX
 * export, which must be given the same labels (`exportCoverLetterToDocx`
 * cannot read messages itself).
 */
export function useCoverLetterLabels(
  coverLetter: CoverLetter | null,
): { letterLocale: LetterLocale; labels: CLLabels } {
  const locale = useLocale();
  // Null while the letter loads: the interface language stands in.
  const letterLocale = coverLetter
    ? resolveLetterLocale(coverLetter as CoverLetterWithLocale, locale)
    : isLetterLocale(locale) ? locale : 'en';
  const labels = buildCoverLetterLabels(useLetterMessages(letterLocale, locale));
  return { letterLocale, labels };
}

export default function CoverLetterPreview({ coverLetter, senderName, senderEmail }: Props) {
  const { user } = useAuth();
  // Graceful tier fallback: a premium template on a downgraded account renders as
  // the free default (stored id untouched; server blocks new premium selections).
  const templateId = effectiveCoverLetterTemplate(
    coverLetter.templateId,
    resolveEffectivePlan(user?.subscription),
  );
  const Template = (TEMPLATES as any)[templateId] ?? ModernTemplate;

  // Labels, date and direction follow the language the letter is written in,
  // not the interface: an English letter viewed in /ar stays an English letter.
  const { letterLocale, labels } = useCoverLetterLabels(coverLetter);
  const today = formatLetterDate(letterLocale);

  return (
    <div
      id="cl-preview-content"
      lang={letterLocale}
      dir={isRtlLetterLocale(letterLocale) ? 'rtl' : 'ltr'}
    >
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
