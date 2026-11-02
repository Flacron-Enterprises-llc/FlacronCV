'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ApiClient, ApplicationItem, Fact, Me, Resume, UsageSummary } from '@flacroncv/career-api-client';
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
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  locale: string;
}) {
  const t = useTranslations('career.dashboard');
  const units = useTranslations('career.billing');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'empty' | 'ready'>(
    ready && !user ? 'signed-out' : 'loading',
  );
  const [facts, setFacts] = useState<Fact[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
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
        api.applications(),
        api.alerts(),
        api.resumes(),
      ]);
      if (!usableAccount(account)) throw new Error('account');
      setFacts(factList.items);
      setUsage(usageView);
      setApplications(applicationList.items);
      setResumes(resumeList.items);
      setAlertCount(alertList.items.length);
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
  }, [api]);

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
          action={<a className="inline-flex min-h-career-touch cursor-pointer items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white" href={signInHref}>{t('go_sign_in')}</a>}
        />
      </div>
    );
  }
  if (load === 'empty') {
    return (
      <EmptyState
        title={t('empty_title')}
        body={t('empty_body')}
        action={<a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white" href={`/${locale}/career/profile`}>{t('open_profile')}</a>}
      />
    );
  }

  const counts = countFacts(facts);
  const cards = applications.map(toCard);
  const today = utcDateOnly(new Date());
  const action = suggestNextAction({ counts, applications: cards, alertCount, today });
  const deadline = nextDeadline(cards, today);
  const stages = stageCounts(cards);
  const interview = usage?.units.find((unit) => unit.unit === 'text_interview');
  const interviewRemaining = interview ? interview.includedRemaining + interview.packRemaining : 0;
  const practice = applications.find((item) => item.status === 'interviewing');
  const practiceHref = practice
    ? `/${locale}/career/interviews?opportunityId=${encodeURIComponent(practice.opportunityId)}`
    : `/${locale}/career/interviews`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-balance text-2xl font-bold text-career-ink">{t('meta_title')}</h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm text-career-muted">{t('workspace_lede')}</p>
      </div>
    <div data-testid="dashboard-layout" className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Card accent>
          <h2 className="text-2xl font-semibold text-career-ink">{t('next_title')}</h2>
          <p className="mt-2 text-sm text-career-muted">{t('next_body')}</p>
          <a className="mt-3 inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white" href={actionHref(action, locale)}>
            {actionLabel(action, t)}
          </a>
        </Card>
        {resumes[0] ? (
          <Card>
            <h2 className="text-lg font-bold text-career-ink">{t('recent_document')}</h2>
            <div className="mt-3 max-w-xs">
              <DocumentPaper
                templateId={resumes[0].templateId}
                mode="live"
                title={resumes[0].title}
                lines={recentLines}
                compact
              />
            </div>
            <p className="mt-2 text-sm text-career-muted">{resumes[0].title} · {resumes[0].createdAt.slice(0, 10)}</p>
            <a className="mt-3 inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={`/${locale}/career/documents`}>
              {t('open_resume')}
            </a>
          </Card>
        ) : null}
        <Card>
          <h2 className="text-lg font-bold text-career-ink">{t('profile_title')}</h2>
          <p className="mt-2 text-sm text-career-ink">{t('confirmed_count', { count: counts.confirmed })}</p>
          {counts.missingCore.length > 0 ? <p className="mt-1 text-sm text-career-muted">{t('missing_core', { sections: counts.missingCore.join(', ') })}</p> : null}
          <ul className="mt-3 flex flex-col gap-2">
            {facts.map((fact) => (
              <li key={fact.id} className="flex items-center gap-2 text-sm text-career-ink">
                <span>{factLabel(fact.factType, t)}</span>
                <RecordStatus state={fact.confirmation === 'confirmed' ? 'confirmed' : 'draft'} label={fact.confirmation === 'confirmed' ? t('confirmed') : t('draft')} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-career-ink">{t('saved_title')}</h2>
          <p className="mt-2 text-sm text-career-ink">{t('saved_count', { count: savedApplicationCount(cards) })}</p>
          <p className="mt-1 text-sm text-career-ink">{deadline?.deadline ? t('next_deadline', { title: deadline.title, date: deadline.deadline }) : t('no_deadline')}</p>
        </Card>
      </div>
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="text-lg font-semibold text-career-ink">{t('stages_title')}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {APPLICATION_STATUSES.map((status) => (
              <li key={status}>
                <Badge tone="neutral">{t(`status_${status}`)}: {stages[status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-career-ink">{t('interview_title')}</h2>
          <p className="mt-2 text-sm text-career-ink">{t('interview_remaining', { count: interviewRemaining })}</p>
          <a className="mt-3 inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={practiceHref}>{t('practice')}</a>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-career-ink">{t('usage_title')}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {(usage?.units ?? []).map((unit) => {
              const remaining = unit.includedRemaining + unit.packRemaining;
              return (
                <li key={unit.unit} className="text-sm text-career-ink">
                  {unitLabel(unit.unit, units)}: {remaining}
                  {remaining === 0 ? (
                    <>
                      {' '}
                      <a className="font-semibold text-career-orange-text" href={`/${locale}/settings/billing`}>{t('open_billing')}</a>
                    </>
                  ) : null}
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
  if (action.kind === 'application') return `/${locale}/applications`;
  if (action.kind === 'alerts') return `/${locale}/alerts`;
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
