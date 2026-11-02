import type {
  CareerPreferences,
  FactConfirmation,
  FactCounts,
  FactSource,
  FactType,
  FactValue,
  Locale,
  SharedCvDocument,
  UncertainFields,
} from '@flacroncv/career-shared';

/** JSON shapes of docs/API_CONTRACT.md. Timestamps arrive as ISO strings. */

export interface ErrorBody {
  code: string;
  [field: string]: unknown;
}

export interface SessionResponse {
  user: { id: string; authUserId: string; locale: Locale };
}

export interface LegalVersions {
  terms: string;
  privacy: string;
  disclaimer: string;
}

export interface LegalState {
  required: LegalVersions;
  accepted: { termsVersion: string; privacyVersion: string; disclaimerVersion: string; acceptedAt: string } | null;
  needsAcceptance: boolean;
}

export interface Me {
  user: { id: string; authUserId: string; locale: Locale; email: string | null; emailVerified: boolean };
  workspaceId: string;
  billingAccountId: string;
  planId: string;
  legal: LegalState;
}

export interface Fact {
  id: string;
  factType: FactType;
  value: FactValue;
  source: FactSource;
  confirmation: FactConfirmation;
  uncertain: UncertainFields;
  missingFields: string[];
  importId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

export interface FactRevision {
  revision: number;
  value: FactValue;
  confirmation: FactConfirmation;
  uncertain: UncertainFields;
  change: 'created' | 'edited' | 'confirmed';
  changedAt: string;
}

export interface FactList {
  items: Fact[];
  profileVersion: number;
}

export interface Profile {
  version: number;
  preferences: CareerPreferences;
  counts: FactCounts;
}

export interface ImportAllowance {
  limit: number;
  used: number;
  pending: number;
  remaining: number;
  resetsAt: string;
}

export interface ImportResult {
  importId: string;
  facts: Fact[];
  missing: FactType[];
  importsRemaining: number;
  resetsAt: string;
}

export interface NewFact {
  factType: FactType;
  value: FactValue;
  source?: 'manual' | 'paste';
  confirmation?: FactConfirmation;
}

export interface ImportRequest {
  text: string;
  fileName?: string;
  format: 'pdf' | 'docx' | 'text';
}

export interface ResumeLine {
  factId: string;
  factType: string;
  text: string;
  uncertain: boolean;
}

export interface ResumeSection {
  factType: string;
  lines: ResumeLine[];
}

export interface ResumeBody {
  templateId: string;
  confirmation: 'draft' | 'confirmed';
  sections: ResumeSection[];
}

export interface ResumeVersion {
  id: string;
  resumeId: string;
  versionNumber: number;
  body: ResumeBody;
  /** Set only on a version copied from V1 by the retired import (none in V2); its lines are read-only. */
  document?: SharedCvDocument | null;
  factIds: string[];
  opportunityRevisionId: string | null;
  createdAt: string;
}

export interface Resume {
  id: string;
  title: string;
  language: 'en' | 'fr';
  templateId: string;
  createdAt: string;
  currentVersionId: string | null;
  /** Changes on every save from either site; send it back so a stale save is refused, not applied. */
  revision?: number;
}

export interface DocumentCredit {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface ResumeList {
  items: Resume[];
  documentCredit: DocumentCredit;
}

export interface ResumeDetail extends Resume {
  version: ResumeVersion | null;
}

export interface CreatedResume extends Resume {
  version: ResumeVersion;
}

export type WritingType = 'cover_letter' | 'bio' | 'linkedin' | 'outreach';

export interface WritingDocument {
  id: string;
  type: WritingType;
  title: string;
  body: string;
  factIds: string[];
  opportunityRevisionId: string | null;
  confirmation: 'draft' | 'confirmed';
  templateId: string;
  createdAt: string;
  updatedAt: string;
  revision?: number;
}

export interface WritingList {
  items: WritingDocument[];
  documentCredit: DocumentCredit;
}

export interface PaidWriting {
  document: WritingDocument;
  usage: PaidResume['usage'];
  jobId: string;
  replayed: boolean;
}

export interface PaidResume {
  version: ResumeVersion;
  usage: {
    unit: string;
    includedGranted: number;
    includedRemaining: number;
    packRemaining: number;
    packHeld: number;
    renewalDate: string;
    ledgerState: string;
  };
  jobId: string;
  replayed: boolean;
}

export interface ResumeFile {
  contentType: string;
  bytes: Uint8Array;
}

export interface OpportunityCompensation {
  minimum: number | null;
  maximum: number | null;
  currency: string | null;
  period: string | null;
}

export type ModerationStatus = 'unflagged' | 'flagged' | 'under_review' | 'verified' | 'suppressed';

export type ReportReason =
  | 'suspicious_fee'
  | 'misleading'
  | 'expired_closed'
  | 'duplicate'
  | 'scam'
  | 'other';

export type ModerationAction = 'verify' | 'suppress' | 'dismiss';

export type TrustSignalKey =
  | 'verified_employer'
  | 'stale_listing'
  | 'suspicious_fee'
  | 'conflicting_compensation'
  | 'duplicate_sources'
  | 'user_flagged'
  | 'suppressed_listing';

export type SourceConfidence = 'candidate_supplied' | 'provider_record' | 'multiple_sources';

export interface TrustSignal {
  key: TrustSignalKey;
  severity: 'info' | 'warning' | 'alert';
  message: string;
}

export interface ViewerReport {
  reportId: string;
  reason: ReportReason;
  status: 'pending' | 'reviewed';
  reviewAction: ModerationAction | null;
  createdAt: string;
}

export interface TrustSignalSummary {
  moderationStatus: ModerationStatus;
  isVerified: boolean;
  isSuppressed: boolean;
  signals: TrustSignal[];
  reportCount: number;
  sourcesCount: number;
  sourceConfidence: SourceConfidence;
  viewerReport: ViewerReport | null;
}

export interface ReportOpportunityInput {
  reason: ReportReason;
  notes?: string;
}

export interface ModerateOpportunityInput {
  action: ModerationAction;
  notes?: string;
}

export interface ModerationQueueItem {
  opportunityId: string;
  title: string;
  organization: string | null;
  provider: string;
  moderationStatus: ModerationStatus;
  reportCount: number;
  latestReportAt: string;
  latestReasons: ReportReason[];
  reportNotes: string[];
  checkedAt: string;
}

export type PortfolioVisibility = 'draft' | 'private' | 'public';

export interface PortfolioItemView {
  id: string;
  title: string;
  description: string;
  evidenceType: string;
  evidenceLabel: string;
  linkedSkills: string[];
}

export interface PortfolioPage {
  id: string;
  slug: string;
  title: string;
  headline: string;
  displayName: string;
  locale: 'en' | 'fr';
  visibility: PortfolioVisibility;
  showEmail: boolean;
  showPhone: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  evidenceIds: string[];
  shareToken: string | null;
  publishedAt: string | null;
  visitCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPortfolioView {
  slug: string;
  title: string;
  headline: string;
  displayName: string;
  items: PortfolioItemView[];
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface CreatePortfolioInput {
  title: string;
  headline?: string;
  displayName?: string;
  locale?: 'en' | 'fr';
}

export interface UpdatePortfolioInput {
  title?: string;
  headline?: string;
  displayName?: string;
  locale?: 'en' | 'fr';
  evidenceIds?: string[];
  showEmail?: boolean;
  showPhone?: boolean;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export interface PortfolioQr {
  svg: string;
  path: string;
}

export interface OpportunityItem {
  id: string;
  category: string;
  provider: string;
  title: string;
  organization: string | null;
  status: 'open' | 'closed';
  label: 'open' | 'expired';
  sourceUrl: string | null;
  checkedAt: string;
  deadline: string | null;
  locations: string[];
  compensation: OpportunityCompensation;
  sponsorship: 'unknown' | 'stated_yes' | 'stated_no';
  moderationStatus?: ModerationStatus;
}

export interface OpportunityDetail extends OpportunityItem {
  description: string;
  resumeAnalysis: {
    includedRemaining: number;
    packRemaining: number;
    renewalDate: string | null;
  };
  trustSignals?: TrustSignalSummary;
}

export interface MatchResult {
  id: string;
  fit: 'blocked' | 'none' | 'partial' | 'strong';
  overlap: number;
  reasons: Array<{ code: 'confirmed_overlap'; factId: string; token: string }>;
  gaps: Array<{ code: 'not_in_facts'; token: string }>;
  unknowns: Array<{ code: 'pay' | 'sponsorship' | 'location' | 'unconfirmed'; factId?: string; token?: string }>;
  profileVersion: number;
  opportunityId: string;
  opportunityRevisionId: string;
  resumeVersionId: string;
  createdAt: string;
}

export interface PaidMatch {
  match: MatchResult;
  usage: {
    unit: string;
    includedGranted: number;
    includedRemaining: number;
    packRemaining: number;
    packHeld: number;
    renewalDate: string;
    ledgerState: string;
  };
  jobId: string | null;
  replayed: boolean;
}

export interface AiJob {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  state: string;
}

export interface SavedSearch {
  id: string;
  q: string | null;
  category: string | null;
  locationProfileId: string | null;
  radiusMiles: number | null;
  schedule: 'weekly' | 'daily' | 'every_6_hours' | 'hourly';
  paused: boolean;
}

export interface AlertSettings {
  email: boolean;
  push: boolean;
  telegram: boolean;
  digest: 'weekly' | 'daily' | 'immediate';
  quietStart: string | null;
  quietEnd: string | null;
  paused: boolean;
}

export interface AlertItem {
  id: string;
  opportunityId: string;
  title: string;
  organization: string | null;
  revisionId: string;
  reason: { code: 'saved_search' | 'followed_company' | 'material_update'; fit: 'blocked' | 'none' | 'partial' | 'strong' | null };
  createdAt: string;
}

export interface AlertList {
  items: AlertItem[];
  alertItem: { includedRemaining: number; packRemaining: number; renewalDate: string | null };
  settings: AlertSettings;
}

export type ApplicationStatus = 'saved' | 'preparing' | 'applied' | 'interviewing' | 'offered' | 'rejected' | 'withdrawn';

export interface ApplicationItem {
  id: string;
  opportunityId: string;
  opportunityRevisionId: string;
  resumeVersionId: string | null;
  letterId: string | null;
  status: ApplicationStatus;
  contacts: Array<{ name: string; email: string | null; phone: string | null }>;
  notes: string;
  dates: { deadline: string | null; applied: string | null; interview: string | null };
  checklist: Array<{ label: string; done: boolean }>;
  snapshot: {
    title: string;
    organization: string | null;
    sourceUrl: string | null;
    description: string;
    checkedAt: string;
    provider: string;
    revisionId: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type InterviewStage = 'recruiter' | 'behavioral' | 'technical' | 'panel' | 'presentation';

export interface InterviewFeedback {
  relevance: 'grounded' | 'partial' | 'missing';
  structure: 'clear' | 'thin';
  specificity: 'specific' | 'general';
  evidence: 'cited' | 'unstated';
}

export interface InterviewSession {
  id: string;
  opportunityId: string;
  opportunityRevisionId: string;
  stage: InterviewStage;
  title: string;
  questions: Array<{ index: number; factId: string; prompt: string }>;
  answers: Array<{ id: string; index: number; answer: string; feedback: InterviewFeedback; challenge: string | null }>;
  summary: string;
  createdAt: string;
}

export interface InterviewList {
  items: InterviewSession[];
  textInterview: { includedRemaining: number; packRemaining: number; renewalDate: string | null };
}

export interface PaidInterview {
  session: InterviewSession;
  usage: {
    unit: string;
    includedRemaining: number;
    packRemaining: number;
    renewalDate: string;
    ledgerState: string;
  };
  jobId: string;
  replayed: boolean;
}

export interface VoiceRecording {
  id: string;
  durationSeconds: number;
  requestedSeconds: number;
  truncated: boolean;
  transcript: string;
  feedback: InterviewFeedback;
  audioDeleted: boolean;
}

export interface VoiceSession {
  id: string;
  kind: 'practice' | 'negotiation';
  title: string;
  prompt: string;
  guidance: string | null;
  summary: string;
  opportunityId: string | null;
  stage: InterviewStage | null;
  recording: VoiceRecording | null;
  createdAt: string;
}

export interface VoiceList {
  items: VoiceSession[];
  consent: boolean;
  remainingSeconds: number;
  planIncludesVoice: boolean;
  renewalDate: string | null;
}

export interface VoiceRecordResult {
  session: VoiceSession;
  billedSeconds: number;
  truncated: boolean;
  remainingSeconds: number;
  replayed: boolean;
}

export interface BillingAccount {
  planId: string;
  legacyPlan: string | null;
  interval: 'monthly' | 'annual';
  status: string;
  periodEnd: string | null;
  renewalDate: string;
  provider: string | null;
  cancelAtPeriodEnd: boolean;
  storageGraceUntil: string | null;
  trialEnd: string | null;
  price: { amountCents: number; currency: string } | null;
  spendingCapCents: number | null;
  autoTopup: boolean;
}

export interface UsagePack {
  id: string;
  addonId: string;
  unit: string;
  remainingUnits: number;
  purchasedUnits: number;
  expiresAt: string;
  state: string;
  requiredPlan: string | null;
}

export interface UsageSummary {
  renewalDate: string;
  units: Array<{ unit: string; includedGranted: number; includedRemaining: number; packRemaining: number; packHeld: number }>;
  packs: UsagePack[];
}

export interface SavedEstimate {
  id: string;
  expiresAt: string;
  catalogVersion: string;
  planId: string;
  interval: 'monthly' | 'annual';
  tax: 'excluded';
  dueNowCents: number;
  baseCents: number;
  lines: Array<{ id: string; quantity: number; lineCents: number }>;
}

export interface CheckoutResult {
  provider: 'stripe' | 'apple' | 'google';
  url?: string;
  sessionId?: string;
  trialDays?: number | null;
  productId?: string;
  accountToken?: string;
}

export interface AccountExport {
  id: string;
  status: 'queued' | 'ready' | 'failed';
  url?: string;
  expiresAt?: string;
}

export interface AccountDeletion {
  deleted: true;
  storeSubscription?: { provider: 'apple' | 'google'; cancelUrl: string };
}

export interface AdminCatalogVersion {
  version: string;
  publishedAt: string;
}

export interface AdminFlagView {
  feature: string;
  enabled: boolean;
  source: 'flag' | 'phase';
}

export interface AdminProviderHealth {
  name: string;
  status: string;
}

export interface AdminAuditEntry {
  id: string;
  actorAuthUserId: string;
  action: string;
  target: string;
  createdAt: string;
}

export interface StarStory {
  id: string;
  factIds: string[];
  situation: string;
  task: string;
  action: string;
  result: string;
  createdAt: string;
}

export type {
  CareerEvidence,
  CreateEvidenceInput,
  EvidenceLabel,
  EvidenceType,
  UpdateEvidenceInput,
} from '@flacroncv/career-shared';

export interface EvidenceList {
  items: import('@flacroncv/career-shared').CareerEvidence[];
}

export type {
  ActionPack,
  ActionPackChecklistItem,
  ActionPackFit,
  ActionPackLetter,
  ActionPackProfileFactSnapshot,
  ActionPackResume,
  ActionPackVacancySnapshot,
  CreateActionPackInput,
} from '@flacroncv/career-shared';

export interface ActionPackBalanceView {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface ActionPackList {
  items: import('@flacroncv/career-shared').ActionPack[];
  actionPack: ActionPackBalanceView;
}

export interface PaidActionPack {
  actionPack: import('@flacroncv/career-shared').ActionPack;
  usage: {
    unit: string;
    includedRemaining: number;
    packRemaining: number;
    renewalDate: string;
    ledgerState: string;
  };
  jobId: string;
  replayed: boolean;
}

export interface SkillReportBalanceView {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface SkillReportList {
  items: import('@flacroncv/career-shared').SkillGapReport[];
  skillReport: SkillReportBalanceView;
}

export interface PaidSkillReport {
  report: import('@flacroncv/career-shared').SkillGapReport;
  usage: {
    unit: string;
    includedRemaining: number;
    packRemaining: number;
    renewalDate: string;
    ledgerState: string;
  };
  jobId: string;
  replayed: boolean;
}

export type SkillGapReport = import('@flacroncv/career-shared').SkillGapReport;
export type SkillGapItem = import('@flacroncv/career-shared').SkillGapItem;
export type LearningPlanMilestone = import('@flacroncv/career-shared').LearningPlanMilestone;
export type ProjectBrief = import('@flacroncv/career-shared').ProjectBrief;
export type ProjectRubricCriterion = import('@flacroncv/career-shared').ProjectRubricCriterion;

export interface LocationProfileList {
  items: import('@flacroncv/career-shared').LocationProfile[];
  capacity: number;
  allowedRadiusMiles: number;
}

export type LocationProfile = import('@flacroncv/career-shared').LocationProfile;
export type CreateLocationProfileInput = import('@flacroncv/career-shared').CreateLocationProfileInput;
export type UpdateLocationProfileInput = import('@flacroncv/career-shared').UpdateLocationProfileInput;
export type TargetTimeline = import('@flacroncv/career-shared').TargetTimeline;
export type WorkAuthorization = import('@flacroncv/career-shared').WorkAuthorization;
export type RemoteFlexibility = import('@flacroncv/career-shared').RemoteFlexibility;
export type SpecialistMode = import('@flacroncv/career-shared').SpecialistMode;
export type CandidateSpecialistMode = import('@flacroncv/career-shared').CandidateSpecialistMode;
export type UpdateSpecialistModeInput = import('@flacroncv/career-shared').UpdateSpecialistModeInput;

export interface ScopeUsage {
  unit: string;
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string;
  ledgerState: string;
}

export interface PaidScope<T> {
  result: T;
  usage: ScopeUsage;
  jobId: string;
  replayed: boolean;
}

export interface ScenarioOptionView {
  name: string;
  costCents: number | null;
  months: number | null;
  destination: string;
  wageCents: number | null;
  wageLabel: 'user_supplied' | 'unknown';
  source: 'user' | 'estimate';
}

export interface ScenarioResult {
  id: string;
  options: ScenarioOptionView[];
  tradeoff: string;
}

export interface LearningLoopView {
  sampleSize: number;
  recordedApplications: number;
  unrecorded: number;
  noResponse: number;
  interviews: number;
  offers: number;
  interviewRatePercent: number | null;
  statement: string;
  suggestion: string | null;
  level: string;
}

export interface FormSession {
  id: string;
  site: string;
  externalSubmitted: false;
  reviewed: boolean;
}

export interface FormReview {
  id: string;
  externalSubmitted: false;
  message: string;
}

export interface FormFill {
  site: string;
  submit: false;
  extension: 'unpacked_local';
  distribution: 'unpublished';
  fields: Record<string, string>;
  message: string;
}

export interface SalesInquiryResult {
  id: string;
  delivered: boolean;
}

export interface MaintenanceView {
  achievements: Array<{ id: string; title: string }>;
  promotionGoals: Array<{ id: string; desiredTitle: string }>;
  credentials: Array<{ id: string; name: string; expiresOn: string; due: boolean }>;
}

export interface MapList {
  items: Array<{ id: string; title: string; approximate: true; coordinates: null }>;
  tiles: null;
  attribution: null;
  provider: null;
}

export interface MapSessionResult {
  id: string;
  minutes: number;
  approximate: true;
  tiles: null;
  coordinates: null;
  attribution: null;
  provider: null;
}

export interface HumanServiceList {
  items: Array<{ id: string; name: string; scope: string; priceCents: null; bookingOpen: false; note: string }>;
}

export interface RecruitingSearch {
  items: Array<{ candidateAuthUserId: string; label: string }>;
}

export interface DeveloperKey {
  id: string;
  token: string;
  prefix: string;
}

export interface WhiteLabelConfig {
  brandName: string;
  attribution: string;
}





/**
 * V1 integration: whether the caller may use the career area, from their V1
 * plan through the configured map. `features` are the operator switches.
 */
export interface CareerAccessView {
  enabled: boolean;
  v1Plan: string | null;
  careerPlan?: string;
  reason?: 'plan_not_mapped' | 'v1_account_missing' | 'v1_account_inactive';
  features: Record<string, boolean>;
}
