'use client';

import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { isLaunchLocale, type Locale } from '@flacroncv/career-shared';
import type { JobApplication } from '@flacroncv/shared-types';
import { useAuth } from '@/providers/AuthProvider';
import { api as v1Api } from '@/lib/api';
import { careerItemsFromV1Jobs } from '@/lib/career/v1-jobs';
import { ActionPackScreen } from './action-pack/ActionPackScreen';
import { AdminScreen } from './admin/AdminScreen';
import { AlertsScreen } from './alerts/AlertsScreen';
import { RelocationModesScreen } from './career-modes/RelocationModesScreen';
import { CareerDataScreen } from './CareerDataScreen';
import { CoachScreen } from './coach/CoachScreen';
import { DashboardScreen } from './dashboard/DashboardScreen';
import { EvidenceScreen } from './evidence/EvidenceScreen';
import { InterviewsScreen } from './interviews/InterviewsScreen';
import { LearningScreen } from './learning/LearningScreen';
import { OpportunityDetailScreen } from './opportunities/OpportunityDetailScreen';
import { OpportunityScreen } from './opportunities/OpportunityScreen';
import { PortfolioScreen } from './portfolios/PortfolioScreen';
import { ProfileScreen } from './profile/ProfileScreen';
import { DocumentsScreen } from './documents/DocumentsScreen';
import { ScopeScreen, type ScopeMode } from './scope/ScopeScreen';
import { VoiceScreen } from './voice/VoiceScreen';
import { CareerGate } from './CareerGate';
import { useCareerAccess, useCareerApi, useCareerUser } from './CareerServices';

/** Props every career screen takes, from V1's session. */
function useScreenProps() {
  const api = useCareerApi();
  const { user, ready } = useCareerUser();
  const uiLocale = useLocale();
  return { api, user, ready, signInHref: `/${uiLocale}/login`, uiLocale };
}

/**
 * Career documents are written in English or French (the V2 generators). V1's
 * other interface languages keep their interface; documents default to English.
 */
function documentLocale(uiLocale: string): Locale {
  return isLaunchLocale(uiLocale) ? uiLocale : 'en';
}

/** Module-level, so its identity is stable across renders (the overview reloads when it changes). */
const loadV1Jobs = async () => careerItemsFromV1Jobs(await v1Api.get<JobApplication[]>('/jobs'));

export function CareerOverviewRoute() {
  const { uiLocale, ...props } = useScreenProps();
  return (
    <CareerGate>
      <DashboardScreen
        {...props}
        locale={uiLocale}
        // V1's Jobs tracker is the only application tracker.
        loadApplications={loadV1Jobs}
      />
    </CareerGate>
  );
}

export function CareerProfileRoute() {
  const { uiLocale, ...props } = useScreenProps();
  const { resendVerification } = useAuth();
  return (
    <CareerGate>
      <ProfileScreen
        {...props}
        locale={documentLocale(uiLocale)}
        // The interface language is V1's switcher; here it sets the career document language only.
        onLocale={(next) => void props.api.setLocale(next)}
        onResendVerification={resendVerification}
      />
    </CareerGate>
  );
}

export function CareerEvidenceRoute() {
  const { uiLocale: _ui, ...props } = useScreenProps();
  return (
    <CareerGate>
      <EvidenceScreen {...props} />
    </CareerGate>
  );
}

export function CareerPortfoliosRoute() {
  const { uiLocale: _ui, ...props } = useScreenProps();
  return (
    <CareerGate>
      <PortfolioScreen {...props} />
    </CareerGate>
  );
}

export function CareerDocumentsRoute() {
  const { uiLocale: _ui, ...props } = useScreenProps();
  return (
    <CareerGate>
      <DocumentsScreen {...props} />
    </CareerGate>
  );
}

export function CareerOpportunitiesRoute() {
  const { uiLocale, ...props } = useScreenProps();
  return (
    <CareerGate>
      <OpportunityScreen {...props} locale={uiLocale} />
    </CareerGate>
  );
}

export function CareerOpportunityDetailRoute({ opportunityId }: { opportunityId: string }) {
  const { uiLocale: _ui, ...props } = useScreenProps();
  return (
    <CareerGate>
      <OpportunityDetailScreen {...props} opportunityId={opportunityId} />
    </CareerGate>
  );
}

export function CareerAlertsRoute() {
  const { uiLocale, ...props } = useScreenProps();
  return (
    <CareerGate>
      <AlertsScreen {...props} locale={uiLocale} />
    </CareerGate>
  );
}

export function CareerActionPackRoute() {
  const { uiLocale: _ui, ...props } = useScreenProps();
  return (
    <CareerGate>
      <ActionPackScreen {...props} />
    </CareerGate>
  );
}

export function CareerInterviewsRoute() {
  const { uiLocale, ...props } = useScreenProps();
  const opportunityId = useSearchParams().get('opportunityId');
  return (
    <CareerGate>
      <InterviewsScreen {...props} locale={uiLocale} opportunityId={opportunityId} />
    </CareerGate>
  );
}

export function CareerCoachRoute() {
  const { uiLocale, ...props } = useScreenProps();
  return (
    <CareerGate>
      <CoachScreen {...props} locale={uiLocale} />
    </CareerGate>
  );
}

export function CareerVoiceRoute() {
  const { uiLocale: _ui, ...props } = useScreenProps();
  const opportunityId = useSearchParams().get('opportunityId');
  return (
    <CareerGate>
      <VoiceScreen {...props} opportunityId={opportunityId} />
    </CareerGate>
  );
}

export function CareerLearningRoute() {
  const { uiLocale: _ui, ...props } = useScreenProps();
  return (
    <CareerGate>
      <LearningScreen {...props} />
    </CareerGate>
  );
}

export function CareerRelocationRoute() {
  const { uiLocale: _ui, ...props } = useScreenProps();
  return (
    <CareerGate>
      <RelocationModesScreen {...props} />
    </CareerGate>
  );
}

/** Scenarios, outcomes, forms, maintenance, map, business, recruiting, developer, services. */
export function CareerScopeRoute({ mode }: { mode: ScopeMode }) {
  const { uiLocale, ...props } = useScreenProps();
  const access = useCareerAccess();
  const search = useSearchParams();
  return (
    <CareerGate>
      <ScopeScreen
        {...props}
        mode={mode}
        careerPlan={access.data?.careerPlan}
        plansHref={`/${uiLocale}/settings/billing`}
        joinToken={mode === 'join' ? search?.get('token') ?? null : null}
      />
    </CareerGate>
  );
}

/** Export and erase are served whatever the plan, so this page is not behind the gate. */
export function CareerDataRoute({ embedded = false }: { embedded?: boolean } = {}) {
  const { uiLocale, ...props } = useScreenProps();
  return <CareerDataScreen {...props} documentLocale={documentLocale(uiLocale)} embedded={embedded} />;
}

/** V1 admin area. The career service checks the operator allowlist / admin claim itself. */
export function CareerAdminRoute() {
  const { uiLocale: _ui, ...props } = useScreenProps();
  return <AdminScreen {...props} />;
}
