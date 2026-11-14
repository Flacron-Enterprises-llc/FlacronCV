'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ACTION_PACK_EDIT_LIMITS, factLineText, isFactType } from '@flacroncv/career-shared';
import type { ActionPack, ActionPackChecklistItem, ActionPackEdit } from '@flacroncv/career-api-client';
import { Button } from '@/components/career/ui';

const FIELD =
  'mt-1.5 block w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink shadow-sm focus:border-career-navy focus:outline-none focus:ring-1 focus:ring-career-navy';

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Save / cancel row shared by every editor. */
function EditorActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  const t = useTranslations('career.actionPack');
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2">
      <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
        {t('cancel')}
      </Button>
      <Button type="submit" loading={saving} loadingLabel={t('saving')}>
        {t('save')}
      </Button>
    </div>
  );
}

function EditorForm({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

export interface EditorProps {
  pack: ActionPack;
  saving: boolean;
  onSave: (edit: ActionPackEdit) => void;
  onCancel: () => void;
}

/** Fit sentences, one per line. Translated defaults are offered as the starting text. */
export function FitEditor({ initialReasons, initialGaps, saving, onSave, onCancel }: Omit<EditorProps, 'pack'> & { initialReasons: string[]; initialGaps: string[] }) {
  const t = useTranslations('career.actionPack');
  const [reasons, setReasons] = useState(initialReasons.join('\n'));
  const [gaps, setGaps] = useState(initialGaps.join('\n'));
  return (
    <EditorForm onSubmit={() => onSave({ fit: { reasons: lines(reasons), gaps: lines(gaps) } })}>
      <p className="text-xs text-career-muted">{t('edit_one_per_line')}</p>
      <label className="block text-sm font-semibold text-career-ink">
        {t('fit_reasons')}
        <textarea dir="auto" className={FIELD} rows={4} value={reasons} onChange={(e) => setReasons(e.target.value)} />
      </label>
      <label className="block text-sm font-semibold text-career-ink">
        {t('skill_gaps')}
        <textarea dir="auto" className={FIELD} rows={4} value={gaps} onChange={(e) => setGaps(e.target.value)} />
      </label>
      <EditorActions saving={saving} onCancel={onCancel} />
    </EditorForm>
  );
}

/**
 * Résumé lines: reword, reorder, remove, or add back a confirmed fact the
 * tailoring left out. There is no free "add a line": every line stands for a
 * confirmed fact frozen in the pack (the server checks this too).
 */
export function ResumeEditor({ pack, saving, onSave, onCancel }: EditorProps) {
  const t = useTranslations('career.actionPack');
  const [title, setTitle] = useState(pack.tailoredResume.title);
  const [rows, setRows] = useState(pack.tailoredResume.lines.map((line) => ({ factId: line.factId, factType: line.factType, text: line.text })));
  const used = new Set(rows.map((row) => row.factId));
  const available = pack.profileSnapshot.filter((fact) => !used.has(fact.id) && isFactType(fact.factType));

  function move(index: number, by: -1 | 1) {
    setRows((prev) => {
      const next = prev.slice();
      const target = index + by;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <EditorForm onSubmit={() => onSave({ tailoredResume: { title: title.trim(), lines: rows.map(({ factId, text }) => ({ factId, text: text.trim() })) } })}>
      <label className="block text-sm font-semibold text-career-ink">
        {t('resume_title_label')}
        <input dir="auto" className={FIELD} value={title} maxLength={ACTION_PACK_EDIT_LIMITS.title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <ol className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.factId} className="rounded-md border border-career-line p-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-career-muted">
              {row.factType}
              <textarea
                dir="auto"
                className={FIELD}
                rows={2}
                aria-label={t('resume_line_label')}
                value={row.text}
                maxLength={ACTION_PACK_EDIT_LIMITS.lineText}
                required
                onChange={(e) => {
                  const text = e.target.value;
                  setRows((prev) => prev.map((r, i) => (i === index ? { ...r, text } : r)));
                }}
              />
            </label>
            <div className="mt-1 flex flex-wrap gap-1">
              <Button type="button" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0}>
                {t('move_up')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => move(index, 1)} disabled={index === rows.length - 1}>
                {t('move_down')}
              </Button>
              <Button type="button" variant="danger-ghost" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} disabled={rows.length === 1}>
                {t('remove_line')}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {available.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-career-muted">{t('add_back_heading')}</h4>
          <ul className="mt-1 space-y-1">
            {available.map((fact) => {
              const factType = fact.factType as Parameters<typeof factLineText>[0];
              const text = factLineText(factType, fact.value);
              if (!text) return null;
              return (
                <li key={fact.id} className="flex items-center justify-between gap-2 text-sm text-career-ink">
                  <span dir="auto">{text}</span>
                  <Button type="button" variant="secondary" onClick={() => setRows((prev) => [...prev, { factId: fact.id, factType, text }])}>
                    {t('add_back')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <EditorActions saving={saving} onCancel={onCancel} />
    </EditorForm>
  );
}

export function LetterEditor({ pack, saving, onSave, onCancel }: EditorProps) {
  const t = useTranslations('career.actionPack');
  const [title, setTitle] = useState(pack.coverLetter?.title ?? '');
  const [body, setBody] = useState(pack.coverLetter?.body ?? '');
  return (
    <EditorForm onSubmit={() => onSave({ coverLetter: { title: title.trim(), body: body.trim() } })}>
      <label className="block text-sm font-semibold text-career-ink">
        {t('letter_title_label')}
        <input dir="auto" className={FIELD} value={title} maxLength={ACTION_PACK_EDIT_LIMITS.title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className="block text-sm font-semibold text-career-ink">
        {t('letter_body_label')}
        <textarea dir="auto" className={FIELD} rows={12} value={body} maxLength={ACTION_PACK_EDIT_LIMITS.letterBody} onChange={(e) => setBody(e.target.value)} required />
      </label>
      <EditorActions saving={saving} onCancel={onCancel} />
    </EditorForm>
  );
}

/**
 * Checklist wording. A built-in item is shown translated; if the person
 * changes its words it is sent as their own item, otherwise only its id and
 * state are sent so it stays translated.
 */
export function ChecklistEditor({
  items,
  labelOf,
  saving,
  onSave,
  onCancel,
}: Omit<EditorProps, 'pack'> & { items: ActionPackChecklistItem[]; labelOf: (item: ActionPackChecklistItem) => string }) {
  const t = useTranslations('career.actionPack');
  const [rows, setRows] = useState(items.map((item) => ({ id: item.id as string | undefined, original: labelOf(item), label: labelOf(item), done: item.done })));
  return (
    <EditorForm
      onSubmit={() =>
        onSave({
          checklist: rows
            .filter((row) => row.label.trim().length > 0)
            .map((row) => (row.id && row.label === row.original ? { id: row.id, done: row.done } : { id: row.id, label: row.label.trim(), done: row.done })),
        })
      }
    >
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.id ?? `new-${index}`} className="flex items-center gap-2">
            <input
              dir="auto"
              className={FIELD}
              aria-label={t('checklist_item_label')}
              value={row.label}
              maxLength={ACTION_PACK_EDIT_LIMITS.checklistLabel}
              onChange={(e) => {
                const label = e.target.value;
                setRows((prev) => prev.map((r, i) => (i === index ? { ...r, label } : r)));
              }}
            />
            <Button type="button" variant="danger-ghost" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
              {t('checklist_remove')}
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="secondary"
        disabled={rows.length >= ACTION_PACK_EDIT_LIMITS.listItems}
        onClick={() => setRows((prev) => [...prev, { id: undefined, original: '', label: '', done: false }])}
      >
        {t('checklist_add')}
      </Button>
      <EditorActions saving={saving} onCancel={onCancel} />
    </EditorForm>
  );
}

export function NextStepsEditor({ initial, saving, onSave, onCancel }: Omit<EditorProps, 'pack'> & { initial: string[] }) {
  const t = useTranslations('career.actionPack');
  const [text, setText] = useState(initial.join('\n'));
  return (
    <EditorForm onSubmit={() => onSave({ nextSteps: lines(text) })}>
      <label className="block text-sm font-semibold text-career-ink">
        {t('next_steps')}
        <textarea dir="auto" className={FIELD} rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="text-xs text-career-muted">{t('edit_one_per_line')}</p>
      <EditorActions saving={saving} onCancel={onCancel} />
    </EditorForm>
  );
}
