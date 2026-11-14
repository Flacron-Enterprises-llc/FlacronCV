'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ApiClient,
  MaintenanceAchievement,
  MaintenanceCredential,
  MaintenancePromotionGoal,
  MaintenanceView,
} from '@flacroncv/career-api-client';
import { credentialReminders, isCalendarDate } from '@flacroncv/career-shared';
import { Badge, Button, Card, ConfirmDialog, Input } from '@/components/career/ui';
import { errorNote, ScopeNote, useScopeBusy, type ActionNote } from './scope-actions';

/** A date-only value shown in the interface language, without a time-zone shift. */
export function formatDateOnly(value: string, locale: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/** Blank is fine; anything else must be a real calendar date (2026-02-31 is not). */
export function dateFieldOk(value: string, required = false): boolean {
  if (value === '') return !required;
  return isCalendarDate(value);
}

interface Option {
  id: string;
  label: string;
  factType?: string;
}

const selectClass =
  'block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40';

/** A short label for a profile fact, from its most telling field. */
export function factLabel(fact: { factType: string; value: Record<string, unknown> }): string {
  const v = fact.value;
  const text = (key: string) => (typeof v[key] === 'string' ? (v[key] as string) : '');
  if (fact.factType === 'experience') return [text('position'), text('company')].filter(Boolean).join(' · ');
  for (const key of ['title', 'name', 'position', 'institution', 'fullName', 'text']) if (text(key)) return text(key).slice(0, 80);
  return fact.factType;
}

function LinkSelect({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  const t = useTranslations('career.scope');
  return (
    <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
      <span>{label}</span>
      <select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t('scenario_no_link')}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * CV21 career maintenance. Manual entries cost nothing. A promotion goal
 * becomes a job title in the profile only through the explicit "I got it"
 * confirmation; nothing here changes the profile on its own.
 */
export function MaintenancePanel({ api, initial }: { api: ApiClient; initial: MaintenanceView }) {
  const t = useTranslations('career.scope');
  const locale = useLocale();
  const { busy, run } = useScopeBusy();
  const [view, setView] = useState<MaintenanceView>({ ...initial, reminders: initial.reminders ?? [] });
  const [facts, setFacts] = useState<Option[]>([]);
  const [evidence, setEvidence] = useState<Option[]>([]);

  useEffect(() => {
    let live = true;
    api
      .facts()
      .then((list) => {
        if (!live) return;
        setFacts(list.items.map((fact) => ({ id: fact.id, factType: fact.factType, label: factLabel(fact as never) })));
      })
      .catch(() => undefined);
    api
      .evidence()
      .then((list) => live && setEvidence(list.items.map((item) => ({ id: item.id, label: item.title }))))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api]);

  // Reminders are recomputed locally after edits, from the same rule the server uses.
  function withCredentials(credentials: MaintenanceCredential[]): Partial<MaintenanceView> {
    const today = new Date().toISOString().slice(0, 10);
    const sorted = [...credentials].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
    return { credentials: sorted, reminders: credentialReminders(sorted, today) };
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <RemindersCard reminders={view.reminders} locale={locale} />
      <AchievementsCard
        api={api}
        busy={busy}
        run={run}
        items={view.achievements}
        facts={facts}
        evidence={evidence}
        onChange={(achievements) => setView((current) => ({ ...current, achievements }))}
      />
      <GoalsCard
        api={api}
        busy={busy}
        run={run}
        items={view.promotionGoals}
        experience={facts.filter((fact) => fact.factType === 'experience')}
        locale={locale}
        onChange={(promotionGoals) => setView((current) => ({ ...current, promotionGoals }))}
      />
      <CredentialsCard
        api={api}
        busy={busy}
        run={run}
        items={view.credentials}
        facts={facts}
        evidence={evidence}
        locale={locale}
        onChange={(credentials) => setView((current) => ({ ...current, ...withCredentials(credentials) }))}
      />
      <p className="text-sm text-career-muted lg:col-span-2">{t('maintenance_free_note')}</p>
    </div>
  );

  function RemindersCard({ reminders, locale: lang }: { reminders: MaintenanceView['reminders']; locale: string }) {
    return (
      <Card className="lg:col-span-2">
        <h2 className="text-lg font-semibold text-career-ink">{t('reminders_heading')}</h2>
        {reminders.length === 0 ? (
          <p className="mt-2 text-sm text-career-muted">{t('reminders_empty')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reminders.map((reminder) => (
              <li key={`${reminder.credentialId}-${reminder.kind}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-career-line px-3 py-2 text-sm">
                <span className="min-w-0 text-career-ink" dir="auto">{reminder.name}</span>
                <span className="text-career-muted">
                  {reminder.expired
                    ? t('reminder_expired', { date: formatDateOnly(reminder.date, lang) })
                    : t(reminder.kind === 'review' ? 'reminder_review' : 'reminder_expiry', { date: formatDateOnly(reminder.date, lang), days: reminder.daysLeft })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }
}

type Run = (work: () => Promise<void>) => Promise<boolean>;

function AchievementsCard({
  api,
  busy,
  run,
  items,
  facts,
  evidence,
  onChange,
}: {
  api: ApiClient;
  busy: boolean;
  run: Run;
  items: MaintenanceAchievement[];
  facts: Option[];
  evidence: Option[];
  onChange: (items: MaintenanceAchievement[]) => void;
}) {
  const t = useTranslations('career.scope');
  const locale = useLocale();
  const empty = { title: '', details: '', achievedOn: '', factId: '', evidenceId: '' };
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState<ActionNote | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setNote(null);
    if (!draft.title.trim()) return setNote({ tone: 'error', key: 'achievement_required' });
    if (!dateFieldOk(draft.achievedOn)) return setNote({ tone: 'error', key: 'date_invalid' });
    const body = {
      title: draft.title.trim(),
      details: draft.details.trim(),
      achievedOn: draft.achievedOn || null,
      factId: draft.factId || null,
      evidenceId: draft.evidenceId || null,
    };
    await run(async () => {
      try {
        if (editing) {
          const saved = await api.updateAchievement(editing, body);
          onChange(items.map((item) => (item.id === saved.id ? saved : item)));
        } else {
          const saved = await api.addAchievement(body.title, body);
          onChange([saved, ...items]);
        }
        setDraft(empty);
        setEditing(null);
        setNote({ tone: 'success', key: 'achievement_saved' });
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  async function remove(id: string) {
    await run(async () => {
      try {
        await api.deleteAchievement(id);
        onChange(items.filter((item) => item.id !== id));
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('achievements_heading')}</h2>
      <p className="mt-1 text-sm text-career-muted">{t('achievements_help')}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-career-muted">{t('achievements_empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-career-line px-3 py-2 text-sm">
              <p className="font-semibold text-career-ink" dir="auto">{item.title}</p>
              {item.achievedOn ? <p className="text-career-muted">{formatDateOnly(item.achievedOn, locale)}</p> : null}
              {item.details ? <p className="mt-1 text-career-ink" dir="auto">{item.details}</p> : null}
              <div className="mt-1 flex flex-wrap gap-1">
                {item.factId ? <Badge tone="neutral">{t('linked_fact')}</Badge> : null}
                {item.evidenceId ? <Badge tone="neutral">{t('linked_evidence')}</Badge> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(item.id);
                    setDraft({ title: item.title, details: item.details, achievedOn: item.achievedOn ?? '', factId: item.factId ?? '', evidenceId: item.evidenceId ?? '' });
                  }}
                >
                  {t('edit')}
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void remove(item.id)}>{t('delete')}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
        <div className="sm:col-span-2">
          <Input label={t('achievement_title')} value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Input label={t('achievement_details')} value={draft.details} maxLength={2000} onChange={(e) => setDraft({ ...draft, details: e.target.value })} />
        </div>
        <Input
          label={t('achievement_date')}
          type="date"
          value={draft.achievedOn}
          error={dateFieldOk(draft.achievedOn) ? undefined : t('date_invalid')}
          onChange={(e) => setDraft({ ...draft, achievedOn: e.target.value })}
        />
        <LinkSelect label={t('link_fact')} value={draft.factId} options={facts} onChange={(factId) => setDraft({ ...draft, factId })} />
        <LinkSelect label={t('link_evidence')} value={draft.evidenceId} options={evidence} onChange={(evidenceId) => setDraft({ ...draft, evidenceId })} />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy}>{editing ? t('save_changes') : t('add_achievement')}</Button>
          {editing ? (
            <Button type="button" variant="secondary" onClick={() => { setEditing(null); setDraft(empty); }}>{t('cancel')}</Button>
          ) : null}
        </div>
        <ScopeNote note={note} className="sm:col-span-2" />
      </form>
    </Card>
  );
}

function GoalsCard({
  api,
  busy,
  run,
  items,
  experience,
  locale,
  onChange,
}: {
  api: ApiClient;
  busy: boolean;
  run: Run;
  items: MaintenancePromotionGoal[];
  experience: Option[];
  locale: string;
  onChange: (items: MaintenancePromotionGoal[]) => void;
}) {
  const t = useTranslations('career.scope');
  const [goal, setGoal] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState<ActionNote | null>(null);
  const [confirming, setConfirming] = useState<MaintenancePromotionGoal | null>(null);
  const [factId, setFactId] = useState('');
  const [company, setCompany] = useState('');
  const [startDate, setStartDate] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    setNote(null);
    if (!goal.trim()) return setNote({ tone: 'error', key: 'goal_required' });
    if (!dateFieldOk(targetDate)) return setNote({ tone: 'error', key: 'date_invalid' });
    await run(async () => {
      try {
        if (editing) {
          const saved = await api.updatePromotionGoal(editing, { desiredTitle: goal.trim(), targetDate: targetDate || null });
          onChange(items.map((item) => (item.id === saved.id ? saved : item)));
        } else {
          const saved = await api.addPromotionGoal(goal.trim(), targetDate || null);
          onChange([...items, saved]);
        }
        setGoal('');
        setTargetDate('');
        setEditing(null);
        setNote({ tone: 'success', key: 'goal_saved' });
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  async function act(id: string, work: () => Promise<MaintenancePromotionGoal | null>) {
    await run(async () => {
      try {
        const saved = await work();
        onChange(saved ? items.map((item) => (item.id === saved.id ? saved : item)) : items.filter((item) => item.id !== id));
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  async function confirmPromotion() {
    if (!confirming) return;
    if (!factId && !company.trim()) return setNote({ tone: 'error', key: 'promotion_need_role' });
    if (!dateFieldOk(startDate)) return setNote({ tone: 'error', key: 'date_invalid' });
    const target = confirming;
    await act(target.id, () =>
      api.confirmPromotion(target.id, factId ? { experienceFactId: factId } : { company: company.trim(), startDate: startDate || null }),
    );
    setConfirming(null);
    setNote({ tone: 'success', key: 'promotion_confirmed' });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('goals_heading')}</h2>
      <p className="mt-1 text-sm text-career-muted">{t('maintenance_help')}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-career-muted">{t('goals_empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-career-line px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-career-ink" dir="auto">{item.desiredTitle}</span>
                <Badge tone={item.status === 'confirmed' ? 'confirmed' : item.status === 'dropped' ? 'later' : 'neutral'}>{t(`goal_status_${item.status}`)}</Badge>
              </div>
              {item.targetDate ? <p className="text-career-muted">{t('goal_target', { date: formatDateOnly(item.targetDate, locale) })}</p> : null}
              {item.status === 'open' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => { setConfirming(item); setFactId(''); setCompany(''); setStartDate(''); }}>
                    {t('promotion_got_it')}
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditing(item.id); setGoal(item.desiredTitle); setTargetDate(item.targetDate ?? ''); }}>
                    {t('edit')}
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void act(item.id, () => api.updatePromotionGoal(item.id, { status: 'dropped' }))}>
                    {t('goal_drop')}
                  </Button>
                </div>
              ) : null}
              <div className="mt-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void act(item.id, async () => { await api.deletePromotionGoal(item.id); return null; })}>
                  {t('delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
        <Input label={t('goal')} placeholder={t('goal_placeholder')} value={goal} maxLength={200} onChange={(event) => setGoal(event.target.value)} />
        <Input label={t('goal_target_date')} type="date" value={targetDate} error={dateFieldOk(targetDate) ? undefined : t('date_invalid')} onChange={(event) => setTargetDate(event.target.value)} />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy}>{editing ? t('save_changes') : t('save_goal')}</Button>
          {editing ? <Button type="button" variant="secondary" onClick={() => { setEditing(null); setGoal(''); setTargetDate(''); }}>{t('cancel')}</Button> : null}
        </div>
        <ScopeNote note={note} className="sm:col-span-2" />
      </form>
      {confirming ? (
        <div className="mt-4 rounded-md border border-career-line bg-career-wash p-3" role="group" aria-label={t('promotion_confirm_title')}>
          <h3 className="text-base font-semibold text-career-ink">{t('promotion_confirm_title')}</h3>
          <p className="mt-1 text-sm text-career-muted">{t('promotion_confirm_body', { title: confirming.desiredTitle })}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LinkSelect label={t('promotion_update_role')} value={factId} options={experience} onChange={setFactId} />
            {factId ? null : (
              <>
                <Input label={t('promotion_company')} value={company} maxLength={200} onChange={(event) => setCompany(event.target.value)} />
                <Input label={t('promotion_start')} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void confirmPromotion()}>{t('promotion_confirm_go')}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming(null)}>{t('cancel')}</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function CredentialsCard({
  api,
  busy,
  run,
  items,
  facts,
  evidence,
  locale,
  onChange,
}: {
  api: ApiClient;
  busy: boolean;
  run: Run;
  items: MaintenanceCredential[];
  facts: Option[];
  evidence: Option[];
  locale: string;
  onChange: (items: MaintenanceCredential[]) => void;
}) {
  const t = useTranslations('career.scope');
  const empty = { name: '', issuer: '', region: '', expiresOn: '', reviewOn: '', factId: '', evidenceId: '' };
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState<ActionNote | null>(null);
  const [deleting, setDeleting] = useState<MaintenanceCredential | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setNote(null);
    if (!draft.name.trim() || !dateFieldOk(draft.expiresOn, true)) return setNote({ tone: 'error', key: 'credential_required' });
    if (!dateFieldOk(draft.reviewOn)) return setNote({ tone: 'error', key: 'date_invalid' });
    const body = {
      name: draft.name.trim(),
      expiresOn: draft.expiresOn,
      issuer: draft.issuer.trim(),
      region: draft.region.trim(),
      reviewOn: draft.reviewOn || null,
      factId: draft.factId || null,
      evidenceId: draft.evidenceId || null,
    };
    await run(async () => {
      try {
        const saved = editing ? await api.updateCredential(editing, body) : await api.addCredential(body.name, body.expiresOn, body);
        onChange(editing ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved]);
        setDraft(empty);
        setEditing(null);
        setNote({ tone: 'success', key: 'credential_saved', values: { name: saved.name } });
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  async function remove() {
    if (!deleting) return;
    const id = deleting.id;
    await run(async () => {
      try {
        await api.deleteCredential(id);
        onChange(items.filter((item) => item.id !== id));
      } catch (error) {
        setNote(errorNote(error));
      } finally {
        setDeleting(null);
      }
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-ink">{t('credentials_heading')}</h2>
      <p className="mt-1 text-sm text-career-muted">{t('credentials_help')}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-career-muted">{t('credentials_empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-career-line px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 font-semibold text-career-ink" dir="auto">{item.name}</span>
                <span className="flex items-center gap-2 text-career-muted">
                  {t('expires', { date: formatDateOnly(item.expiresOn, locale) })}
                  {item.due ? <Badge tone="confirmed">{t('due_soon')}</Badge> : null}
                </span>
              </div>
              {item.issuer || item.region ? (
                <p className="text-career-muted" dir="auto">{[item.issuer, item.region ? t('valid_in', { region: item.region }) : ''].filter(Boolean).join(' · ')}</p>
              ) : null}
              {item.reviewOn ? <p className="text-career-muted">{t('review_on_label', { date: formatDateOnly(item.reviewOn, locale) })}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(item.id);
                    setDraft({ name: item.name, issuer: item.issuer, region: item.region, expiresOn: item.expiresOn, reviewOn: item.reviewOn ?? '', factId: item.factId ?? '', evidenceId: item.evidenceId ?? '' });
                  }}
                >
                  {t('edit')}
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setDeleting(item)}>{t('delete')}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
        <Input label={t('credential_name')} placeholder={t('credential_placeholder')} value={draft.name} maxLength={200} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <Input label={t('credential_issuer')} value={draft.issuer} maxLength={200} onChange={(e) => setDraft({ ...draft, issuer: e.target.value })} />
        <Input label={t('credential_region')} hint={t('credential_region_hint')} value={draft.region} maxLength={200} onChange={(e) => setDraft({ ...draft, region: e.target.value })} />
        <Input label={t('expires_on')} type="date" value={draft.expiresOn} error={dateFieldOk(draft.expiresOn) ? undefined : t('date_invalid')} onChange={(e) => setDraft({ ...draft, expiresOn: e.target.value })} />
        <Input label={t('review_on')} type="date" value={draft.reviewOn} error={dateFieldOk(draft.reviewOn) ? undefined : t('date_invalid')} onChange={(e) => setDraft({ ...draft, reviewOn: e.target.value })} />
        <LinkSelect label={t('link_fact')} value={draft.factId} options={facts} onChange={(factId) => setDraft({ ...draft, factId })} />
        <LinkSelect label={t('link_evidence')} value={draft.evidenceId} options={evidence} onChange={(evidenceId) => setDraft({ ...draft, evidenceId })} />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy}>{editing ? t('save_changes') : t('save_credential')}</Button>
          {editing ? <Button type="button" variant="secondary" onClick={() => { setEditing(null); setDraft(empty); }}>{t('cancel')}</Button> : null}
        </div>
        <ScopeNote note={note} className="sm:col-span-2" />
      </form>
      <ConfirmDialog
        open={deleting !== null}
        title={t('credential_delete_title')}
        body={deleting ? t('credential_delete_body', { name: deleting.name }) : undefined}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}
