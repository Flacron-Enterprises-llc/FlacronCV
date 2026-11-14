'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ApiClient, MaintenanceView } from '@flacroncv/career-api-client';
import { Badge, Button, Card, Input } from '@/components/career/ui';
import { errorNote, ScopeNote, useScopeBusy, type ActionNote } from './scope-actions';

/** A date-only value shown in the interface language, without a time-zone shift. */
export function formatDateOnly(value: string, locale: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export function MaintenancePanel({ api, initial }: { api: ApiClient; initial: MaintenanceView }) {
  const t = useTranslations('career.scope');
  const locale = useLocale();
  const { busy, run } = useScopeBusy();
  const [view, setView] = useState<MaintenanceView>(initial);
  const [goal, setGoal] = useState('');
  const [goalNote, setGoalNote] = useState<ActionNote | null>(null);
  const [credentialName, setCredentialName] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [credentialNote, setCredentialNote] = useState<ActionNote | null>(null);

  async function saveGoal(event: FormEvent) {
    event.preventDefault();
    setGoalNote(null);
    if (!goal.trim()) {
      setGoalNote({ tone: 'error', key: 'goal_required' });
      return;
    }
    await run(async () => {
      try {
        const saved = await api.addPromotionGoal(goal.trim());
        setView((current) => ({ ...current, promotionGoals: [...current.promotionGoals, saved] }));
        setGoal('');
        setGoalNote({ tone: 'success', key: 'goal_saved' });
      } catch (error) {
        setGoalNote(errorNote(error));
      }
    });
  }

  async function saveCredential(event: FormEvent) {
    event.preventDefault();
    setCredentialNote(null);
    if (!credentialName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
      setCredentialNote({ tone: 'error', key: 'credential_required' });
      return;
    }
    await run(async () => {
      try {
        const saved = await api.addCredential(credentialName.trim(), expiresOn);
        // Every saved credential is listed, due or not; the list stays in expiry order.
        setView((current) => ({
          ...current,
          credentials: [...current.credentials, saved].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn)),
        }));
        setCredentialName('');
        setExpiresOn('');
        setCredentialNote({ tone: 'success', key: 'credential_saved', values: { name: saved.name } });
      } catch (error) {
        setCredentialNote(errorNote(error));
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('goals_heading')}</h2>
        <p className="mt-1 text-sm text-career-muted">{t('maintenance_help')}</p>
        {view.promotionGoals.length === 0 ? (
          <p className="mt-3 text-sm text-career-muted">{t('goals_empty')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {view.promotionGoals.map((item) => (
              <li key={item.id} className="rounded-md border border-career-line px-3 py-2 text-sm text-career-ink" dir="auto">
                {item.desiredTitle}
              </li>
            ))}
          </ul>
        )}
        <form className="mt-4 grid grid-cols-1 gap-3" onSubmit={(event) => void saveGoal(event)}>
          <Input label={t('goal')} placeholder={t('goal_placeholder')} value={goal} maxLength={200} onChange={(event) => setGoal(event.target.value)} />
          <div>
            <Button type="submit" disabled={busy}>{t('save_goal')}</Button>
          </div>
          <ScopeNote note={goalNote} />
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('credentials_heading')}</h2>
        <p className="mt-1 text-sm text-career-muted">{t('credentials_help')}</p>
        {view.credentials.length === 0 ? (
          <p className="mt-3 text-sm text-career-muted">{t('credentials_empty')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {view.credentials.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-career-line px-3 py-2 text-sm">
                <span className="min-w-0 text-career-ink" dir="auto">{item.name}</span>
                <span className="flex items-center gap-2 text-career-muted">
                  {t('expires', { date: formatDateOnly(item.expiresOn, locale) })}
                  {item.due ? <Badge tone="confirmed">{t('due_soon')}</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(event) => void saveCredential(event)}>
          <Input label={t('credential_name')} placeholder={t('credential_placeholder')} value={credentialName} maxLength={200} onChange={(event) => setCredentialName(event.target.value)} />
          <Input label={t('expires_on')} type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>{t('save_credential')}</Button>
          </div>
          <ScopeNote note={credentialNote} className="sm:col-span-2" />
        </form>
      </Card>
    </div>
  );
}
