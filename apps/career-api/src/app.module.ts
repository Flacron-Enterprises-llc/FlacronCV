import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AccountPrivacyService, ActionEngineService, AdminService, AlertService, ApplicationService, BillingPageService, CareerModesService, CareerProfileService, EvidenceService, IdentityService, InterviewService, MatchService, MeteringService, OpportunityService, OpportunityTrustService, PortfolioService, RemainingService, ResumeStudioService, SkillsLearningService, VoiceInterviewService, WritingService } from '@flacroncv/career-server';
import { aiProviders, TEXT_MODEL } from './ai/ai.providers';
import { AuthGuard } from './auth/auth.guard';
import { authProviders } from './auth/auth.providers';
import { SessionController } from './auth/session.controller';
import { billingPageProviders } from './billing/billing.controller';
import { paymentsProviders } from './billing/payments.providers';
import { DatabaseService } from './database/database.service';
import { HealthController } from './health/health.controller';
import { AiJobsController } from './metering/ai-jobs.controller';
import { meteringProviders } from './metering/metering.providers';
import { ProfileController, profileProviders } from './profile/profile.controller';
import { ResumesController, resumeProviders } from './resumes/resumes.controller';
import { AlertsController, alertProviders } from './alerts/alerts.controller';
// V1 integration: V1's Jobs tracker is the only application tracker, so ApplicationsController is not mounted.
import { applicationProviders } from './applications/applications.controller';
import { InterviewsController, interviewProviders } from './interviews/interviews.controller';
import { MatchingController, matchProviders } from './matching/matching.controller';
import { OpportunitiesController, opportunityProviders } from './opportunities/opportunities.controller';
import { AdminController, adminProviders } from './admin/admin.controller';
import { PrivacyController, privacyProviders } from './privacy/privacy.controller';
import { storageProviders } from './storage/storage.providers';
import { WritingController, writingProviders } from './writing/writing.controller';
import { EvidenceController, evidenceProviders } from './evidence/evidence.controller';
import { ActionEngineController, actionEngineProviders } from './action-engine/action-engine.controller';
import { LearningController, learningProviders } from './learning/learning.controller';
import { CareerModesController, careerModesProviders } from './career-modes/career-modes.controller';
import { PortfoliosController, portfolioProviders } from './portfolios/portfolios.controller';
import { VoiceController, voiceProviders } from './voice/voice.controller';
import { RemainingController, remainingProviders } from './remaining/remaining.controller';
import { GEOCODER, mapsProviders } from './maps/maps.providers';
import { AccessController, UsageController } from './integration/access.controller';
import { integrationProviders } from './integration/integration.providers';
import { CareerAccessService } from './integration/career-access.service';

/**
 * The repository-root `.env` is loaded by `loadRepoEnv` before this module
 * is created (`main.ts`, `test/setup-env.ts`), so ConfigModule does not
 * read a file of its own.
 *
 * `AuthGuard` is global: a route without `@Public()` needs a valid token.
 *
 * V1 integration: V2's checkout, estimates, spending caps, portal and store
 * webhooks (`BillingController`, `WebhooksController`) are deliberately not
 * mounted. V1 billing is unchanged; career access comes from the V1 plan
 * through `CAREER_PLAN_MAP` (`integration/`).
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
  controllers: [HealthController, AccessController, UsageController, SessionController, AiJobsController, ProfileController, ResumesController, WritingController, OpportunitiesController, MatchingController, AlertsController, InterviewsController, EvidenceController, ActionEngineController, LearningController, CareerModesController, PortfoliosController, VoiceController, RemainingController, PrivacyController, AdminController],
  providers: [
    DatabaseService,
    ...integrationProviders,
    ...paymentsProviders,
    ...billingPageProviders,
    ...authProviders,
    ...meteringProviders,
    ...aiProviders,
    ...mapsProviders,
    ...profileProviders,
    ...resumeProviders,
    ...writingProviders,
    ...opportunityProviders,
    ...matchProviders,
    ...alertProviders,
    ...applicationProviders,
    ...interviewProviders,
    ...evidenceProviders,
    ...actionEngineProviders,
    ...learningProviders,
    ...careerModesProviders,
    ...portfolioProviders,
    ...voiceProviders,
    ...remainingProviders,
    ...storageProviders,
    ...privacyProviders,
    ...adminProviders,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [DatabaseService, CareerAccessService, MeteringService, IdentityService, CareerProfileService, ResumeStudioService, WritingService, OpportunityService, OpportunityTrustService, MatchService, AlertService, ApplicationService, InterviewService, EvidenceService, ActionEngineService, SkillsLearningService, CareerModesService, PortfolioService, VoiceInterviewService, RemainingService, BillingPageService, AccountPrivacyService, AdminService, TEXT_MODEL, GEOCODER],
})
export class AppModule {}
