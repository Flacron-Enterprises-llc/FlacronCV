'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FACT_FIELDS } from '@flacroncv/career-shared';
import type { FactFieldValue, FactType, FieldErrorReason } from '@flacroncv/career-shared';
import type { Fact, FactRevision } from '@flacroncv/career-api-client';
import { Button, Input, RecordStatus } from '@/components/career/ui';
import { changedPatch, factTitle, toDraft, type FactDraft } from '@/lib/career/fact-draft';

function reasonKey(reason: string): FieldErrorReason | null {
  const known: FieldErrorReason[] = [
    'required',
    'too_long',
    'invalid_date',
    'date_order',
    'invalid_email',
    'invalid_url',
    'invalid_type',
    'too_many_items',
    'current_with_end_date',
    'unknown_field',
  ];
  return known.find((item) => item === reason) ?? null;
}

export function FactEditor({
  fact,
  experiences,
  pending,
  revisions,
  serverErrors,
  onSave,
  onConfirm,
  onDelete,
  onHistory,
}: {
  fact: Fact;
  experiences: Fact[];
  pending: boolean;
  revisions: FactRevision[] | null;
  serverErrors: Array<{ field: string; reason: string }>;
  onSave: (patch: Partial<Record<string, FactFieldValue>>) => Promise<void>;
  onConfirm: (patch: Partial<Record<string, FactFieldValue>> | null) => Promise<void>;
  onDelete: () => Promise<void>;
  onHistory: () => void;
}) {
  const t = useTranslations('career.profile');
  const [draft, setDraft] = useState<FactDraft>(() => toDraft(fact.factType, fact.value));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setDraft(toDraft(fact.factType, fact.value));
    setErrors({});
    setConfirmingDelete(false);
  }, [fact.id, fact.revision, fact.updatedAt, fact.factType, fact.value]);
  // `fact.value` is in the dependency list so a saved fact replaces the draft.
  // The parent keeps the same object while the person is typing.

  useEffect(() => {
    if (serverErrors.length === 0) return;
    const next: Partial<Record<string, string>> = {};
    for (const error of serverErrors) {
      const reason = reasonKey(error.reason);
      next[error.field] = reason ? t(`reasons.${reason}`) : t('reasons.invalid_type');
    }
    setErrors(next);
  }, [serverErrors, t]);

  const fields = FACT_FIELDS[fact.factType];
  const title = factTitle(fact.factType, fact.value) || t(`types.${fact.factType}`);

  function setField(field: string, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function submit(confirm: boolean) {
    const result = changedPatch(fact.factType, fact.value, draft, confirm ? 'confirmed' : fact.confirmation);
    if (!result.ok) {
      const next: Partial<Record<string, string>> = {};
      for (const error of result.errors) {
        const reason = reasonKey(error.reason);
        next[error.field] = reason ? t(`reasons.${reason}`) : t('reasons.invalid_type');
      }
      setErrors(next);
      return;
    }
    setErrors({});
    if (confirm) await onConfirm(result.patch);
    else if (result.patch) await onSave(result.patch);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-career-ink">{title}</h2>
        <RecordStatus state={fact.confirmation} label={t(`status_${fact.confirmation}`)} />
        <span className="text-xs font-semibold text-career-muted">{t(`sources.${fact.source}`)}</span>
      </div>
      {fact.missingFields.length > 0 ? (
        <p className="text-sm text-career-muted">{t('missing_fields', { fields: fact.missingFields.map((field) => t(`fields.${field}`)).join(', ') })}</p>
      ) : null}
      {Object.entries(fields).map(([field, spec]) => {
        const uncertain = fact.uncertain[field];
        const error = errors[field];
        const label = `${t(`fields.${field}`)}${spec.required ? ` (${t('required_mark')})` : ''}`;
        return (
          <div key={field} className="flex flex-col gap-1">
            {spec.kind === 'longtext' ? (
              <LongText label={label} value={draft[field] ?? ''} error={error} onChange={(value) => setField(field, value)} />
            ) : spec.kind === 'boolean' ? (
              <label className="flex min-h-career-touch items-center gap-2 text-sm font-semibold text-career-ink">
                <input
                  type="checkbox"
                  checked={(draft[field] ?? '') === 'true'}
                  onChange={(event) => setField(field, event.target.checked ? 'true' : '')}
                />
                {label}
              </label>
            ) : spec.kind === 'ref' ? (
              <label className="flex flex-col gap-1 text-sm font-semibold text-career-ink">
                {label}
                <select
                  className="h-11 rounded-md border border-career-line bg-career-surface px-3 text-base font-normal text-career-ink"
                  value={draft[field] ?? ''}
                  onChange={(event) => setField(field, event.target.value)}
                >
                  <option value="">{t('no_link')}</option>
                  {experiences.map((role) => (
                    <option key={role.id} value={role.id}>
                      {factTitle('experience', role.value) || t('types.experience')}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Input
                label={label}
                type={spec.kind === 'email' ? 'email' : 'text'}
                inputMode={spec.kind === 'date' ? 'numeric' : undefined}
                hint={spec.kind === 'date' ? t('date_hint') : spec.kind === 'list' ? t('list_hint') : undefined}
                error={error}
                value={draft[field] ?? ''}
                onChange={(event) => setField(field, event.target.value)}
              />
            )}
            {uncertain ? (
              <p className="text-sm text-career-orange-text">
                {t(`uncertain_reasons.${uncertain.reason}`)}
                {uncertain.raw ? ` ${t('uncertain_raw', { raw: uncertain.raw })}` : ''}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" loading={pending} loadingLabel={t('saving')}>
          {t('save')}
        </Button>
        {fact.confirmation === 'draft' ? (
          <Button type="button" loading={pending} loadingLabel={t('saving')} onClick={() => void submit(true)}>
            {t('confirm')}
          </Button>
        ) : null}
        {confirmingDelete ? (
          <>
            <Button type="button" variant="danger" onClick={() => void onDelete()}>
              {t('delete_confirm')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(false)}>
              {t('cancel')}
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(true)}>
            {t('delete')}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onHistory}>
          {t('history')}
        </Button>
      </div>
      {revisions ? (
        <ol className="flex flex-col gap-2 text-sm">
          {revisions.map((revision) => (
            <li key={revision.revision} className="rounded-md border border-career-line px-3 py-2">
              {t('revision', { revision: revision.revision, change: t(`changes.${revision.change}`) })}
            </li>
          ))}
        </ol>
      ) : null}
    </form>
  );
}

function LongText({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-career-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="block w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-base text-career-ink focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40"
      />
      {error ? <p className="text-sm text-career-danger">{error}</p> : null}
    </div>
  );
}

export type { FactType };
