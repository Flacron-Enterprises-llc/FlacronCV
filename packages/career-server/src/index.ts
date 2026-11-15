/**
 * Runtime entry for the API and worker bundles. Migration running is a
 * separate entry (`src/migrate.ts`) so the bundles do not pull in
 * node-pg-migrate.
 */
export { findRepoRoot, loadEnvFile, loadRepoEnv } from './env/load-env-file';
export { assertDeploySafety, assertProductionSafety, assertStagingSafety, deployEnv, isStagingDeploy, stagingMailRecipients, V1_FIREBASE_PROJECT_ID, V1_HOSTS } from './env/deploy-env';
export type { DeployEnv } from './env/deploy-env';
export { isLocalDatabaseUrl, readDatabaseUrl, redactDatabaseUrl } from './database/database-url';
export { BillingPageService } from './billing/billing-page.service';
export type { BillingUsage, BillingView } from './billing/billing-page.service';
export { BillingService } from './billing/billing.service';
export type { Clock } from './billing/billing.service';
export { BillingError, isBillingError } from './billing/errors';
export type { BillingErrorCode } from './billing/errors';
export { fingerprintRequest } from './billing/fingerprint';
export { buildCatalogSnapshot, publishCatalog } from './billing/catalog';
export type { CatalogSnapshot } from './billing/catalog';
export type { AccountRow } from './billing/accounts';
export type { LedgerRow, ReserveInput, ReserveResult, UnitBalance } from './billing/entitlements';
export type { PackRow, PackState, PackView, RevokeReason } from './billing/packs';
export { PaymentsService } from './billing/payments/payments.service';
export type { PaymentProviders, PaymentsConfig } from './billing/payments/payments.service';
export { ProviderSkus } from './billing/payments/skus';
export type { Sku } from './billing/payments/skus';
export { STRIPE_API_VERSION, stripeSignatureHeader } from './billing/payments/stripe';
export { UnconfiguredStripeGateway } from './billing/payments/checkout';
export type { CheckoutRequest, CheckoutResult, StripeGateway, UpgradePreview } from './billing/payments/checkout';
export { LiveStripeGateway, createStripeGateway, stripeSkusFromEnv } from './billing/payments/live-stripe';
export { UnconfiguredAppleVerifier } from './billing/payments/apple';
export type { AppleNotification, AppleNotificationVerifier } from './billing/payments/apple';
export { UnconfiguredGooglePlayApi, UnconfiguredGooglePushVerifier } from './billing/payments/google';
export type { GooglePlayApi, GooglePushVerifier } from './billing/payments/google';
export type { DeliveryOutcome } from './billing/payments/processor';
export {
  EmulatorIdTokenVerifier,
  fetchJsonWithMaxAge,
  FirebaseIdTokenVerifier,
  GooglePublicKeySource,
  isFreshSignIn,
  UnconfiguredIdTokenVerifier,
} from './identity/id-token';
export type { IdTokenVerifier, SigningKeySource, VerifiedIdentity } from './identity/id-token';
export { IdentityService } from './identity/identity.service';
export { createSignInDeleter, IdentityToolkitSignInDeleter, RecordingSignInDeleter, RetainedByV1SignInDeleter, UnconfiguredSignInDeleter } from './identity/sign-in-deleter';
export type { SignInDeleter } from './identity/sign-in-deleter';
export { checkCapacity, isFeatureEnabled, requireFeature, requirePlanFeature } from './metering/access';
export type { CapacityField } from './metering/access';
export { MeteringService } from './metering/metering.service';
export type {
  CapacityContext,
  JsonValue,
  MeteredOperation,
  MeteredResult,
  Spender,
  UsageView,
} from './metering/metering.service';
export { completeWithin, extractJsonObject, UnconfiguredTextModel } from './ai/text-model';
export type { TextModel, TextModelRequest, TextModelResponse } from './ai/text-model';
export { OpenAITextModel } from './ai/openai-text-model';
export { createTextModel } from './ai/create-text-model';
export { UnconfiguredSpeechTranscriber } from './ai/speech-transcriber';
export type { SpeechTranscribeResult, SpeechTranscriber, SpeechTranscriptionInput } from './ai/speech-transcriber';
export { UnconfiguredMapTiles } from './maps/map-tiles';
export type { MapTiles } from './maps/map-tiles';
export { UnconfiguredGeocoder, createGeocoder } from './maps/geocoder';
export { GoogleGeocoder, GOOGLE_MAPS_ATTRIBUTION } from './maps/google-geocoder';
export type { GeocodeHit, Geocoder } from './maps/geocoder';
export { CareerProfileService } from './profile/career-profile.service';
export type {
  CreateFactInput,
  FactRevisionView,
  FactView,
  ImportAllowance,
  ImportInput,
  ImportResult,
  ProfileOwner,
  ProfileView,
} from './profile/career-profile.service';
export { RESUME_IMPORT_TEMPLATE } from './profile/resume-import';
export { ResumeStudioService } from './resumes/resume.service';
export { MatchService } from './matching/match.service';
export type { MatchOutcome, MatchView } from './matching/match.service';
export { AlertService, RecordingAlertNotifier } from './alerts/alert.service';
export type {
  AlertItemView,
  AlertListView,
  AlertNotifier,
  AlertSettingsView,
  ChannelDelivery,
  FollowedCompanyView,
  LocationProfileView,
  SavedSearchView,
} from './alerts/alert.service';
export { InterviewService } from './interviews/interview.service';
export type { InterviewList, InterviewSessionView, StarStoryView, TextInterviewBalance } from './interviews/interview.service';
export { INTERVIEW_TEMPLATE } from './interviews/interview-compose';
export { CoachingService } from './coaching/coaching.service';
export type { AskCoachInput, CoachBalance, CoachList, CoachMessageView, CoachThreadSummaryView, CoachThreadView } from './coaching/coaching.service';
export { COACH_TEMPLATE } from './coaching/coaching-compose';
export { ApplicationService } from './applications/application.service';
export type { ApplicationSnapshot, ApplicationView, ReminderView } from './applications/application.service';
export { OpportunityService } from './opportunities/opportunity.service';
export type { OpportunityDetail, OpportunityItem } from './opportunities/opportunity.service';
export { UnconfiguredJobFeed } from './opportunities/feeds';
export { parseAdzuna, parseGreenhouse, parseLever, parseUsajobs } from './opportunities/normalize';
export { WritingService } from './writing/writing.service';
export type { WritingDocumentView, WritingList } from './writing/writing.service';
export { COVER_LETTER_TEMPLATE, WRITING_PROSE_TEMPLATE } from './writing/writing-compose';
export type { DocumentCreditView, ResumeFile, ResumeVersionView, ResumeView } from './resumes/resume.service';
export { RESUME_COMPOSE_TEMPLATE } from './resumes/resume-compose';
export { WindowRateLimit } from './http/rate-limit';
export { v1Instant } from './migration/v1-time';
export { AdminService, adminUidSet, PROVIDER_HEALTH, providerHealthFromEnv } from './admin/admin.service';
export type { AdminBusinessRow, AdminEvidenceView, AdminFlag } from './admin/admin.service';
export { AccountPrivacyService, DEFAULT_CLOSURE_SWEEP } from './privacy/account-privacy.service';
export type { ClosureSweepOptions, ClosureSweepResult } from './privacy/account-privacy.service';
export type { DeleteResult, ExportTicket } from './privacy/account-privacy.service';
export { MemoryObjectStorage, UnconfiguredObjectStorage, assertObjectKey, attachmentDisposition } from './storage/object-storage';
export type { ObjectStorage, SignedUrlOptions } from './storage/object-storage';
export { LocalDiskObjectStorage, createObjectStorage } from './storage/local-disk-storage';
export { S3ObjectStorage, MAX_SIGNED_URL_SECONDS } from './storage/s3-object-storage';
export { StorageCleanupService, storageCleanupIntervalMs, cleanupBackoffMs } from './storage/storage-cleanup';
export type { CleanupRun } from './storage/storage-cleanup';
export {
  EVIDENCE_FILE_CONTENT_TYPES,
  EVIDENCE_LINK_TTL_MS,
  evidenceUploadMaxBytes,
} from './evidence/evidence-files';
export {
  RecordingMailer,
  isAllowedSandboxRecipient,
  isSesMailboxSimulator,
  isSyntheticMailbox,
} from './mail/mailer';
export type { Mailer, MailMessage } from './mail/mailer';
export { SesMailer, createMailer } from './mail/ses-mailer';
export { withTransaction } from './billing/db';
export type { Db } from './billing/db';
export type { LegalAcceptanceInput, MeView, Principal } from './identity/identity.service';
export { EvidenceService } from './evidence/evidence.service';
export { ActionEngineService } from './action-engine/action-engine.service';
export type { ActionPackBalanceView, ActionPackList } from './action-engine/action-engine.service';
export { SkillsLearningService } from './learning/skills-learning.service';
export type { LearningEvidenceResult, SkillReportBalanceView, SkillReportList } from './learning/skills-learning.service';
export {
  CareerModesService,
  createLocationProfile,
  deleteLocationProfile,
  getLocationProfile,
  listLocationProfiles,
  readModeContext,
  updateLocationProfile,
} from './career-modes/career-modes.service';
export { OpportunityTrustService } from './opportunities/opportunity-trust.service';
export { PortfolioService } from './portfolios/portfolio.service';
export { VoiceInterviewService } from './voice/voice-interview.service';
export { RemainingService, readCredentialReminders } from './remaining/remaining.service';
export type { FactWriter, MaintenanceView, ScenarioList } from './remaining/remaining.service';
export { BusinessService } from './remaining/business.service';
export type { BusinessContext, BusinessOverview, BusinessMemberships, BusinessQueueItem, BusinessReport, BusinessUsage, CandidateDetail, InvitationResult } from './remaining/business.service';
export { verificationsFor } from './evidence/evidence.service';
export type { ApplicationOutcomeSource } from './remaining/remaining.service';
export {
  applyMappedPlan,
  decideCareerAccess,
  isV1Plan,
  parseCareerPlanMap,
  careerStatusFromV1,
  livePurchasedPlan,
  V1_PLANS,
} from './integration/v1-plan-bridge';
export type { CareerAccess, CareerPlanMap, CareerPurchase, V1AccountSnapshot, V1AccountSource, V1Plan } from './integration/v1-plan-bridge';
// Five-plan billing (wp-billing): unified metering for V1, usage page, packs and capacity add-ons, top-ups.
export { RemoteMeteringService, V1_METERED_UNITS, DEFAULT_RESERVATION_TTL_MS, MAX_RESERVATION_TTL_MS } from './metering/remote-metering';
export type { ReservationView, ReservationState, V1MeteredUnit } from './metering/remote-metering';
export { UsageService } from './usage/usage.service';
export type { UnitUsage, UsageOwner, UsageSummary, UsageWarningView } from './usage/usage.service';
export { capacityLimit, checkReactivation } from './metering/access';
export { applyCapacityExtras, capacityExtra, capacityExtrasFor, CAPACITY_FIELD_BY_ADDON_UNIT } from './billing/capacity';
export type { CapacityGrant, ExtendableCapacityField } from './billing/capacity';
export { grantPaidPack, recordAdjustment, revokePaidPack } from './billing/pack-purchases';
export type { AdjustmentKind, PaidPack } from './billing/pack-purchases';
export { compatiblePacks, decideTopUp, readTopUpSettings, setTopUp, topUpSpentCents } from './billing/top-up';
export type { TopUpDecision, TopUpRefusal, TopUpSettings } from './billing/top-up';
export { STORAGE_GRACE_DAYS, startStorageGraceIfOver, storageUsedBytes, syncV1Plan } from './billing/v1-sync';
export type { V1SyncInput, V1SyncResult } from './billing/v1-sync';
export { DEFAULT_CAREER_PLAN_MAP, liveCapacity } from './integration/v1-plan-bridge';
export type { V1BillingFacts, V1CapacitySubscription, V1PackPurchase } from './integration/v1-plan-bridge';

// wp-opps: owner-checked listing loader, alert delivery honesty, reminders.
export { readOpportunityForCandidate } from './opportunities/opportunity.service';
export type { ListingRecord, NotAppliedFilter, OpportunitySearchQuery, OpportunitySearchResult, PasteInput } from './opportunities/opportunity.service';
export { ChannelAlertNotifier, MailerEmailSender, NotificationSendError, createAlertNotifier, createRecordedEmailResolver } from './alerts/alert.service';
export type {
  AlertReasonView,
  ChannelConnection,
  ChannelSender,
  DeliveryView,
  ReminderListView,
  ReminderView as AlertReminderView,
  SavedSearchFilters,
  V1ReminderInput,
} from './alerts/alert.service';
export { businessSponsorFor, sponsoredSpender, pooledCandidate } from './remaining/business-sponsor';
export type { BusinessSponsor } from './remaining/business-sponsor';
