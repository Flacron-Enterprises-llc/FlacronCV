'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { JOB_LIMITS, JobChecklistKind } from '@flacroncv/shared-types';

/** Editable rows. Strings throughout so inputs stay controlled; the server trims and drops empty rows. */
export interface ContactRow {
  key: string;
  id?: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  notes: string;
}
export interface ChecklistRow {
  key: string;
  id?: string;
  label: string;
  kind: JobChecklistKind;
  done: boolean;
}
export interface AnswerRow {
  key: string;
  id?: string;
  question: string;
  answer: string;
}

let counter = 0;
/** React key for a row that has no server id yet. */
export function rowKey(): string {
  counter += 1;
  return `row-${counter}`;
}

const input =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white';
const removeButton =
  'shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20';

function AddButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-400"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function update<T extends { key: string }>(rows: T[], key: string, patch: Partial<T>): T[] {
  return rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
}

export function ContactsEditor({ rows, onChange }: { rows: ContactRow[]; onChange: (rows: ContactRow[]) => void }) {
  const t = useTranslations('jobs');
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <fieldset key={row.key} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <legend className="sr-only">{t('contact_n', { n: index + 1 })}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              aria-label={t('contact.name')}
              placeholder={t('contact.name')}
              value={row.name}
              maxLength={JOB_LIMITS.contactName}
              onChange={(e) => onChange(update(rows, row.key, { name: e.target.value }))}
              className={input}
            />
            <input
              aria-label={t('contact.role')}
              placeholder={t('contact.role_ph')}
              value={row.role}
              maxLength={JOB_LIMITS.contactRole}
              onChange={(e) => onChange(update(rows, row.key, { role: e.target.value }))}
              className={input}
            />
            <input
              type="email"
              aria-label={t('contact.email')}
              placeholder={t('contact.email')}
              value={row.email}
              maxLength={JOB_LIMITS.contactEmail}
              onChange={(e) => onChange(update(rows, row.key, { email: e.target.value }))}
              className={input}
            />
            <input
              type="tel"
              aria-label={t('contact.phone')}
              placeholder={t('contact.phone')}
              value={row.phone}
              maxLength={JOB_LIMITS.contactPhone}
              onChange={(e) => onChange(update(rows, row.key, { phone: e.target.value }))}
              className={input}
            />
          </div>
          <div className="mt-2 flex items-start gap-2">
            <textarea
              aria-label={t('contact.notes')}
              placeholder={t('contact.notes_ph')}
              value={row.notes}
              rows={2}
              maxLength={JOB_LIMITS.contactNotes}
              onChange={(e) => onChange(update(rows, row.key, { notes: e.target.value }))}
              className={`${input} resize-y`}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              aria-label={t('contact.remove', { n: index + 1 })}
              className={removeButton}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </fieldset>
      ))}
      <AddButton
        label={t('contact.add')}
        disabled={rows.length >= JOB_LIMITS.contacts}
        onClick={() => onChange([...rows, { key: rowKey(), name: '', role: '', email: '', phone: '', notes: '' }])}
      />
    </div>
  );
}

export function ChecklistEditor({ rows, onChange }: { rows: ChecklistRow[]; onChange: (rows: ChecklistRow[]) => void }) {
  const t = useTranslations('jobs');
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={row.key} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={row.done}
            aria-label={t('checklist_done', { label: row.label || t('checklist_item_n', { n: index + 1 }) })}
            onChange={(e) => onChange(update(rows, row.key, { done: e.target.checked }))}
            className="h-4 w-4 shrink-0 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
          />
          <input
            aria-label={t('checklist_item_n', { n: index + 1 })}
            placeholder={t('checklist_ph')}
            value={row.label}
            maxLength={JOB_LIMITS.checklistLabel}
            onChange={(e) => onChange(update(rows, row.key, { label: e.target.value }))}
            className={input}
          />
          <select
            aria-label={t('checklist_kind_label')}
            value={row.kind}
            onChange={(e) => onChange(update(rows, row.key, { kind: e.target.value as JobChecklistKind }))}
            className={`${input} w-auto`}
          >
            <option value="document">{t('checklist_kind.document')}</option>
            <option value="task">{t('checklist_kind.task')}</option>
          </select>
          <button
            type="button"
            onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
            aria-label={t('checklist_remove', { n: index + 1 })}
            className={removeButton}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <AddButton
        label={t('checklist_add')}
        disabled={rows.length >= JOB_LIMITS.checklistItems}
        onClick={() => onChange([...rows, { key: rowKey(), label: '', kind: 'document', done: false }])}
      />
    </div>
  );
}

export function AnswersEditor({ rows, onChange }: { rows: AnswerRow[]; onChange: (rows: AnswerRow[]) => void }) {
  const t = useTranslations('jobs');
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.key} className="flex items-start gap-2">
          <div className="flex-1 space-y-2">
            <input
              aria-label={t('answer.question_n', { n: index + 1 })}
              placeholder={t('answer.question_ph')}
              value={row.question}
              maxLength={JOB_LIMITS.question}
              onChange={(e) => onChange(update(rows, row.key, { question: e.target.value }))}
              className={input}
            />
            <textarea
              aria-label={t('answer.answer_n', { n: index + 1 })}
              placeholder={t('answer.answer_ph')}
              value={row.answer}
              rows={3}
              maxLength={JOB_LIMITS.answer}
              onChange={(e) => onChange(update(rows, row.key, { answer: e.target.value }))}
              className={`${input} resize-y`}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
            aria-label={t('answer.remove', { n: index + 1 })}
            className={removeButton}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <AddButton
        label={t('answer.add')}
        disabled={rows.length >= JOB_LIMITS.formAnswers}
        onClick={() => onChange([...rows, { key: rowKey(), question: '', answer: '' }])}
      />
    </div>
  );
}
