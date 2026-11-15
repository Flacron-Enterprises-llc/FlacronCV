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

export type WritingType = 'cover_letter' | 'bio' | 'linkedin' | 'outreach' | 'referral_request' | 'thank_you';

/**
 * The person's own words about the target when there is no saved listing
 * (e.g. a job-tracker application). Drafts may repeat these, never add to them.
 */
export interface WritingContextInput {
  organization?: string;
  role?: string;
  contactName?: string;
  contactRole?: string;
  /** YYYY-MM-DD; used by thank-you notes only. */
  interviewDate?: string;
}

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
  /** False until a writing model is connected; generation is refused without charging. */
  textModelConfigured: boolean;
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
  caseStudy: string;
}

export type PortfolioSections = import('@flacroncv/career-shared').PortfolioSections;

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
  sections: PortfolioSections;
  caseStudies: Record<string, string>;
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
  skills: string[];
  sections: PortfolioSections;
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
  sections?: Partial<PortfolioSections>;
  caseStudies?: Record<string, string>;
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
  /** Last check older than the stale threshold. */
  stale?: boolean;
  publishedAt?: string | null;
  deadline: string | null;
  locations: string[];
  compensation: OpportunityCompensation;
  sponsorship: 'unknown' | 'stated_yes' | 'stated_no';
  /** The listing's own words limiting where a remote worker may live; null when not stated. */
  remoteRestriction?: string | null;
  schedule?: import('@flacroncv/career-shared').ListingSchedule | null;
  arrangement?: import('@flacroncv/career-shared').ListingArrangement | null;
  seniority?: import('@flacroncv/career-shared').ListingSeniority | null;
  details?: import('@flacroncv/career-shared').ListingDetails;
  moderationStatus?: ModerationStatus;
  saved?: boolean;
}

export interface OpportunityDetail extends OpportunityItem {
  description: string;
  revisionId?: string;
  resumeAnalysis: {
    includedRemaining: number;
    packRemaining: number;
    renewalDate: string | null;
  };
  trustSignals?: TrustSignalSummary;
}

export interface OpportunitySearchQuery {
  q?: string;
  role?: string;
  category?: string;
  status?: string;
  includeExpired?: boolean;
  payStated?: boolean;
  minPay?: number;
  payCurrency?: string;
  payPeriod?: string;
  schedule?: string;
  seniority?: string;
  place?: string;
  radiusMiles?: number;
  remote?: 'restricted' | 'unrestricted';
  postedWithinDays?: number;
  deadlineBefore?: string;
  followedOnly?: boolean;
  provider?: string;
}

export interface OpportunitySearchResult {
  items: OpportunityItem[];
  /** Filters the search could not apply and why; never dropped silently. */
  notApplied?: Array<{ filter: 'radiusMiles' | 'followedOnly'; reason: 'no_place' | 'geocoding_unavailable' | 'no_followed_companies' | 'place_not_found' }>;
}

export interface PasteOpportunityInput {
  text: string;
  sourceUrl?: string;
  category?: string;
  deadline?: string;
  publishedAt?: string;
  remoteRestriction?: string;
  details?: Partial<Record<import('@flacroncv/career-shared').ListingDetailField, string | null>>;
}

export interface MatchResult {
  id: string;
  fit: 'blocked' | 'none' | 'partial' | 'strong';
  overlap: number;
  reasons: Array<{ code: 'confirmed_overlap' | 'credential_held'; factId: string; token: string }>;
  gaps: Array<{ code: 'not_in_facts' | 'credential_missing'; token: string }>;
  unknowns: Array<{ code: 'pay' | 'sponsorship' | 'location' | 'unconfirmed'; factId?: string; token?: string }>;
  /** Personal preferences against the listing, separate from qualification fit. Absent on older comparisons. */
  preferenceFit?: import('@flacroncv/career-shared').PreferenceCheck[];
  label?: import('@flacroncv/career-shared').MatchLabel;
  labelReasons?: import('@flacroncv/career-shared').MatchLabelReason[];
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

export interface SavedSearchFilters {
  minPay: number | null;
  payCurrency: string | null;
  payPeriod: string | null;
  workSchedule: string | null;
  seniority: string | null;
  arrangement: string | null;
  relevance: 'any' | 'possible_fit' | 'strong_fit';
}

export interface SavedSearch {
  id: string;
  q: string | null;
  category: string | null;
  locationProfileId: string | null;
  radiusMiles: number | null;
  schedule: 'weekly' | 'daily' | 'every_6_hours' | 'hourly';
  paused: boolean;
  filters?: SavedSearchFilters;
  /** Stored filters the current plan does not apply (after a downgrade). */
  inactiveFilters?: Array<keyof SavedSearchFilters>;
  locationMode?: 'radius_or_name' | 'name' | null;
}

export type SavedSearchInput = {
  q?: string;
  category?: string;
  schedule?: SavedSearch['schedule'];
  locationProfileId?: string;
  radiusMiles?: number;
} & Partial<{ [K in keyof SavedSearchFilters]: SavedSearchFilters[K] | null }>;

/** A place a saved search can be limited to (alerts; distinct from career-mode relocation profiles). */
export interface AlertLocation {
  id: string;
  place: string;
  radiusMiles: number;
  hasCoordinates?: boolean;
  geocodedLabel?: string | null;
}

export interface FollowedCompany {
  id: string;
  name: string;
  sourceUrl: string | null;
  aliases?: string[];
  roles?: string[];
  locations?: string[];
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

export interface AlertDelivery {
  channel: 'email' | 'push' | 'telegram';
  status: 'held' | 'pending' | 'sending' | 'sent' | 'uncertain' | 'failed';
  lastError: string | null;
}

export interface AlertItem {
  id: string;
  opportunityId: string;
  title: string;
  organization: string | null;
  revisionId: string;
  reason: {
    code: 'saved_search' | 'followed_company' | 'material_update';
    fit: 'blocked' | 'none' | 'partial' | 'strong' | null;
    tier?: import('@flacroncv/career-shared').AlertTier;
    searchId?: string | null;
    searchLabel?: string | null;
    companyId?: string | null;
    companyName?: string | null;
    label?: import('@flacroncv/career-shared').MatchLabel | null;
    labelReasons?: import('@flacroncv/career-shared').MatchLabelReason[];
    gaps?: string[];
    advanced?: { targetRole: string | null; promotionGoal: string | null; learningPlanId: string | null; actionPackId: string | null } | null;
  };
  basic?: {
    provider: string;
    category: string;
    locations: string[];
    sourceUrl: string | null;
    checkedAt: string;
    compensation: OpportunityCompensation;
    deadline: string | null;
  };
  read?: boolean;
  deliveries?: AlertDelivery[];
  createdAt: string;
}

export interface AlertList {
  items: AlertItem[];
  unread?: number;
  alertItem: { includedRemaining: number; packRemaining: number; renewalDate: string | null };
  settings: AlertSettings;
  /** Whether each channel has a provider; "not_connected" means nothing can leave yet. */
  channels?: Record<'email' | 'push' | 'telegram', 'connected' | 'not_connected'>;
  tier?: import('@flacroncv/career-shared').AlertTier;
}

export interface CareerReminder {
  id: string;
  kind: import('@flacroncv/career-shared').ReminderKind;
  title: string;
  dueDate: string;
  link: string | null;
  read: boolean;
  createdAt: string;
  deliveries: AlertDelivery[];
}

export interface ReminderList {
  upcoming: CareerReminder[];
  history: CareerReminder[];
  unread: number;
}

export interface TrackerReminderInput {
  kind: 'application_follow_up' | 'interview';
  sourceKey: string;
  title: string;
  dueDate: string;
  link?: string | null;
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

export interface InterviewReport {
  answered: number;
  total: number;
  complete: boolean;
  dimensions: Array<{
    dimension: keyof InterviewFeedback;
    met: number;
    answered: number;
    verdict: 'strength' | 'gap';
  }>;
  lackingEvidence: number[];
}

export interface InterviewSession {
  id: string;
  /** Null for practice by typed role and stage without a saved listing. */
  opportunityId: string | null;
  opportunityRevisionId: string | null;
  stage: InterviewStage;
  title: string;
  questions: Array<{ index: number; factId: string; prompt: string }>;
  answers: Array<{ id: string; index: number; answer: string; feedback: InterviewFeedback; challenge: string | null }>;
  summary: string;
  /** Absent on a replay of a session created before reports existed. */
  report?: InterviewReport;
  createdAt: string;
}

export interface StartInterviewInput {
  /** A saved listing, or `role` for practice without one. */
  opportunityId?: string;
  role?: string;
  stage: InterviewStage;
  /** 3 to 10; the server uses 10 when omitted. */
  questionCount?: number;
}

export interface StarStoryInput {
  situation: string;
  task: string;
  action: string;
  result: string;
  factIds?: string[];
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

/** Career coach (spec §26): each assistant reply spends one coaching_response. */
export type CoachLocale = 'en' | 'fr' | 'de' | 'es' | 'ar' | 'ur';

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface CoachThreadSummary {
  id: string;
  title: string;
  opportunityId: string | null;
  messageCount: number;
  updatedAt: string;
}

export interface CoachThread extends CoachThreadSummary {
  messages: CoachMessage[];
}

export interface CoachBalance {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface CoachList {
  items: CoachThreadSummary[];
  coaching: CoachBalance;
}

export interface AskCoachInput {
  question: string;
  /** Continue this thread; omit to start a new one. */
  threadId?: string;
  /** Only on a new thread: a saved listing the conversation is about. */
  opportunityId?: string;
  locale?: CoachLocale;
}

export interface PaidCoachReply {
  thread: CoachThread;
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
  /** Where the words came from; 'pending' until typed or transcribed. */
  transcriptSource: 'typed' | 'transcribed' | 'pending';
  /** Null until there is a transcript to judge. */
  feedback: InterviewFeedback | null;
  /** The audio file is still stored and can be played back. */
  audioStored: boolean;
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
  /** False while no speech provider is connected: the person types what they said. */
  transcriptionAvailable: boolean;
}

export interface VoiceRecordResult {
  session: VoiceSession;
  billedSeconds: number;
  truncated: boolean;
  remainingSeconds: number;
  replayed: boolean;
  /** Automatic transcription of the take; it never changes the charge. */
  transcription: 'transcribed' | 'unavailable' | 'failed' | 'not_attempted';
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

export interface UsageUnitRow {
  unit: string;
  /** Included units granted this month (same as `granted`; older name). */
  includedGranted: number;
  includedRemaining: number;
  /** Purchased pack units this plan can spend now. */
  packRemaining: number;
  /** Unexpired pack units this plan cannot spend until it includes the unit again. */
  packHeld: number;
  /** Five-plan usage page fields (career API from 2026-11-14). */
  granted?: number;
  used?: number;
  /** Spendable now: included first, then packs. */
  remaining?: number;
  /** 0–100, or null when the plan includes none of this unit. */
  percentUsed?: number | null;
}

/** An 80 / 95 / 100 percent usage notice not yet shown (spec section 11). */
export interface UsageWarning {
  id: string;
  unit: string;
  threshold: 80 | 95 | 100;
  createdAt: string;
  seenAt: string | null;
}

/** The automatic top-up opt-in. Off by default; on needs explicit consent and a monthly cap. */
export interface UsageTopUp {
  enabled: boolean;
  spendingCapCents: number | null;
  consentAt: string | null;
  spentThisPeriodCents: number;
  /** Preferred pack per unit, e.g. `{ document_credit: 'document_m' }`. */
  addons: Partial<Record<string, string>>;
}

export interface UsageSummary {
  renewalDate: string;
  units: UsageUnitRow[];
  packs: UsagePack[];
  /** The fields below come with the five-plan usage page; older servers omit them. */
  planId?: string;
  /** A lower plan waiting for the renewal (downgrades take effect at renewal). */
  scheduledPlanId?: string | null;
  period?: { start: string; end: string };
  /** Paid plans renew on the billing anniversary, Free on the account anniversary. */
  renewalBasis?: 'billing_anniversary' | 'account_anniversary';
  warnings?: UsageWarning[];
  /** Recurring capacity add-ons, by allowance field (`{ savedSearches: 5 }`). */
  capacityExtras?: Partial<Record<string, number>>;
  /** `graceUntil`: excess files are kept until then (30 days after a downgrade or cancellation). */
  storage?: { usedBytes: number; limitBytes: number | null; excessBytes: number; graceUntil: string | null };
  topUp?: UsageTopUp;
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
  updatedAt?: string;
}

export type {
  CareerEvidence,
  CreateEvidenceInput,
  EvidenceLabel,
  EvidenceType,
  EvidenceVerification,
  RecordVerificationInput,
  UpdateEvidenceInput,
  VerificationMethod,
  VerifiedLabel,
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
  ActionPackComponent,
  ActionPackEdit,
  ActionPackSavedDocuments,
  ActionPackStatus,
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
  /** `status: 'partial'` means a component failed and the credit is held (`ledgerState: 'reserved'`) for a free retry. */
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
export type RubricCheckInput = import('@flacroncv/career-shared').RubricCheckInput;
export type RubricSelfCheck = import('@flacroncv/career-shared').RubricSelfCheck;
export type BridgeRole = import('@flacroncv/career-shared').BridgeRole;
export type TransferableSkill = import('@flacroncv/career-shared').TransferableSkill;

/** `created` is false when the vault item already existed and was returned instead of duplicated. */
export interface LearningEvidenceResult {
  evidenceId: string;
  created: boolean;
}

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
/** `available`: whether the plan includes specialist modes (a saved choice is kept after a downgrade). */
export type CandidateSpecialistMode = import('@flacroncv/career-shared').CandidateSpecialistMode & { available?: boolean };
export type LocationKind = import('@flacroncv/career-shared').LocationKind;
export type LicenseTransfer = import('@flacroncv/career-shared').LicenseTransfer;
export type ModeContext = import('@flacroncv/career-shared').ModeContext;
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

export type ScenarioOptionView = import('@flacroncv/career-shared').ScenarioOptionView;
export type ScenarioOptionInput = import('@flacroncv/career-shared').ScenarioOptionInput;

/** A saved comparison; reopened from `GET /scenarios`. */
export interface ScenarioResult {
  id: string;
  title: string;
  options: ScenarioOptionView[];
  tradeoff: string;
  locationProfileIds: string[];
  skillReportIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioList {
  items: ScenarioResult[];
  /** Scenario reports left (plan + packs), or null when the plan has none. */
  remaining: number | null;
}

export interface ScenarioLinks {
  title?: string;
  locationProfileIds?: string[];
  skillReportIds?: string[];
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

export type MaintenanceAchievement = import('@flacroncv/career-shared').MaintenanceAchievement;
export type MaintenancePromotionGoal = import('@flacroncv/career-shared').MaintenancePromotionGoal;
export type MaintenanceCredential = import('@flacroncv/career-shared').MaintenanceCredential;
export type CredentialReminder = import('@flacroncv/career-shared').CredentialReminder;

export interface MaintenanceView {
  achievements: MaintenanceAchievement[];
  promotionGoals: MaintenancePromotionGoal[];
  credentials: MaintenanceCredential[];
  reminders: CredentialReminder[];
}

export interface AchievementInput {
  title?: string;
  details?: string;
  achievedOn?: string | null;
  factId?: string | null;
  evidenceId?: string | null;
}

export interface CredentialInput {
  name?: string;
  expiresOn?: string;
  reviewOn?: string | null;
  issuer?: string;
  region?: string;
  factId?: string | null;
  evidenceId?: string | null;
}

export interface MapList {
  items: Array<{ id: string; title: string; approximate: true; coordinates: null }>;
  tiles: null;
  attribution: null;
  provider: null;
  /** False while no tile provider is configured: the list works, a map session is not offered or charged. */
  available?: boolean;
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

/** Candidates learn how many people opted in, never who. */
export interface RecruitingSearch {
  count: number;
}

export type ApiKeyEnvironment = import('@flacroncv/career-shared').ApiKeyEnvironment;

export interface DeveloperKey {
  id: string;
  /** Shown once. Starts with `flc_test_` or `flc_live_`. */
  token: string;
  prefix: string;
  environment: ApiKeyEnvironment;
}

export interface ApiKeyView {
  id: string;
  prefix: string;
  environment: ApiKeyEnvironment;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface WhiteLabelConfig {
  brandName: string;
  attribution: string;
}

/** Which Developer actions this account can use, and its saved brand. */
export interface DeveloperStatus {
  apiPackage: boolean;
  whiteLabel: boolean;
  brand: WhiteLabelConfig | null;
  keys?: ApiKeyView[];
  rateLimits?: Record<ApiKeyEnvironment, number>;
}

export type BusinessRole = import('@flacroncv/career-shared').BusinessRole;
export type BusinessStaffRole = import('@flacroncv/career-shared').BusinessStaffRole;
export type BusinessScope = import('@flacroncv/career-shared').BusinessScope;
export type BusinessCandidateStatus = import('@flacroncv/career-shared').BusinessCandidateStatus;

export interface BusinessStaffView {
  id: string;
  role: BusinessStaffRole;
  status: 'invited' | 'active' | 'expired' | 'revoked';
  email: string | null;
  authUserId: string | null;
  expiresAt: string | null;
  assignedCandidateIds: string[];
}

export interface BusinessCandidateView {
  id: string;
  email: string;
  status: BusinessCandidateStatus;
  inviteState: 'pending' | 'expired' | 'revoked' | 'accepted' | 'none';
  shareProfile: boolean;
  expiresAt: string | null;
  counselorIds: string[];
}

export interface BusinessOverview {
  workspaceId: string;
  role: BusinessRole;
  scope: BusinessScope;
  staff: BusinessStaffView[];
  candidates: BusinessCandidateView[];
  capacity: { staffSeats: number | null; staffUsed: number; activeCandidates: number | null; candidatesUsed: number };
}

export interface BusinessInvitation {
  id: string;
  /** Website path; join it to the site origin to show a copyable link. */
  invitePath: string;
  expiresAt: string;
  /** False until mail delivery is configured. */
  delivered: boolean;
}

export interface BusinessMemberships {
  ownsWorkspace: boolean;
  ownWorkspaceId: string;
  staffOf: Array<{ workspaceId: string; role: BusinessStaffRole }>;
  candidateOf: Array<{ candidateId: string; workspaceId: string; status: BusinessCandidateStatus; shareProfile: boolean }>;
}

export interface BusinessCandidateDetail {
  id: string;
  email: string;
  status: BusinessCandidateStatus;
  shareProfile: boolean;
  shared: { evidence: Array<{ title: string; evidenceType: string; evidenceLabel: string }>; confirmedFacts: number } | null;
}

export interface BusinessQueueItem {
  id: string;
  title: string;
  url: string | null;
  note: string;
  candidateId: string | null;
  status: 'open' | 'recommended' | 'closed';
  createdAt: string;
}

export interface BusinessUsage {
  units: Array<{ unit: string; granted: number; remaining: number }>;
  seats: BusinessOverview['capacity'];
  invoices: Array<{ sku: string; kind: string; amountCents: number | null; currency: string | null; purchasedAt: string; refunded: boolean }> | null;
}

export interface BusinessReport {
  candidates: Record<BusinessCandidateStatus, number>;
  staff: Record<BusinessStaffRole, number>;
  assignments: number;
  sharingCandidates: number;
  queue: Record<'open' | 'recommended' | 'closed', number>;
}

export interface AdminEvidenceView {
  id: string;
  title: string;
  evidenceType: string;
  evidenceLabel: string;
  verifications: import('@flacroncv/career-shared').EvidenceVerification[];
}

export interface AdminBusinessRow {
  workspaceId: string;
  staff: { manager: number; counselor: number; billing_admin: number };
  pendingStaffInvites: number;
  candidates: { invited: number; active: number; archived: number };
  pendingCandidateInvites: number;
  expiredInvites: number;
}





/**
 * V1 integration: whether the caller may use the career area, from their V1
 * plan through the configured map. `features` are the operator switches.
 */
export interface CareerAccessView {
  enabled: boolean;
  v1Plan: string | null;
  careerPlan?: string;
  /** Where the career plan comes from: the V1 plan map, or a purchased career plan. */
  source?: 'v1_plan_map' | 'purchase';
  reason?: 'plan_not_mapped' | 'v1_account_missing' | 'v1_account_inactive';
  features: Record<string, boolean>;
}
