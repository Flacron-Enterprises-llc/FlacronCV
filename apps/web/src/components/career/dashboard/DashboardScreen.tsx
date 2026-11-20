'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AlertItem, ApiClient, ApplicationItem, Fact, Me, OpportunityItem, Resume, UsageSummary } from '@flacroncv/career-api-client';
import {
  APPLICATION_STATUSES,
  countFacts,
  nextDeadline,
  savedApplicationCount,
  stageCounts,
  suggestNextAction,
  utcDateOnly,
  type DashboardAction,
  type DashboardApplication,
} from '@flacroncv/career-shared';
import { Badge, Button, Card, EmptyState, LoadingState, PermissionDeniedState, ProviderUnavailableState, RecordStatus } from '@/components/career/ui';
import { DocumentPaper } from '@/components/career/public/DocumentPaper';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

export function DashboardScreen({
  api,
  user,
  ready,
  signInHref,
  locale,
  loadApplications,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  locale: string;
  /** V1 integration: the overview reads V1's Jobs tracker. Defaults to the career API's own list (V2 tests). */
  loadApplications?: () => Promise<Array<ApplicationItem & { followUpDate?: string | null }>>;
}) {
  const t = useTranslations('career.dashboard');
  const units = useTranslations('career.billing');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'empty' | 'ready'>(
    ready && !user ? 'signed-out' : 'loading',
  );
  const [facts, setFacts] = useState<Fact[]>([]);
  const [applications, setApplications] = useState<Array<ApplicationItem & { followUpDate?: string | null }>>([]);
  const [savedListings, setSavedListings] = useState<OpportunityItem[]>([]);
  const [alertItems, setAlertItems] = useState<AlertItem[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [recentLines, setRecentLines] = useState<Array<{ id: string; text: string }>>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoad('loading');
    try {
      const [account, factList, usageView, applicationList, alertList, resumeList] = await Promise.all([
        api.me(),
        api.facts(),
        api.usage(),
        loadApplications ? loadApplications() : api.applications().then((list) => list.items),
        api.alerts(),
        api.resumes(),
      ]);
      if (!usableAccount(account)) throw new Error('account');
      setFacts(factList.items);
      setUsage(usageView);
      setApplications(applicationList);
      setResumes(resumeList.items);
      setAlertCount(alertList.items.length);
      setAlertItems(alertList.items);
      // Saved listings are optional on the overview: a failure leaves the rest of the page usable.
      setSavedListings(await api.savedOpportunities().then((list) => list.items).catch(() => []));
      const recent = resumeList.items[0];
      if (recent) {
        try {
          const full = await api.resume(recent.id);
          setRecentLines(
            (full.version?.body.sections ?? []).flatMap((section) =>
              section.lines.map((line) => ({ id: line.factId, text: line.text })),
            ),
          );
        } catch {
          setRecentLines([]);
        }
      } else {
        setRecentLines([]);
      }
      setLoad(factList.items.length === 0 ? 'empty' : 'ready');
    } catch (error) {
      const failure = profileLoadFailure(error);
      setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
    }
  }, [api, loadApplications]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadDashboard();
  }, [ready, user, loadDashboard]);

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button type="button" onClick={() => void loadDashboard()}>{t('retry')}</Button>}
      />
    );
  }
  if (load === 'signed-out' || !user) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-balance text-2xl font-bold text-career-ink">{t('meta_title')}</h1>
          <p className="mt-2 max-w-2xl text-pretty text-sm text-career-muted">{t('workspace_lede')}</p>
        </div>
        <EmptyState
          title={t('signed_out_title')}
          body={t('signed_out_body')}
          action={<a className="inline-flex min-h-career-touch cursor-pointer items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white dark:text-stone-950" href={signInHref}>{t('go_sign_in')}</a>}
        />
      </div>
    );
  }
  if (load === 'empty') {
    return (
      <EmptyState
        title={t('empty_title')}
        body={t('empty_body')}
        action={<a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white dark:text-stone-950" href={`/${locale}/career/profile`}>{t('open_profile')}</a>}
      />
    );
  }

  const counts = countFacts(facts);
  const cards = applications.map(toCard);
  const today = utcDateOnly(new Date());
  const action = suggestNextAction({ counts, applications: cards, alertCount, today });
  const deadline = nextDeadline(cards, today);
  const followUp = nextFollowUp(applications, today);
  const relevant = relevantListings(savedListings, alertItems);
  const deadlines = upcomingDeadlines(savedListings, cards, today);
  const stages = stageCounts(cards);
  const interview = usage?.units.find((unit) => unit.unit === 'text_interview');
  const interviewRemaining = interview ? interview.includedRemaining + interview.packRemaining : 0;
  const coaching = usage?.units.find((unit) => unit.unit === 'coaching_response');
  const coachingRemaining = coaching ? coaching.includedRemaining + coaching.packRemaining : 0;
  const practice = applications.find((item) => item.status === 'interviewing');
  const practiceHref = practice?.opportunityId
    ? `/${locale}/career/interviews?opportunityId=${encodeURIComponent(practice.opportunityId)}`
    : `/${locale}/career/interviews`;

  const active = applications.filter((item) => item.status !== 'rejected' && item.status !== 'withdrawn').length;
  const href = (path: string) => `/${locale}${path}`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-balance text-2xl font-bold tracking-tight text-career-ink sm:text-3xl">{t('meta_title')}</h1>
        <p className="mt-1.5 max-w-2xl text-pretty text-sm text-career-muted">{t('workspace_lede')}</p>
      </header>

      {/* The one suggested step, first and largest. */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1e3a5f] via-[#1b3354] to-[#142842] p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" aria-hidden="true" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-200">{t('next_title')}</h2>
        <p className="mt-2 max-w-2xl text-pretty text-sm text-white/80">{t('next_body')}</p>
        <a
          className="mt-5 inline-flex min-h-career-touch items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-[#1e3a5f] shadow-sm transition hover:bg-orange-50"
          href={actionHref(action, locale)}
        >
          {actionLabel(action, t)}
          <span aria-hidden="true" className="rtl:rotate-180">→</span>
        </a>
      </section>

      <section aria-label={t('stats_label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t('stat_facts')} value={counts.confirmed} href={href('/career/profile')} />
        <StatTile label={t('stat_active')} value={active} href={href('/jobs')} />
        <StatTile label={t('stat_deadlines')} value={deadlines.length} href={href('/career/alerts')} />
        <StatTile label={t('stat_alerts')} value={alertCount} href={href('/career/alerts')} />
      </section>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-career-ink">{t('stages_title')}</h2>
          <a className="text-sm font-semibold text-career-orange-text hover:underline" href={href('/jobs')}>{t('open_tracker')}</a>
        </div>
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {APPLICATION_STATUSES.map((status) => (
            <li key={status} className="rounded-lg border border-career-line bg-career-wash px-3 py-2.5">
              <span className="block text-xl font-bold tabular-nums text-career-ink">{stages[status]}</span>
              <span className="block truncate text-xs font-medium text-career-muted">{t(`status_${status}`)}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div data-testid="dashboard-layout" className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-career-ink">{t('relevant_title')}</h2>
              <a className="text-sm font-semibold text-career-orange-text hover:underline" href={href('/career/alerts')}>{t('open_alerts')}</a>
            </div>
            {relevant.length === 0 ? (
              <p className="mt-3 text-sm text-career-muted">{t('relevant_empty')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-career-line">
                {relevant.map((entry) => (
                  <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                    <a className="font-semibold text-career-ink hover:text-career-orange-text" dir="auto" href={href(`/career/opportunities/${entry.id}`)}>{entry.title}</a>
                    <span className="mt-0.5 block text-xs text-career-muted">{entry.source === 'saved' ? t('relevant_saved') : t('relevant_alert')}{entry.deadline ? ` · ${t('relevant_deadline', { date: entry.deadline })}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 rounded-lg bg-career-wash p-4">
              <h3 className="text-sm font-semibold text-career-ink">{t('deadlines_title')}</h3>
              {deadlines.length === 0 ? (
                <p className="mt-1 text-sm text-career-muted">{t('no_deadline')}</p>
              ) : (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {deadlines.map((entry) => (
                    <li key={entry.key} className="text-sm text-career-ink" dir="auto">{t('next_deadline', { title: entry.title, date: entry.date })}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-sm text-career-muted">{t('saved_count', { count: savedApplicationCount(cards) })}</p>
              {followUp ? <p className="mt-1 text-sm text-career-ink">{t('next_follow_up', { title: followUp.title, date: followUp.date })}</p> : null}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-career-ink">{t('profile_title')}</h2>
              <a className="text-sm font-semibold text-career-orange-text hover:underline" href={href('/career/profile')}>{t('open_profile')}</a>
            </div>
            <p className="mt-1 text-sm text-career-ink">{t('confirmed_count', { count: counts.confirmed })}</p>
            {counts.missingCore.length > 0 ? <p className="mt-1 text-sm text-career-muted">{t('missing_core', { sections: new Intl.ListFormat(locale, { type: 'conjunction' }).format(counts.missingCore.map((type) => factLabel(type, t))) })}</p> : null}
            <ul className="mt-4 flex flex-wrap gap-2">
              {facts.map((fact) => (
                <li key={fact.id} className="inline-flex items-center gap-2 rounded-full border border-career-line px-3 py-1 text-sm text-career-ink">
                  <span>{factLabel(fact.factType, t)}</span>
                  <RecordStatus state={fact.confirmation === 'confirmed' ? 'confirmed' : 'draft'} label={fact.confirmation === 'confirmed' ? t('confirmed') : t('draft')} />
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <h2 className="text-lg font-semibold text-career-ink">{t('interview_title')}</h2>
            <p className="mt-1 text-sm text-career-muted">{t('interview_remaining', { count: interviewRemaining })}</p>
            <a className="mt-3 inline-flex min-h-career-touch items-center rounded-lg bg-career-navy px-4 text-sm font-semibold text-white hover:bg-career-navy-hover dark:text-stone-950" href={practiceHref}>{t('practice')}</a>
            <div className="mt-5 border-t border-career-line pt-4">
              <h3 className="text-sm font-semibold text-career-ink">{t('coach_title')}</h3>
              <p className="mt-1 text-sm text-career-muted">{t('coach_body')}</p>
              <p className="mt-1 text-sm text-career-ink">{t('coach_remaining', { count: coachingRemaining })}</p>
              <a className="mt-2 inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text hover:underline" href={href('/career/coach')}>{t('open_coach')}</a>
            </div>
          </Card>

          {resumes[0] ? (
            <Card>
              <h2 className="text-lg font-semibold text-career-ink">{t('recent_document')}</h2>
              <div className="relative mt-3 max-h-56 overflow-hidden rounded-md border border-career-line">
                <DocumentPaper templateId={resumes[0].templateId} mode="live" title={resumes[0].title} lines={recentLines} compact />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-career-surface to-transparent" aria-hidden="true" />
              </div>
              <p className="mt-2 truncate text-sm text-career-muted">{resumes[0].title} · {resumes[0].createdAt.slice(0, 10)}</p>
              <a className="mt-1 inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text hover:underline" href={href('/career/documents')}>
                {t('open_resume')}
              </a>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-lg font-semibold text-career-ink">{t('usage_title')}</h2>
            <ul className="mt-3 divide-y divide-career-line">
              {(usage?.units ?? []).map((unit) => {
                const remaining = unit.includedRemaining + unit.packRemaining;
                return (
                  <li key={unit.unit} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 text-career-muted">{unitLabel(unit.unit, units)}</span>
                    {remaining === 0 ? (
                      <a className="shrink-0 font-semibold text-career-orange-text hover:underline" href={href('/settings/billing')}>{t('open_billing')}</a>
                    ) : (
                      <span className="shrink-0 font-semibold tabular-nums text-career-ink">{remaining}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** A headline number that opens the page behind it. */
function StatTile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <a href={href} className="group rounded-xl border border-career-line bg-career-surface p-4 shadow-sm transition hover:border-career-orange hover:shadow-md">
      <span className="block text-2xl font-bold tabular-nums text-career-ink sm:text-3xl">{value}</span>
      <span className="mt-1 block text-sm font-medium text-career-muted group-hover:text-career-ink">{label}</span>
    </a>
  );
}

/** The nearest follow-up date from the tracker. A follow-up is not a deadline and is never shown as one. */
function nextFollowUp(items: Array<ApplicationItem & { followUpDate?: string | null }>, today: string): { title: string; date: string } | null {
  const next = items
    .filter((item) => item.followUpDate && item.followUpDate >= today && item.status !== 'rejected' && item.status !== 'withdrawn')
    .sort((a, b) => (a.followUpDate as string).localeCompare(b.followUpDate as string))[0];
  return next?.followUpDate ? { title: next.snapshot.title, date: next.followUpDate } : null;
}

/** Saved listings first, then recent alerts not already saved; at most five. */
function relevantListings(saved: OpportunityItem[], alerts: AlertItem[]): Array<{ id: string; title: string; deadline: string | null; source: 'saved' | 'alert' }> {
  const out: Array<{ id: string; title: string; deadline: string | null; source: 'saved' | 'alert' }> = saved
    .filter((item) => item.label !== 'expired')
    .map((item) => ({ id: item.id, title: item.title, deadline: item.deadline, source: 'saved' as const }));
  for (const alert of alerts) {
    if (out.some((entry) => entry.id === alert.opportunityId)) continue;
    out.push({ id: alert.opportunityId, title: alert.title, deadline: alert.basic?.deadline ?? null, source: 'alert' });
  }
  return out.slice(0, 5);
}

/** Real deadlines only: stated listing deadlines and recorded application deadlines, today or later, nearest first. */
function upcomingDeadlines(saved: OpportunityItem[], cards: DashboardApplication[], today: string): Array<{ key: string; title: string; date: string }> {
  const entries = [
    ...saved.filter((item) => item.deadline).map((item) => ({ key: `o-${item.id}`, title: item.title, date: item.deadline as string })),
    ...cards.filter((card) => card.deadline).map((card) => ({ key: `a-${card.id}`, title: card.title, date: card.deadline as string })),
  ];
  return entries.filter((entry) => entry.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
}

function usableAccount(account: Me): boolean {
  return account.user.id.length > 0 && account.workspaceId.length > 0;
}

function toCard(item: ApplicationItem): DashboardApplication {
  return {
    id: item.id,
    opportunityId: item.opportunityId,
    status: item.status,
    title: item.snapshot.title,
    deadline: item.dates.deadline,
  };
}

function actionHref(action: DashboardAction, locale: string): string {
  if (action.kind === 'profile') return `/${locale}/career/profile`;
  if (action.kind === 'application') return `/${locale}/jobs`;
  if (action.kind === 'alerts') return `/${locale}/career/alerts`;
  if (action.kind === 'interview') {
    return action.opportunityId
      ? `/${locale}/career/interviews?opportunityId=${encodeURIComponent(action.opportunityId)}`
      : `/${locale}/career/interviews`;
  }
  return `/${locale}/career/opportunities`;
}

function actionLabel(action: DashboardAction, t: {
  (key: 'action_deadline', values: { title: string; date: string }): string;
  (key: 'action_alert' | 'action_interview' | 'action_search' | 'action_profile'): string;
}): string {
  if (action.reason === 'deadline') return t('action_deadline', { title: action.title ?? '', date: action.deadline ?? '' });
  if (action.reason === 'alert') return t('action_alert');
  if (action.reason === 'interviewing') return t('action_interview');
  if (action.reason === 'ready') return t('action_search');
  return t('action_profile');
}

function factLabel(type: string, t: (key: 'fact_contact' | 'fact_summary' | 'fact_experience' | 'fact_education' | 'fact_skill' | 'fact_project' | 'fact_achievement' | 'fact_certification' | 'fact_language' | 'fact_reference') => string): string {
  if (type === 'contact') return t('fact_contact');
  if (type === 'summary') return t('fact_summary');
  if (type === 'experience') return t('fact_experience');
  if (type === 'education') return t('fact_education');
  if (type === 'skill') return t('fact_skill');
  if (type === 'project') return t('fact_project');
  if (type === 'achievement') return t('fact_achievement');
  if (type === 'certification') return t('fact_certification');
  if (type === 'language') return t('fact_language');
  if (type === 'reference') return t('fact_reference');
  return type;
}

function unitLabel(unit: string, units: (key: 'unit_document_credit' | 'unit_resume_analysis' | 'unit_action_pack' | 'unit_alert_item' | 'unit_text_interview' | 'unit_voice_minute' | 'unit_skill_report' | 'unit_scenario_report' | 'unit_coaching_response' | 'unit_assisted_form' | 'unit_map_session' | 'unit_messaging_balance') => string): string {
  if (unit === 'document_credit') return units('unit_document_credit');
  if (unit === 'resume_analysis') return units('unit_resume_analysis');
  if (unit === 'action_pack') return units('unit_action_pack');
  if (unit === 'alert_item') return units('unit_alert_item');
  if (unit === 'text_interview') return units('unit_text_interview');
  if (unit === 'voice_minute') return units('unit_voice_minute');
  if (unit === 'skill_report') return units('unit_skill_report');
  if (unit === 'scenario_report') return units('unit_scenario_report');
  if (unit === 'coaching_response') return units('unit_coaching_response');
  if (unit === 'assisted_form') return units('unit_assisted_form');
  if (unit === 'map_session') return units('unit_map_session');
  if (unit === 'messaging_balance') return units('unit_messaging_balance');
  return unit;
}
