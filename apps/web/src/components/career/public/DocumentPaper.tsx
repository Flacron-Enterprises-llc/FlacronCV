'use client';

import { useTranslations } from 'next-intl';
import {
  DOCUMENT_FONT_STACK,
  PAGE_CSS_HEIGHT,
  PAGE_CSS_WIDTH,
  resumeTemplateOf,
  splitResumeLine,
  type ResumeTemplateId,
} from '@flacroncv/career-shared';
import { ScaledPage } from './ScaledPage';

export type PaperMode = 'sample' | 'live';

export interface PaperSection {
  heading: string;
  items: string[];
}

interface PaperEntry {
  title?: string;
  meta?: string;
  bullets?: string[];
  text?: string;
}

export function DocumentPaper({
  templateId,
  lines,
  sections,
  title,
  subtitle,
  contact: liveContact,
  language,
  mode = 'sample',
  labelled = true,
}: {
  templateId: string;
  lines?: Array<{ id: string; text: string }>;
  sections?: PaperSection[];
  title?: string;
  subtitle?: string;
  /** Live mode: contact details under the name (the name itself is `title`). */
  contact?: string;
  /** Live mode: resume language, for date formatting that matches the PDF/DOCX export. */
  language?: 'en' | 'fr';
  mode?: PaperMode;
  compact?: boolean;
  labelled?: boolean;
}) {
  const t = useTranslations('career.home');
  const template = resumeTemplateOf(templateId);
  const id = template.id as ResumeTemplateId;
  const sample = mode === 'sample';
  const name = title ?? (sample ? t('sample_name') : '');
  const role = subtitle ?? (sample ? t('sample_role') : '');
  const contact = sample ? [t('sample_email'), t('sample_phone'), t('sample_location')].join('  ·  ') : (liveContact ?? '');
  const summary = sample ? t('sample_summary') : '';
  const structured: Array<{ heading: string; entries: PaperEntry[] }> = sample
    ? [
        {
          heading: t('sample_experience'),
          entries: [
            {
              title: t('sample_experience_line'),
              meta: t('sample_experience_dates'),
              bullets: [t('sample_experience_b1'), t('sample_experience_b2')],
            },
            {
              title: t('sample_experience_line_2'),
              meta: t('sample_experience_dates_2'),
              bullets: [t('sample_experience_b3')],
            },
          ],
        },
        {
          heading: t('sample_education'),
          entries: [{ title: t('sample_education_line') }],
        },
        {
          heading: t('sample_skills'),
          entries: [{ text: t('sample_skills_line') }],
        },
      ]
    : sections && sections.length > 0
      ? sections.map((section) => ({
          heading: section.heading,
          entries: section.items.map((item) => splitLiveItem(item, language)),
        }))
      : lines && lines.length > 0
        ? [{ heading: '', entries: lines.map((line) => ({ text: line.text })) }]
        : [];
  const accent = template.accent;
  const layout = template.layout;
  const skillsHeading = t('sample_skills');
  const mainSections = layout === 'sidebar' && sample ? structured.filter((section) => section.heading !== skillsHeading) : structured;
  const skillEntries = structured.find((section) => section.heading === skillsHeading)?.entries ?? [];

  const page = (
    <article
      className="h-full w-full overflow-hidden bg-white text-[#1a1a1a]"
      data-template={id}
      style={{
        width: PAGE_CSS_WIDTH,
        height: PAGE_CSS_HEIGHT,
        fontFamily: DOCUMENT_FONT_STACK,
      }}
    >
      {layout === 'sidebar' ? (
        <div className="grid h-full grid-cols-[32%_minmax(0,1fr)]">
          <div className="px-7 py-10 text-white" style={{ background: accent }}>
            {name ? <p className="text-[22px] font-bold leading-7">{name}</p> : null}
            {role ? <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">{role}</p> : null}
            {contact ? <p className="mt-6 text-[11px] leading-5 text-white/85">{contact}</p> : null}
            {sample && skillEntries.length > 0 ? (
              <div className="mt-8">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{skillsHeading}</p>
                <EntryList entries={skillEntries} inverted />
              </div>
            ) : null}
          </div>
          <div className="min-w-0 overflow-hidden px-8 py-10">
            {summary ? <p className="text-[12.5px] leading-5 text-[#3e5270]">{summary}</p> : null}
            <SectionBlock sections={mainSections} accent={accent} />
          </div>
        </div>
      ) : null}
      {layout === 'topbar' ? (
        <div className="h-full">
          <div className="px-10 py-8 text-white" style={{ background: accent }}>
            {name ? <p className="text-[26px] font-bold leading-8 tracking-tight">{name}</p> : null}
            {role ? <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/85">{role}</p> : null}
            {contact ? <p className="mt-3 text-[12px] text-white/80">{contact}</p> : null}
          </div>
          <span className="block h-1 bg-career-orange" aria-hidden="true" />
          <div className="px-10 py-8">
            {summary ? <p className="text-[12.5px] leading-5 text-[#3e5270]">{summary}</p> : null}
            <SectionBlock sections={structured} accent={accent} />
          </div>
        </div>
      ) : null}
      {layout === 'compact' ? (
        <div className="h-full px-10 py-9">
          <div className="flex items-baseline justify-between gap-4 border-b pb-3" style={{ borderColor: accent }}>
            {name ? <p className="text-[22px] font-bold leading-7">{name}</p> : null}
            {role ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
                {role}
              </p>
            ) : null}
          </div>
          {contact ? <p className="mt-2 text-[12px] text-[#3e5270]">{contact}</p> : null}
          {summary ? <p className="mt-4 text-[12.5px] leading-5 text-[#3e5270]">{summary}</p> : null}
          <SectionBlock sections={structured} accent={accent} />
        </div>
      ) : null}
      {layout === 'slate-gold' ? (
        <div className="h-full px-10 py-10">
          {name ? <p className="text-[20px] font-bold uppercase tracking-[0.2em]">{name}</p> : null}
          {role ? (
            <p className="mt-2 text-[13px]" style={{ color: accent }}>
              {role}
            </p>
          ) : null}
          {contact ? <p className="mt-2 text-[12px] text-[#3e5270]">{contact}</p> : null}
          <span className="mt-5 block h-px" style={{ background: accent }} aria-hidden="true" />
          {summary ? <p className="mt-5 text-[12.5px] leading-5 text-[#3e5270]">{summary}</p> : null}
          <SectionBlock sections={structured} accent={accent} />
        </div>
      ) : null}
      {layout === 'classic' ? (
        <div className="h-full px-12 py-10 text-center">
          {name ? (
            <p className="text-[26px] font-bold tracking-tight" style={{ color: accent }}>
              {name}
            </p>
          ) : null}
          {role ? <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3e5270]">{role}</p> : null}
          {contact ? <p className="mt-3 text-[12px] text-[#3e5270]">{contact}</p> : null}
          {summary ? <p className="mx-auto mt-5 max-w-[34rem] text-[12.5px] leading-5 text-[#3e5270]">{summary}</p> : null}
          <div className="mt-6 text-start">
            <SectionBlock sections={structured} accent={accent} ruledHeadings />
          </div>
        </div>
      ) : null}
      {layout === 'editorial' ? (
        <div className="grid h-full grid-cols-[0.7rem_minmax(0,1fr)]">
          <span aria-hidden="true" style={{ background: accent }} />
          <div className="min-w-0 px-10 py-10">
            {name ? (
              <p className="text-[32px] font-bold leading-9 tracking-tight" style={{ color: accent }}>
                {name}
              </p>
            ) : null}
            {role ? <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-[#3e5270]">{role}</p> : null}
            {contact ? (
              <p className="mt-3 max-w-[34rem] break-words text-[12px] leading-5 text-[#3e5270]">{contact}</p>
            ) : null}
            {summary ? <p className="mt-8 max-w-[28rem] text-[13px] leading-6 text-[#3e5270]">{summary}</p> : null}
            <SectionBlock sections={structured} accent={accent} spacious />
          </div>
        </div>
      ) : null}
      {layout === 'structured' ? (
        <div className="h-full px-10 py-9">
          {name ? <p className="text-[24px] font-bold leading-8 tracking-tight">{name}</p> : null}
          {role ? (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>
              {role}
            </p>
          ) : null}
          {contact ? <p className="mt-2 text-[11px] text-[#3e5270]">{contact}</p> : null}
          {summary ? <p className="mt-5 text-[12.5px] leading-5 text-[#3e5270]">{summary}</p> : null}
          <SectionBlock sections={structured} accent={accent} ruledHeadings dates />
        </div>
      ) : null}
    </article>
  );

  return (
    <ScaledPage labelled={labelled && sample} caption={labelled && sample ? t('sample_cv_label') : undefined}>
      {page}
    </ScaledPage>
  );
}

/** Same split as the PDF/DOCX export: title, formatted dates, then detail. */
function splitLiveItem(item: string, language?: 'en' | 'fr'): PaperEntry {
  const { title, dates, detail } = splitResumeLine(item, language);
  if (dates) return { title: title || undefined, meta: dates, ...(detail ? { bullets: [detail] } : {}) };
  const parts = item.split(' · ').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { title: parts[0], meta: parts.slice(1).join(' · ') };
  }
  return { text: item };
}

function SectionBlock({
  sections,
  accent,
  ruledHeadings,
  spacious,
  dates,
}: {
  sections: Array<{ heading: string; entries: PaperEntry[] }>;
  accent: string;
  ruledHeadings?: boolean;
  spacious?: boolean;
  dates?: boolean;
}) {
  return (
    <div className={spacious ? 'mt-10 space-y-8' : 'mt-6 space-y-5'}>
      {sections.map((section) => (
        <section key={`${section.heading}-${section.entries[0]?.title ?? section.entries[0]?.text ?? ''}`}>
          {section.heading ? (
            <h3
              className="text-[11px] font-bold uppercase tracking-[0.16em]"
              style={{
                color: accent,
                borderBottom: ruledHeadings ? `1px solid ${accent}` : undefined,
                paddingBottom: ruledHeadings ? 4 : undefined,
              }}
            >
              {section.heading}
            </h3>
          ) : null}
          {dates ? <DateEntryList entries={section.entries} /> : <EntryList entries={section.entries} />}
        </section>
      ))}
    </div>
  );
}

function DateEntryList({ entries }: { entries: PaperEntry[] }) {
  return (
    <div className="mt-2 space-y-4">
      {entries.map((entry, index) => (
        <div key={`${entry.title ?? entry.text ?? 'entry'}-${index}`} className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-x-4">
          <p className="pt-0.5 text-[11px] leading-4 text-[#3e5270]">{entry.meta ?? ''}</p>
          <div>
            {entry.title ? <p className="text-[13px] font-bold leading-5 text-[#1a1a1a]">{entry.title}</p> : null}
            {entry.text ? <p className="text-[12.5px] leading-5 text-[#3e5270]">{entry.text}</p> : null}
            {entry.bullets && entry.bullets.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {entry.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2 text-[12.5px] leading-5 text-[#1a1a1a]">
                    <span aria-hidden="true">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function EntryList({ entries, inverted }: { entries: PaperEntry[]; inverted?: boolean }) {
  const body = inverted ? 'text-white/90' : 'text-[#1a1a1a]';
  const meta = inverted ? 'text-white/75' : 'text-[#3e5270]';
  return (
    <div className="mt-2 space-y-3">
      {entries.map((entry, index) => (
        <div key={`${entry.title ?? entry.text ?? 'entry'}-${index}`}>
          {entry.title ? <p className={`text-[13px] font-bold leading-5 ${body}`}>{entry.title}</p> : null}
          {entry.meta ? <p className={`text-[11px] leading-4 ${meta}`}>{entry.meta}</p> : null}
          {entry.text ? <p className={`text-[12.5px] leading-5 ${meta}`}>{entry.text}</p> : null}
          {entry.bullets && entry.bullets.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {entry.bullets.map((bullet) => (
                <li key={bullet} className={`flex gap-2 text-[12.5px] leading-5 ${body}`}>
                  <span aria-hidden="true">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
