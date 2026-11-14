'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  isApiError,
  type ApiClient,
  type BusinessOverview,
  type DeveloperStatus,
  type HumanServiceList,
  type LearningLoopView,
  type MaintenanceView,
  type MapList,
} from '@flacroncv/career-api-client';
import {
  Button,
  EmptyState,
  FailedJobState,
  LoadingState,
  PageHeader,
  PermissionDeniedState,
  PlanUpgradeState,
  ScreenStack,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { BusinessPanel } from './BusinessPanel';
import { MaintenancePanel } from './MaintenancePanel';
import { ScenariosPanel } from './ScenariosPanel';
import { DeveloperPanel, FormsPanel, LoopPanel, MapPanel, RecruitingPanel, ServicesPanel } from './ScopePanels';

export type ScopeMode = 'scenarios' | 'loop' | 'forms' | 'maintenance' | 'map' | 'business' | 'services' | 'recruiting' | 'developer';

/** What each page loads before it can show anything. */
interface Loaded {
  report?: LearningLoopView;
  map?: MapList;
  maintenance?: MaintenanceView;
  services?: HumanServiceList;
  discoverable?: boolean;
  developer?: DeveloperStatus;
  business?: BusinessOverview;
}

async function loadFor(mode: ScopeMode, api: ApiClient): Promise<Loaded> {
  switch (mode) {
    case 'loop':
      return { report: await api.learningLoop() };
    case 'map':
      return { map: await api.mapOpportunities() };
    case 'maintenance':
      return { maintenance: await api.maintenance() };
    case 'services':
      return { services: await api.humanServices() };
    case 'recruiting':
      // The saved choice, so the checkbox is right after a reload.
      return { discoverable: (await api.recruitingOptIn()).discoverable };
    case 'developer':
      return { developer: await api.developerStatus() };
    case 'business':
      return { business: await api.businessOverview() };
    default:
      return {};
  }
}

const linkButton =
  'inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white dark:text-stone-950';

export function ScopeScreen({
  mode,
  api,
  user,
  ready,
  signInHref,
  careerPlan,
  plansHref = '/career/plans',
}: {
  mode: ScopeMode;
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  /** The caller's career plan from /access; the Business page needs the Business plan. */
  careerPlan?: string;
  plansHref?: string;
}) {
  const t = useTranslations('career.scope');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'switched-off' | 'signed-out' | 'ready'>('loading');
  const [data, setData] = useState<Loaded>({});
  const needsBusinessPlan = mode === 'business' && careerPlan !== undefined && careerPlan !== 'business';

  const loadData = useCallback(async () => {
    setLoad('loading');
    try {
      setData(await loadFor(mode, api));
      setLoad('ready');
    } catch (error) {
      // The operator switch is off for this feature: retrying cannot help.
      if (isApiError(error, 'feature_unavailable')) {
        setLoad('switched-off');
        return;
      }
      const failure = profileLoadFailure(error);
      setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
    }
  }, [api, mode]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    if (needsBusinessPlan) {
      setLoad('ready');
      return;
    }
    void loadData();
  }, [ready, user, loadData, needsBusinessPlan]);

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'signed-out' || !user) {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={
          <a className={linkButton} href={signInHref}>
            {t('go_sign_in')}
          </a>
        }
      />
    );
  }

  let body: ReactNode;
  if (needsBusinessPlan) {
    body = (
      <PlanUpgradeState
        title={t('business_plan_title')}
        body={t('business_plan_body')}
        action={
          <a className={linkButton} href={plansHref}>
            {t('see_plans')}
          </a>
        }
      />
    );
  } else if (load === 'permission') {
    body = <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  } else if (load === 'switched-off') {
    body = <EmptyState title={t('off_title')} body={t('off_body')} />;
  } else if (load === 'unavailable') {
    body = (
      <FailedJobState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button onClick={() => void loadData()}>{t('retry')}</Button>}
      />
    );
  } else {
    body = (
      <>
        {mode === 'scenarios' ? <ScenariosPanel api={api} /> : null}
        {mode === 'loop' && data.report ? <LoopPanel report={data.report} /> : null}
        {mode === 'forms' ? <FormsPanel api={api} /> : null}
        {mode === 'maintenance' && data.maintenance ? <MaintenancePanel api={api} initial={data.maintenance} /> : null}
        {mode === 'map' && data.map ? <MapPanel api={api} list={data.map} /> : null}
        {mode === 'business' && data.business ? <BusinessPanel api={api} initial={data.business} /> : null}
        {mode === 'services' && data.services ? <ServicesPanel api={api} services={data.services} /> : null}
        {mode === 'recruiting' && data.discoverable !== undefined ? <RecruitingPanel api={api} initialDiscoverable={data.discoverable} /> : null}
        {mode === 'developer' && data.developer ? <DeveloperPanel api={api} initial={data.developer} /> : null}
      </>
    );
  }

  return (
    <ScreenStack>
      <PageHeader title={t(`${mode}_title`)} description={t(`${mode}_meta_description`)} />
      {body}
    </ScreenStack>
  );
}
