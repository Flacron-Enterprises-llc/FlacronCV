'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isApiError, type ApiClient, type StarStory, type StarStoryInput } from '@flacroncv/career-api-client';
import { Button, Card, ConfirmDialog } from '@/components/career/ui';
import { TEXTAREA_CLASS } from './InterviewSessionCard';

const PARTS = ['situation', 'task', 'action', 'result'] as const;
type Part = (typeof PARTS)[number];
type Draft = Record<Part, string>;

const EMPTY: Draft = { situation: '', task: '', action: '', result: '' };

/** A draft handed in from an answered question ("Save as STAR story"). */
export interface StoryPrefill {
  key: string;
  draft: Partial<Draft>;
  factIds: string[];
  answerIndex: number;
}

type Note =
  | 'saved'
  | 'updated'
  | 'deleted'
  | 'number'
  | 'no_result'
  | 'result_not_in_facts'
  | 'missing'
  | 'failed'
  | null;

/**
 * The STAR library: list, edit and delete saved stories, and a form that
 * starts empty (it is never filled from the newest story). The server
 * refuses a number or a result that is not in confirmed facts; the typed
 * words stay in the form when it does.
 */
export function StarLibrary({
  api,
  stories,
  onChange,
  prefill,
}: {
  api: ApiClient;
  stories: StarStory[];
  onChange: (stories: StarStory[]) => void;
  prefill: StoryPrefill | null;
}) {
  const t = useTranslations('career.interviews');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [factIds, setFactIds] = useState<string[] | undefined>(undefined);
  const [fromAnswer, setFromAnswer] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StarStory | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  useEffect(() => {
    if (!prefill) return;
    setEditingId(null);
    setDraft({ ...EMPTY, ...prefill.draft });
    setFactIds(prefill.factIds);
    setFromAnswer(prefill.answerIndex);
    setNote(null);
  }, [prefill]);

  function reset() {
    setDraft(EMPTY);
    setFactIds(undefined);
    setFromAnswer(null);
    setEditingId(null);
  }

  function edit(story: StarStory) {
    setEditingId(story.id);
    setDraft({ situation: story.situation, task: story.task, action: story.action, result: story.result });
    setFactIds(story.factIds);
    setFromAnswer(null);
    setNote(null);
  }

  async function save() {
    setNote(null);
    if (PARTS.some((part) => draft[part].trim().length === 0)) {
      setNote('missing');
      return;
    }
    const input: StarStoryInput = { ...draft };
    if (factIds && factIds.length > 0) input.factIds = factIds;
    setBusy(true);
    try {
      if (editingId) {
        const updated = await api.updateStarStory(editingId, input);
        onChange(stories.map((story) => (story.id === updated.id ? updated : story)));
        setNote('updated');
      } else {
        const created = await api.createStarStory(input);
        onChange([created, ...stories]);
        setNote('saved');
      }
      reset();
    } catch (error) {
      if (isApiError(error, 'validation_error')) {
        const reason = error.body.reason;
        if (reason === 'number_not_in_facts') setNote('number');
        else if (reason === 'no_confirmed_result') setNote('no_result');
        else if (reason === 'result_not_in_facts') setNote('result_not_in_facts');
        else setNote('failed');
      } else setNote('failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(story: StarStory) {
    setBusy(true);
    try {
      await api.deleteStarStory(story.id);
      onChange(stories.filter((item) => item.id !== story.id));
      if (editingId === story.id) reset();
      setNote('deleted');
    } catch {
      setNote('failed');
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  const noteText: Record<Exclude<Note, null>, string> = {
    saved: t('story_saved'),
    updated: t('story_updated'),
    deleted: t('story_deleted'),
    number: t('story_number'),
    no_result: t('story_no_result'),
    result_not_in_facts: t('story_result_not_in_facts'),
    missing: t('story_missing'),
    failed: t('story_failed'),
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('library_title')}</h2>
      <p className="mt-2 text-sm text-career-muted">{t('story_body')}</p>
      <p className="mt-1 text-sm text-career-muted">{t('story_result_rule')}</p>
      {stories.length === 0 ? (
        <p className="mt-4 text-sm text-career-muted">{t('library_empty')}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {stories.map((story) => (
            <li key={story.id} className="rounded-md border border-career-line p-3" data-testid="star-story">
              <dl className="grid gap-1 text-sm">
                {PARTS.map((part) => (
                  <div key={part}>
                    <dt className="inline font-semibold text-career-ink">{t(part)}: </dt>
                    <dd className="inline whitespace-pre-wrap text-career-ink">{story[part]}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="ghost" onClick={() => edit(story)} aria-label={t('edit_story_named', { situation: story.situation.slice(0, 40) })}>
                  {t('edit')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setDeleting(story)} aria-label={t('delete_story_named', { situation: story.situation.slice(0, 40) })}>
                  {t('delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-6 text-base font-semibold text-career-ink">{editingId ? t('editing_story') : t('new_story')}</h3>
      {fromAnswer !== null ? <p className="mt-1 text-sm text-career-muted">{t('story_from_answer', { index: fromAnswer })}</p> : null}
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {PARTS.map((part) => (
          <div key={part} className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-career-ink" htmlFor={`star-${part}`}>
              {t(part)}
            </label>
            <textarea
              id={`star-${part}`}
              className={TEXTAREA_CLASS}
              value={draft[part]}
              maxLength={2000}
              onChange={(event) => setDraft({ ...draft, [part]: event.target.value })}
            />
          </div>
        ))}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" loading={busy}>
            {editingId ? t('update_story') : t('save_story')}
          </Button>
          {editingId || fromAnswer !== null ? (
            <Button type="button" variant="ghost" onClick={reset}>
              {t('cancel_edit')}
            </Button>
          ) : null}
        </div>
      </form>
      {note ? <p role="status" className="mt-3 text-sm text-career-ink">{noteText[note]}</p> : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t('delete_title')}
        body={t('delete_body')}
        confirmLabel={t('delete_confirm')}
        cancelLabel={t('cancel')}
        danger
        busy={busy}
        onConfirm={() => {
          if (deleting) void remove(deleting);
        }}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}
