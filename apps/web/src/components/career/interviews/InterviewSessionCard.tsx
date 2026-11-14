'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { InterviewFeedback, InterviewSession } from '@flacroncv/career-api-client';
import { FEEDBACK_DIMENSIONS, interviewReport } from '@flacroncv/career-shared';
import { Badge, Button, Card } from '@/components/career/ui';

export const TEXTAREA_CLASS =
  'block min-h-[6rem] w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-base text-career-ink focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40';

/** The label that counts as "met" on each rubric dimension (same rule as the server report). */
const MET: Record<keyof InterviewFeedback, string> = {
  relevance: 'grounded',
  structure: 'clear',
  specificity: 'specific',
  evidence: 'cited',
};

export type AnswerView = InterviewSession['answers'][number];

/**
 * One session: answered questions with their rubric labels, a way to
 * challenge each label, the next question, and the end-of-session report.
 * Nothing here charges: answers, challenges and stories are free once the
 * session exists.
 */
export function InterviewSessionCard({
  session,
  onAnswer,
  onChallenge,
  onSaveAsStory,
}: {
  session: InterviewSession;
  onAnswer: (answer: string) => Promise<boolean>;
  onChallenge: (answerId: string, note: string) => Promise<boolean>;
  onSaveAsStory: (answer: AnswerView) => void;
}) {
  const t = useTranslations('career.interviews');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const total = session.questions.length;
  const next = session.answers.length < total ? session.questions[session.answers.length] : null;
  // Rebuilt from the labels so an older replayed session without `report` still shows one.
  const report = session.report ?? interviewReport(session.answers, total);

  async function submit() {
    if (answer.trim().length === 0) return;
    setSaving(true);
    const ok = await onAnswer(answer);
    setSaving(false);
    if (ok) setAnswer('');
  }

  return (
    <Card>
      <p className="text-sm font-semibold text-career-ink">{session.title}</p>
      <p className="mt-1 text-sm text-career-muted">
        {t(`stage_${session.stage}`)} · {t('report_progress', { answered: report.answered, total })}
      </p>

      {session.answers.length > 0 ? (
        <section className="mt-4" aria-label={t('answered_heading')}>
          <h3 className="text-base font-semibold text-career-ink">{t('answered_heading')}</h3>
          <ol className="mt-2 flex flex-col gap-4">
            {session.answers.map((item) => (
              <AnsweredQuestion
                key={item.id}
                item={item}
                prompt={session.questions.find((question) => question.index === item.index)?.prompt ?? ''}
                total={total}
                onChallenge={onChallenge}
                onSaveAsStory={onSaveAsStory}
              />
            ))}
          </ol>
        </section>
      ) : null}

      {next ? (
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className="text-sm font-semibold text-career-muted">{t('question_heading', { index: next.index, total })}</p>
          <p className="text-sm text-career-ink">{next.prompt}</p>
          <label className="text-sm font-semibold text-career-ink" htmlFor="interview-answer">
            {t('answer_label')}
          </label>
          <textarea
            id="interview-answer"
            className={TEXTAREA_CLASS}
            value={answer}
            maxLength={10000}
            onChange={(event) => setAnswer(event.target.value)}
          />
          <Button type="submit" loading={saving} disabled={answer.trim().length === 0}>
            {t('save_answer')}
          </Button>
        </form>
      ) : (
        <SessionReport report={report} />
      )}
    </Card>
  );
}

function AnsweredQuestion({
  item,
  prompt,
  total,
  onChallenge,
  onSaveAsStory,
}: {
  item: AnswerView;
  prompt: string;
  total: number;
  onChallenge: (answerId: string, note: string) => Promise<boolean>;
  onSaveAsStory: (answer: AnswerView) => void;
}) {
  const t = useTranslations('career.interviews');
  const [challenging, setChallenging] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const fieldId = `challenge-${item.id}`;

  async function send() {
    setFailed(false);
    const ok = await onChallenge(item.id, note);
    if (ok) {
      setChallenging(false);
      setNote('');
    } else setFailed(true);
  }

  return (
    <li className="rounded-md border border-career-line p-3" data-testid={`answer-${item.index}`}>
      <p className="text-xs font-semibold text-career-muted">{t('question_heading', { index: item.index, total })}</p>
      <p className="mt-1 text-sm text-career-muted">{prompt}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-career-ink">{item.answer}</p>
      <dl className="mt-3 grid gap-1 sm:grid-cols-2">
        {FEEDBACK_DIMENSIONS.map((dimension) => {
          const value = item.feedback[dimension];
          return (
            <div key={dimension} className="flex flex-wrap items-center gap-2 text-sm">
              <dt className="font-semibold text-career-ink">{t(`dim_${dimension}`)}</dt>
              <dd>
                <Badge tone={value === MET[dimension] ? 'confirmed' : 'draft'}>{t(`fb_${dimension}_${value}`)}</Badge>
              </dd>
            </div>
          );
        })}
      </dl>
      {item.challenge ? <p className="mt-2 text-sm text-career-muted">{t('challenge_saved_note', { note: item.challenge })}</p> : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {!challenging ? (
          <Button type="button" variant="ghost" onClick={() => setChallenging(true)}>
            {t('challenge_button')}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => onSaveAsStory(item)}>
          {t('save_as_story')}
        </Button>
      </div>
      {challenging ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="text-sm font-semibold text-career-ink" htmlFor={fieldId}>
            {t('challenge_label')}
          </label>
          <textarea id={fieldId} className={TEXTAREA_CLASS} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={note.trim().length === 0}>
              {t('challenge_save')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setChallenging(false)}>
              {t('cancel')}
            </Button>
          </div>
          {failed ? <p role="status" className="text-sm text-career-danger">{t('challenge_failed')}</p> : null}
        </form>
      ) : null}
    </li>
  );
}

function SessionReport({ report }: { report: NonNullable<InterviewSession['report']> }) {
  const t = useTranslations('career.interviews');
  const strengths = report.dimensions.filter((item) => item.verdict === 'strength');
  const gaps = report.dimensions.filter((item) => item.verdict === 'gap');
  const line = (item: (typeof report.dimensions)[number]) =>
    t('report_dimension', { dimension: t(`dim_${item.dimension}`), met: item.met, answered: item.answered });
  return (
    <section className="mt-6" aria-label={t('report_title')}>
      <h3 className="text-base font-semibold text-career-ink">{t('report_title')}</h3>
      <p className="mt-1 text-sm text-career-muted">{t('complete_count', { total: report.total })}</p>
      <h4 className="mt-3 text-sm font-semibold text-career-ink">{t('report_strengths')}</h4>
      <ul className="mt-1 list-disc ps-5 text-sm text-career-ink">
        {strengths.length > 0 ? strengths.map((item) => <li key={item.dimension}>{line(item)}</li>) : <li>{t('report_none')}</li>}
      </ul>
      <h4 className="mt-3 text-sm font-semibold text-career-ink">{t('report_gaps')}</h4>
      <ul className="mt-1 list-disc ps-5 text-sm text-career-ink">
        {gaps.length > 0 ? gaps.map((item) => <li key={item.dimension}>{line(item)}</li>) : <li>{t('report_none')}</li>}
      </ul>
      <p className="mt-3 text-sm text-career-ink">
        {report.lackingEvidence.length > 0
          ? t('report_lacking', { count: report.lackingEvidence.length, list: report.lackingEvidence.join(', ') })
          : t('report_all_evidence')}
      </p>
      <p className="mt-2 text-xs text-career-muted">{t('not_a_score')}</p>
    </section>
  );
}
