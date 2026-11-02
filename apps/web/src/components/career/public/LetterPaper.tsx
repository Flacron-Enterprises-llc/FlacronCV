'use client';

import { useTranslations } from 'next-intl';
import { DOCUMENT_FONT_STACK, PAGE_CSS_HEIGHT, PAGE_CSS_WIDTH, coverLetterTemplateOf } from '@flacroncv/career-shared';
import { ScaledPage } from './ScaledPage';

export function LetterPaper({
  templateId,
  labelled = true,
  body,
  name,
}: {
  templateId: string;
  compact?: boolean;
  labelled?: boolean;
  /** A real draft. Its own greeting and sign-off are kept, so no sample date, recipient or greeting is added. */
  body?: string;
  /** The writer's name for a real draft (never the sample person). */
  name?: string;
}) {
  const t = useTranslations('career.home');
  const template = coverLetterTemplateOf(templateId);
  const own = body !== undefined;
  const shownName = own ? (name ?? '') : t('sample_name');
  const paragraphs = body
    ? body.split(/\n\n+/).filter(Boolean)
    : [t('letter_p1'), t('letter_p2'), t('letter_p3')];
  const page = (
    <article
      className="h-full w-full overflow-hidden bg-white text-[#1a1a1a]"
      data-letter-template={template.id}
      style={{
        width: PAGE_CSS_WIDTH,
        height: PAGE_CSS_HEIGHT,
        fontFamily: DOCUMENT_FONT_STACK,
      }}
    >
      {template.header === 'rail' ? (
        <div className="grid h-full grid-cols-[0.7rem_minmax(0,1fr)]">
          <span aria-hidden="true" style={{ background: template.accent }} />
          <LetterBody paragraphs={paragraphs} templateId={template.id} own={own} name={shownName} />
        </div>
      ) : template.header === 'masthead' ? (
        <div className="grid h-full grid-cols-[0.7rem_minmax(0,1fr)]">
          <span aria-hidden="true" style={{ background: template.accent }} />
          <LetterBody paragraphs={paragraphs} templateId={template.id} accent={template.accent} header="masthead" own={own} name={shownName} />
        </div>
      ) : template.header === 'split' ? (
        <div className="grid h-full grid-cols-[6.5rem_minmax(0,1fr)]">
          <div className="border-r border-[#d7dee8] px-3 py-10 text-[11px] leading-4 text-[#3e5270]">
            {own ? null : <p>{t('letter_date')}</p>}
          </div>
          <LetterBody paragraphs={paragraphs} templateId={template.id} accent={template.accent} header="split" own={own} name={shownName} />
        </div>
      ) : template.header === 'band' ? (
        <div className="h-full">
          <div className="px-10 py-7 text-white" style={{ background: template.accent }}>
            <p className="text-[22px] font-bold leading-7">{shownName}</p>
            {own ? null : <p className="mt-1 text-[12px] text-white/80">{t('sample_email')}</p>}
          </div>
          <LetterBody paragraphs={paragraphs} templateId={template.id} own={own} name={shownName} />
        </div>
      ) : (
        <LetterBody
          paragraphs={paragraphs}
          templateId={template.id}
          accent={template.accent}
          header={template.header}
          own={own}
          name={shownName}
        />
      )}
    </article>
  );
  return (
    <ScaledPage labelled={labelled} caption={labelled ? t('sample_letter_label') : undefined}>
      {page}
    </ScaledPage>
  );
}

function LetterBody({
  paragraphs,
  templateId,
  accent,
  header,
  own,
  name,
}: {
  paragraphs: string[];
  templateId: string;
  accent?: string;
  header?: string;
  own: boolean;
  name: string;
}) {
  const t = useTranslations('career.home');
  return (
    <div className="h-full px-10 py-10">
      {header === 'block' ? (
        <p className="text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
          {t('letter_heading')}
        </p>
      ) : header === 'rule' ? (
        <>
          <p className="text-[13px] font-bold uppercase tracking-[0.16em]">{name}</p>
          <span className="mt-3 block h-px" style={{ background: accent }} aria-hidden="true" />
        </>
      ) : header === 'masthead' ? (
        <>
          <p className="text-[28px] font-bold leading-8 tracking-tight" style={{ color: accent }}>
            {name}
          </p>
          {own ? null : (
            <>
              <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3e5270]">{t('sample_role')}</p>
              <p className="mt-3 max-w-[34rem] break-words text-[12px] leading-5 text-[#3e5270]">
                {t('sample_email')} · {t('sample_phone')} · {t('sample_location')}
              </p>
            </>
          )}
        </>
      ) : header === 'split' ? (
        <>
          <p className="text-[20px] font-bold" style={{ color: accent ?? '#1f3b57' }}>
            {name}
          </p>
          {own ? null : <p className="mt-1 text-[12px] text-[#3e5270]">{t('sample_role')}</p>}
        </>
      ) : header === 'letterhead' || header === 'plain' || !header ? (
        <>
          <p className="text-[20px] font-bold" style={{ color: accent ?? '#1e3a5f' }}>
            {name}
          </p>
          {own ? null : (
            <p className="mt-1 text-[12px] text-[#3e5270]">
              {t('sample_email')} · {t('sample_phone')}
            </p>
          )}
        </>
      ) : null}
      {own ? (
        <div className="mt-6" />
      ) : (
        <>
          {header === 'split' ? null : <p className="mt-8 text-[12px] text-[#3e5270]">{t('letter_date')}</p>}
          <p className={`${header === 'split' ? 'mt-8' : 'mt-3'} text-[13px] font-semibold`}>{t('letter_recipient')}</p>
          <p className="mt-6 text-[13px] leading-6">{t('letter_greeting')}</p>
        </>
      )}
      {paragraphs.map((paragraph) => (
        <p key={`${templateId}-${paragraph.slice(0, 24)}`} className="mt-3 text-[13px] leading-6 text-[#3e5270]">
          {paragraph}
        </p>
      ))}
      {own ? null : (
        <>
          <p className="mt-6 text-[13px] leading-6">{t('letter_closing')}</p>
          <p className="mt-2 text-[13px] font-semibold">{name}</p>
        </>
      )}
    </div>
  );
}
