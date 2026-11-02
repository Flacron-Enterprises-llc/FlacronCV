'use client';

import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { isLaunchLocale, type Locale } from '@flacroncv/career-shared';
import { useAuth } from '@/providers/AuthProvider';
import { ActionPackScreen } from './action-pack/ActionPackScreen';
import { AdminScreen } from './admin/AdminScreen';
import { AlertsScreen } from './alerts/AlertsScreen';
import { RelocationModesScreen } from './career-modes/RelocationModesScreen';
import { CareerDataScreen } from './CareerDataScreen';
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
import { useCareerApi, useCareerUser } from './CareerServices';

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

export function CareerOverviewRoute() {
  const { uiLocale, ...props } = useScreenProps();
  return (
    <CareerGate>
      <DashboardScreen {...props} locale={uiLocale} />
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
  const { uiLocale: _ui, ...props } = useScreenProps();
  return (
    <CareerGate>
      <ScopeScreen {...props} mode={mode} />
    </CareerGate>
  );
}

/** Export and erase are served whatever the plan, so this page is not behind the gate. */
export function CareerDataRoute() {
  const { uiLocale, ...props } = useScreenProps();
  return <CareerDataScreen {...props} documentLocale={documentLocale(uiLocale)} />;
}

/** V1 admin area. The career service checks the operator allowlist / admin claim itself. */
export function CareerAdminRoute() {
  const { uiLocale: _ui, ...props } = useScreenProps();
  return <AdminScreen {...props} />;
}
