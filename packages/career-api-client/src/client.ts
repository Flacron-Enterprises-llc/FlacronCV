import type { ActionPack, ActionPackEdit, ActionPackSavedDocuments, CareerPreferences, CreateActionPackInput, CreateSkillReportInput, FactValue, Locale, SkillGapReport } from '@flacroncv/career-shared';
import type {
  AiJob,
  LearningEvidenceResult,
  RubricCheckInput,
  ErrorBody,
  Fact,
  FactList,
  FactRevision,
  ImportAllowance,
  ImportRequest,
  ImportResult,
  LegalState,
  LegalVersions,
  Me,
  NewFact,
  PaidResume,
  Profile,
  ResumeDetail,
  ResumeFile,
  ResumeList,
  ResumeVersion,
  SessionResponse,
  WritingDocument,
  WritingList,
  PaidWriting,
  WritingContextInput,
  WritingType,
  OpportunityDetail,
  OpportunityItem,
  OpportunitySearchQuery,
  OpportunitySearchResult,
  PasteOpportunityInput,
  ReminderList,
  SavedSearchInput,
  TrackerReminderInput,
  PaidMatch,
  MatchResult,
  AlertList,
  AlertLocation,
  AlertSettings,
  FollowedCompany,
  SavedSearch,
  ApplicationItem,
  ApplicationStatus,
  InterviewList,
  InterviewSession,
  InterviewStage,
  PaidInterview,
  AskCoachInput,
  CoachList,
  CoachThread,
  PaidCoachReply,
  StarStory,
  StarStoryInput,
  StartInterviewInput,
  VoiceList,
  VoiceRecordResult,
  VoiceSession,
  DeveloperKey,
  FormFill,
  FormReview,
  SalesInquiryResult,
  FormSession,
  HumanServiceList,
  LearningLoopView,
  MaintenanceView,
  MapList,
  MapSessionResult,
  PaidScope,
  RecruitingSearch,
  ScenarioResult,
  WhiteLabelConfig,
  BusinessOverview,
  DeveloperStatus,
  BillingAccount,
  UsageSummary,
  UsageTopUp,
  CareerAccessView,
  SavedEstimate,
  CheckoutResult,
  AccountExport,
  AccountDeletion,
  AdminAuditEntry,
  AdminCatalogVersion,
  AdminFlagView,
  AdminProviderHealth,
  CareerEvidence,
  CreateEvidenceInput,
  EvidenceList,
  UpdateEvidenceInput,
  ActionPackList,
  PaidActionPack,
  SkillReportList,
  PaidSkillReport,
  LocationProfile,
  LocationProfileList,
  CreateLocationProfileInput,
  UpdateLocationProfileInput,
  CandidateSpecialistMode,
  UpdateSpecialistModeInput,
  ReportOpportunityInput,
  TrustSignalSummary,
  ModerationStatus,
  ModerateOpportunityInput,
  ModerationQueueItem,
  PortfolioPage,
  PublicPortfolioView,
  CreatePortfolioInput,
  UpdatePortfolioInput,
  PortfolioQr,
  ScenarioOptionInput,
  ScenarioLinks,
  ScenarioList,
  CredentialReminder,
  AchievementInput,
  CredentialInput,
  MaintenanceAchievement,
  MaintenancePromotionGoal,
  MaintenanceCredential,
  BusinessMemberships,
  BusinessStaffRole,
  BusinessInvitation,
  BusinessCandidateView,
  BusinessCandidateDetail,
  BusinessQueueItem,
  BusinessUsage,
  BusinessReport,
  ApiKeyEnvironment,
  AdminEvidenceView,
  AdminBusinessRow,
  RecordVerificationInput,
  ModeContext,
} from './types';

/**
 * A refused or failed request. `code` is the contract code
 * (docs/API_CONTRACT.md "Errors"), or `network_error` when no response
 * arrived. `body` carries the contract's extra fields for that code.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: ErrorBody,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  /** Origin of the career API, without its path prefix. */
  baseUrl: string;
  /** The current Firebase ID token, or null when signed out. Called per request so a refreshed token is used. */
  getToken: () => Promise<string | null>;
  fetch?: FetchLike;
}

interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  /** For `POST /session`: the token goes in the body, not the header. */
  anonymous?: boolean;
  /** A file body sent as-is (evidence uploads), with its own type and extra headers. */
  raw?: { body: Blob | Uint8Array; contentType: string; headers?: Record<string, string> };
  /** The revision the caller read, for records shared with V1. */
  ifMatch?: number;
}

/** A fresh key per paid action. Retrying the same action reuses its key. */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

/** Every career route is under this path (beside V1's own `/api/v1`). */
export const CAREER_API_PATH = '/api/career/v1';

export function createApiClient(options: ApiClientOptions) {
  const base = `${options.baseUrl.replace(/\/+$/, '')}${CAREER_API_PATH}`;
  const doFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.raw) Object.assign(headers, opts.raw.headers ?? {}, { 'Content-Type': opts.raw.contentType });
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts.ifMatch !== undefined) headers['If-Match'] = `"${opts.ifMatch}"`;
    if (!opts.anonymous) {
      const token = await options.getToken();
      if (!token) throw new ApiError(401, 'unauthenticated', { code: 'unauthenticated' });
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers,
        body: opts.raw ? (opts.raw.body as BodyInit) : opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch {
      throw new ApiError(0, 'network_error', { code: 'network_error' });
    }

    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!response.ok) {
      const body = isErrorBody(parsed) ? parsed : { code: response.status >= 500 ? 'internal_error' : 'validation_error' };
      throw new ApiError(response.status, body.code, body);
    }
    return parsed as T;
  }

  const id = (value: string) => encodeURIComponent(value);
  /** Acts in a Business workspace where the caller is staff; omitted for the caller's own. */
  const ws = (workspaceId?: string) => (workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : '');

  return {
    session: (idToken: string, locale?: Locale) =>
      request<SessionResponse>('POST', '/session', { body: { idToken, locale }, anonymous: true }),
    logout: (pushToken?: string) =>
      request<{ ok: true }>('POST', '/session/logout', { body: pushToken ? { token: pushToken } : {} }),
    me: () => request<Me>('GET', '/me'),
    setLocale: (locale: Locale) => request<Me>('PATCH', '/me', { body: { locale } }),
    legal: () => request<LegalState>('GET', '/legal-acceptances'),
    acceptLegal: (versions: LegalVersions) =>
      request<LegalState>('POST', '/legal-acceptances', {
        body: {
          termsAccepted: true,
          privacyAccepted: true,
          disclaimerAccepted: true,
          termsVersion: versions.terms,
          privacyVersion: versions.privacy,
          disclaimerVersion: versions.disclaimer,
        },
      }),

    facts: () => request<FactList>('GET', '/facts'),
    fact: (factId: string) => request<Fact>('GET', `/facts/${id(factId)}`),
    factRevisions: (factId: string) => request<{ items: FactRevision[] }>('GET', `/facts/${id(factId)}/revisions`),
    createFact: (fact: NewFact) => request<Fact>('POST', '/facts', { body: fact }),
    updateFact: (factId: string, value: Partial<FactValue>) =>
      request<Fact>('PATCH', `/facts/${id(factId)}`, { body: { value } }),
    confirmFact: (factId: string) => request<Fact>('POST', `/facts/${id(factId)}/confirm`),
    deleteFact: (factId: string) => request<{ ok: true }>('DELETE', `/facts/${id(factId)}`),

    profile: () => request<Profile>('GET', '/profile'),
    setPreferences: (preferences: CareerPreferences) =>
      request<Profile>('PATCH', '/profile/preferences', { body: { preferences } }),

    importAllowance: () => request<ImportAllowance>('GET', '/imports/allowance'),
    importResume: (input: ImportRequest) => request<ImportResult>('POST', '/imports', { body: input }),

    aiJob: (jobId: string) => request<AiJob>('GET', `/ai-jobs/${id(jobId)}`),

    resumes: () => request<ResumeList>('GET', '/resumes'),
    resume: (resumeId: string) => request<ResumeDetail>('GET', `/resumes/${id(resumeId)}`),
    createResume: (input: { title: string; language: 'en' | 'fr'; templateId?: string }) =>
      request<ResumeDetail>('POST', '/resumes', { body: input }),
    resumeVersions: (resumeId: string) => request<{ items: ResumeVersion[] }>('GET', `/resumes/${id(resumeId)}/versions`),
    updateResumeVersion: (
      versionId: string,
      patch: { templateId?: string; confirmation?: 'draft' | 'confirmed'; lines?: Array<{ factId: string; text: string }>; expectedRevision?: number },
    ) => request<ResumeVersion>('PATCH', `/resume-versions/${id(versionId)}`, { body: patch }),
    generateResume: (resumeId: string, instructions: string, idempotencyKey: string) =>
      request<PaidResume>('POST', `/resumes/${id(resumeId)}/generate`, { body: { instructions }, idempotencyKey }),
    tailorResume: (resumeId: string, opportunityId: string, idempotencyKey: string) =>
      request<PaidResume>('POST', `/resumes/${id(resumeId)}/tailor`, { body: { opportunityId }, idempotencyKey }),
    exportResume: (versionId: string, format: 'pdf' | 'docx') => binary(`/resume-versions/${id(versionId)}/export?format=${format}`),
    readability: (versionId: string) =>
      request<{
        versionId: string;
        label: string;
        issues: Array<{ code: string; section?: string; factId?: string }>;
        /** Format checks (career.readability.format_*); older servers omit them. */
        formatIssues?: Array<{ code: string; section?: string; factId?: string }>;
      }>(
        'GET',
        `/resume-versions/${id(versionId)}/readability`,
      ),

    writingDocuments: () => request<WritingList>('GET', '/writing'),
    writingDocument: (documentId: string) => request<WritingDocument>('GET', `/writing/${id(documentId)}`),
    createWriting: (
      input: { type: WritingType; opportunityId: string | null; templateId?: string; context?: WritingContextInput },
      idempotencyKey: string,
    ) => request<PaidWriting>('POST', '/writing', { body: input, idempotencyKey }),
    updateWriting: (
      documentId: string,
      patch: { title?: string; body?: string; confirmation?: 'draft' | 'confirmed'; templateId?: string; expectedRevision?: number },
    ) => request<WritingDocument>('PATCH', `/writing/${id(documentId)}`, { body: patch }),
    exportWriting: (documentId: string, format: 'pdf' | 'docx' | 'txt') =>
      binary(`/writing/${id(documentId)}/export?format=${format}`),

    opportunities: (query: OpportunitySearchQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        // Empty strings and undefined are "no filter"; false is a real value for includeExpired.
        if (value === undefined || value === null || value === '') continue;
        params.set(key, String(value));
      }
      const qs = params.toString();
      return request<OpportunitySearchResult>('GET', `/opportunities${qs.length > 0 ? `?${qs}` : ''}`);
    },
    opportunity: (opportunityId: string) => request<OpportunityDetail>('GET', `/opportunities/${id(opportunityId)}`),
    pasteOpportunity: (input: PasteOpportunityInput) => request<OpportunityDetail>('POST', '/opportunities', { body: input }),
    savedOpportunities: () => request<{ items: OpportunityItem[] }>('GET', '/saved-opportunities'),
    saveOpportunity: (opportunityId: string) =>
      request<{ opportunityId: string; saved: true }>('PUT', `/saved-opportunities/${id(opportunityId)}`),
    unsaveOpportunity: (opportunityId: string) =>
      request<{ opportunityId: string; saved: false }>('DELETE', `/saved-opportunities/${id(opportunityId)}`),
    reportOpportunity: (opportunityId: string, input: ReportOpportunityInput) =>
      request<{ reportId: string; status: 'reported'; reviewStatus: 'pending'; reason: ReportOpportunityInput['reason'] }>(
        'POST',
        `/opportunities/${id(opportunityId)}/report`,
        { body: input },
      ),
    opportunityTrust: (opportunityId: string) =>
      request<TrustSignalSummary>('GET', `/opportunities/${id(opportunityId)}/trust`),
    analysis: (analysisId: string) => request<MatchResult>('GET', `/analyses/${id(analysisId)}`),
    createAnalysis: (input: { resumeVersionId: string; opportunityId: string }, idempotencyKey: string) =>
      request<PaidMatch>('POST', '/analyses', { body: input, idempotencyKey }),
    match: (query: { opportunityId: string; resumeVersionId: string }) => {
      const params = new URLSearchParams({ opportunityId: query.opportunityId, resumeVersionId: query.resumeVersionId });
      return request<{ match: MatchResult | null }>('GET', `/matches?${params.toString()}`);
    },
    createMatch: (
      input: { resumeVersionId: string; opportunityId: string; mode: 'explicit' },
      idempotencyKey: string,
    ) => request<PaidMatch>('POST', '/matches', { body: input, idempotencyKey }),

    alerts: () => request<AlertList>('GET', '/alerts'),
    updateAlertSettings: (patch: Partial<AlertSettings>) => request<AlertSettings>('PATCH', '/alert-settings', { body: patch }),
    savedSearches: () => request<{ items: SavedSearch[] }>('GET', '/saved-searches'),
    markAlertRead: (alertId: string) => request<{ id: string; read: true }>('POST', `/alerts/${id(alertId)}/read`),
    markAllAlertsRead: () => request<{ updated: number }>('POST', '/alerts/read-all'),
    reminders: () => request<ReminderList>('GET', '/reminders'),
    markReminderRead: (reminderId: string) => request<{ id: string; read: true }>('POST', `/reminders/${id(reminderId)}/read`),
    syncTrackerReminders: (items: TrackerReminderInput[]) =>
      request<{ created: number }>('POST', '/reminders/tracker-sync', { body: { items } }),
    createSavedSearch: (input: SavedSearchInput) =>
      request<SavedSearch>('POST', '/saved-searches', { body: input }),
    updateSavedSearch: (
      searchId: string,
      patch: Omit<SavedSearchInput, 'category' | 'locationProfileId' | 'radiusMiles'> & {
        paused?: boolean;
        category?: string | null;
        locationProfileId?: string | null;
        radiusMiles?: number | null;
      },
    ) =>
      request<SavedSearch>('PATCH', `/saved-searches/${id(searchId)}`, { body: patch }),
    deleteSavedSearch: (searchId: string) => request<{ ok: true }>('DELETE', `/saved-searches/${id(searchId)}`),
    alertLocations: () => request<{ items: AlertLocation[] }>('GET', '/location-profiles'),
    createAlertLocation: (input: { place: string; radiusMiles?: number }) =>
      request<AlertLocation>('POST', '/location-profiles', { body: input }),
    updateAlertLocation: (locationId: string, patch: { place?: string; radiusMiles?: number }) =>
      request<AlertLocation>('PATCH', `/location-profiles/${id(locationId)}`, { body: patch }),
    deleteAlertLocation: (locationId: string) => request<{ ok: true }>('DELETE', `/location-profiles/${id(locationId)}`),
    followedCompanies: () => request<{ items: FollowedCompany[] }>('GET', '/followed-companies'),
    followCompany: (input: { name: string; sourceUrl?: string; aliases?: string[]; roles?: string[]; locations?: string[] }) =>
      request<FollowedCompany>('POST', '/followed-companies', { body: input }),
    updateFollowedCompany: (companyId: string, patch: { name?: string; aliases?: string[]; roles?: string[]; locations?: string[] }) =>
      request<FollowedCompany>('PATCH', `/followed-companies/${id(companyId)}`, { body: patch }),
    unfollowCompany: (companyId: string) => request<{ ok: true }>('DELETE', `/followed-companies/${id(companyId)}`),

    applications: () => request<{ items: ApplicationItem[] }>('GET', '/applications'),
    application: (applicationId: string) => request<ApplicationItem>('GET', `/applications/${id(applicationId)}`),
    createApplication: (input: { opportunityId: string; resumeVersionId: string }) =>
      request<ApplicationItem>('POST', '/applications', { body: input }),
    updateApplication: (
      applicationId: string,
      patch: {
        status?: ApplicationStatus;
        notes?: string;
        contacts?: ApplicationItem['contacts'];
        dates?: Partial<ApplicationItem['dates']>;
        checklist?: ApplicationItem['checklist'];
        resumeVersionId?: string;
        letterId?: string;
      },
    ) => request<ApplicationItem>('PATCH', `/applications/${id(applicationId)}`, { body: patch }),
    remindApplication: (applicationId: string, remindAt: string) =>
      request<{ id: string; applicationId: string; remindAt: string; sentAt: string | null }>(
        'POST',
        `/applications/${id(applicationId)}/reminders`,
        { body: { remindAt } },
      ),
    applicationCalendar: (applicationId: string) =>
      request<{ filename: string; body: string }>('GET', `/applications/${id(applicationId)}/calendar`),

    interviews: () => request<InterviewList>('GET', '/interviews/text'),
    interview: (sessionId: string) => request<InterviewSession>('GET', `/interviews/text/${id(sessionId)}`),
    createInterview: (input: StartInterviewInput, idempotencyKey: string) =>
      request<PaidInterview>('POST', '/interviews/text', { body: input, idempotencyKey }),
    answerInterview: (sessionId: string, answer: string) =>
      request<InterviewSession>('POST', `/interviews/text/${id(sessionId)}/answers`, { body: { answer } }),
    challengeInterview: (sessionId: string, answerId: string, note: string) =>
      request<InterviewSession>('POST', `/interviews/text/${id(sessionId)}/challenges`, { body: { answerId, note } }),
    coachThreads: () => request<CoachList>('GET', '/coaching'),
    coachThread: (threadId: string) => request<CoachThread>('GET', `/coaching/${id(threadId)}`),
    askCoach: (input: AskCoachInput, idempotencyKey: string) =>
      request<PaidCoachReply>('POST', '/coaching', { body: input, idempotencyKey }),
    deleteCoachThread: (threadId: string) => request<{ deleted: true }>('DELETE', `/coaching/${id(threadId)}`),
    starStories: () => request<{ items: StarStory[] }>('GET', '/star-stories'),
    createStarStory: (input: StarStoryInput) => request<StarStory>('POST', '/star-stories', { body: input }),
    updateStarStory: (storyId: string, input: StarStoryInput) =>
      request<StarStory>('PATCH', `/star-stories/${id(storyId)}`, { body: input }),
    deleteStarStory: (storyId: string) => request<{ deleted: true }>('DELETE', `/star-stories/${id(storyId)}`),

    voiceInterviews: () => request<VoiceList>('GET', '/interviews/voice'),
    consentVoice: () => request<{ consent: true; version: string }>('POST', '/interviews/voice/consent'),
    /** Withdraws recording consent; new recordings need consent again. */
    withdrawVoiceConsent: () => request<{ consent: false }>('DELETE', '/interviews/voice/consent'),
    /** A practice session needs a saved listing or a role; a negotiation needs the offer the person entered. */
    startVoice: (input: {
      kind: 'practice' | 'negotiation';
      opportunityId?: string;
      role?: string;
      stage?: InterviewStage;
      offer?: string;
      salarySource?: string;
    }) => request<VoiceSession>('POST', '/interviews/voice', { body: input }),
    /**
     * Uploads one recorded take (the MediaRecorder blob). The server measures
     * its length from the file and spends those seconds; transcription, when
     * a provider is connected, is included.
     */
    recordVoice: (sessionId: string, audio: Blob, idempotencyKey: string, language?: 'en' | 'fr') =>
      request<VoiceRecordResult>('POST', `/interviews/voice/${id(sessionId)}/recording`, {
        raw: { body: audio, contentType: audio.type || 'audio/webm', headers: language ? { 'X-Transcription-Language': language } : {} },
        idempotencyKey,
      }),
    /** A five-minute link to play back the caller's own stored take. */
    voiceAudioLink: (sessionId: string) =>
      request<{ url: string; expiresAt: string; contentType: string }>('GET', `/interviews/voice/${id(sessionId)}/audio`),
    correctVoiceTranscript: (sessionId: string, transcript: string) =>
      request<VoiceSession>('PATCH', `/interviews/voice/${id(sessionId)}/transcript`, { body: { transcript } }),
    deleteVoiceAudio: (sessionId: string) => request<VoiceSession>('DELETE', `/interviews/voice/${id(sessionId)}/audio`),

    createScenario: (options: ScenarioOptionInput[], idempotencyKey: string, links: ScenarioLinks = {}) =>
      request<PaidScope<ScenarioResult>>('POST', '/scenarios', { body: { ...links, options }, idempotencyKey }),
    scenarios: () => request<ScenarioList>('GET', '/scenarios'),
    scenario: (scenarioId: string) => request<ScenarioResult>('GET', `/scenarios/${id(scenarioId)}`),
    /** Editing assumptions recomputes from the person's values and is not charged. */
    updateScenario: (scenarioId: string, patch: ScenarioLinks & { options?: ScenarioOptionInput[] }) =>
      request<ScenarioResult>('PATCH', `/scenarios/${id(scenarioId)}`, { body: patch }),
    deleteScenario: (scenarioId: string) => request<{ ok: true }>('DELETE', `/scenarios/${id(scenarioId)}`),
    learningLoop: () => request<LearningLoopView>('GET', '/learning-loop'),
    createForm: (site: string, idempotencyKey: string) =>
      request<PaidScope<FormSession>>('POST', '/forms', { body: { site }, idempotencyKey }),
    reviewForm: (sessionId: string, confirmed: boolean) =>
      request<FormReview>('POST', `/forms/${id(sessionId)}/review`, { body: { confirmed } }),
    fillForm: (sessionId: string) => request<FormFill>('GET', `/forms/${id(sessionId)}/fill`),
    createSalesInquiry: (input: { name: string; email: string; organization: string; message: string }) =>
      request<SalesInquiryResult>('POST', '/sales-inquiries', { body: input, anonymous: true }),
    transcribeVoice: (sessionId: string, input: { language: 'en' | 'fr'; mimeType?: string; byteLength?: number }) =>
      request<{ text: string; provider: string; model: string }>('POST', `/interviews/voice/${id(sessionId)}/transcription`, { body: input }),
    maintenance: () => request<MaintenanceView>('GET', '/maintenance'),
    credentialReminders: () => request<{ items: CredentialReminder[] }>('GET', '/maintenance/reminders'),
    addAchievement: (title: string, more: AchievementInput = {}) =>
      request<MaintenanceAchievement>('POST', '/maintenance/achievements', { body: { ...more, title } }),
    updateAchievement: (achievementId: string, patch: AchievementInput) =>
      request<MaintenanceAchievement>('PATCH', `/maintenance/achievements/${id(achievementId)}`, { body: patch }),
    deleteAchievement: (achievementId: string) => request<{ ok: true }>('DELETE', `/maintenance/achievements/${id(achievementId)}`),
    addPromotionGoal: (desiredTitle: string, targetDate?: string | null) =>
      request<MaintenancePromotionGoal>('POST', '/maintenance/promotion-goals', { body: targetDate === undefined ? { desiredTitle } : { desiredTitle, targetDate } }),
    updatePromotionGoal: (goalId: string, patch: { desiredTitle?: string; targetDate?: string | null; status?: 'open' | 'dropped' }) =>
      request<MaintenancePromotionGoal>('PATCH', `/maintenance/promotion-goals/${id(goalId)}`, { body: patch }),
    deletePromotionGoal: (goalId: string) => request<{ ok: true }>('DELETE', `/maintenance/promotion-goals/${id(goalId)}`),
    /** Only after the person confirms: updates an experience fact's title or adds a confirmed one. */
    confirmPromotion: (goalId: string, input: { experienceFactId?: string | null; company?: string | null; startDate?: string | null }) =>
      request<MaintenancePromotionGoal>('POST', `/maintenance/promotion-goals/${id(goalId)}/confirm`, { body: { ...input, confirmed: true } }),
    addCredential: (name: string, expiresOn: string, more: CredentialInput = {}) =>
      request<MaintenanceCredential>('POST', '/maintenance/credentials', { body: { ...more, name, expiresOn } }),
    updateCredential: (credentialId: string, patch: CredentialInput) =>
      request<MaintenanceCredential>('PATCH', `/maintenance/credentials/${id(credentialId)}`, { body: patch }),
    deleteCredential: (credentialId: string) => request<{ ok: true }>('DELETE', `/maintenance/credentials/${id(credentialId)}`),
    mapOpportunities: () => request<MapList>('GET', '/maps'),
    startMap: (idempotencyKey: string) => request<PaidScope<MapSessionResult>>('POST', '/maps', { idempotencyKey }),
    businessMemberships: () => request<BusinessMemberships>('GET', '/business/memberships'),
    businessOverview: (workspaceId?: string) => request<BusinessOverview>('GET', `/business${ws(workspaceId)}`),
    inviteStaff: (email: string, role: BusinessStaffRole, workspaceId?: string) =>
      request<BusinessInvitation>('POST', `/business/staff${ws(workspaceId)}`, { body: { email, role } }),
    /** Revokes a pending invitation or removes a member at once. */
    removeStaff: (staffId: string, workspaceId?: string) => request<{ ok: true }>('DELETE', `/business/staff/${id(staffId)}${ws(workspaceId)}`),
    inviteCandidate: (email: string, consent: boolean, workspaceId?: string) =>
      request<BusinessInvitation>('POST', `/business/candidates${ws(workspaceId)}`, { body: { email, consent } }),
    revokeCandidateInvite: (candidateId: string, workspaceId?: string) =>
      request<{ ok: true }>('DELETE', `/business/candidates/${id(candidateId)}/invitation${ws(workspaceId)}`),
    setCandidateArchived: (candidateId: string, archived: boolean, workspaceId?: string) =>
      request<BusinessCandidateView>('PUT', `/business/candidates/${id(candidateId)}/archived${ws(workspaceId)}`, { body: { archived } }),
    assignCounselor: (staffId: string, candidateId: string, workspaceId?: string, assigned = true) =>
      request<{ ok: true }>('POST', `/business/assignments${ws(workspaceId)}`, { body: { staffId, candidateId, assigned } }),
    businessCandidate: (candidateId: string, workspaceId?: string) =>
      request<BusinessCandidateDetail>('GET', `/business/candidates/${id(candidateId)}${ws(workspaceId)}`),
    acceptBusinessInvitation: (token: string) =>
      request<{ kind: 'staff' | 'candidate'; workspaceId: string }>('POST', '/business/invitations/accept', { body: { token } }),
    setBusinessShare: (candidateId: string, shareProfile: boolean) =>
      request<{ shareProfile: boolean }>('PUT', `/business/my/${id(candidateId)}/share`, { body: { shareProfile } }),
    leaveBusiness: (candidateId: string) => request<{ ok: true }>('DELETE', `/business/my/${id(candidateId)}`),
    businessQueue: (workspaceId?: string) => request<{ items: BusinessQueueItem[] }>('GET', `/business/queue${ws(workspaceId)}`),
    addBusinessQueueItem: (input: { title: string; url?: string | null; note?: string; candidateId?: string | null }, workspaceId?: string) =>
      request<BusinessQueueItem>('POST', `/business/queue${ws(workspaceId)}`, { body: input }),
    removeBusinessQueueItem: (itemId: string, workspaceId?: string) =>
      request<{ ok: true }>('DELETE', `/business/queue/${id(itemId)}${ws(workspaceId)}`),
    businessUsage: (workspaceId?: string) => request<BusinessUsage>('GET', `/business/usage${ws(workspaceId)}`),
    businessReport: (workspaceId?: string) => request<BusinessReport>('GET', `/business/report${ws(workspaceId)}`),
    humanServices: () => request<HumanServiceList>('GET', '/human-services'),
    bookHumanService: (providerId: string) => request<{ ok: false }>('POST', `/human-services/${id(providerId)}/bookings`),
    recruitingOptIn: () => request<{ discoverable: boolean }>('GET', '/recruiting/opt-in'),
    setRecruitingOptIn: (discoverable: boolean) =>
      request<{ discoverable: boolean }>('POST', '/recruiting/opt-in', { body: { discoverable } }),
    recruitingSearch: () => request<RecruitingSearch>('GET', '/recruiting/search'),
    employerCheckout: () => request<{ ok: false }>('POST', '/recruiting/checkout'),
    developerStatus: () => request<DeveloperStatus>('GET', '/developer'),
    createDeveloperKey: (environment: ApiKeyEnvironment = 'live') => request<DeveloperKey>('POST', '/developer/keys', { body: { environment } }),
    revokeDeveloperKey: (keyId: string) => request<{ ok: true }>('DELETE', `/developer/keys/${id(keyId)}`),
    consumeDeveloperRead: (token: string, workspaceId: string) =>
      request<{ readsRemaining: number }>('POST', '/developer/reads', { body: { token, workspaceId } }),
    setWhiteLabel: (brandName: string, attribution: string) =>
      request<WhiteLabelConfig>('PUT', '/developer/white-label', { body: { brandName, attribution } }),

    evidence: () => request<EvidenceList>('GET', '/evidence'),
    getEvidence: (evidenceId: string) => request<CareerEvidence>('GET', `/evidence/${id(evidenceId)}`),
    createEvidence: (input: CreateEvidenceInput) => request<CareerEvidence>('POST', '/evidence', { body: input }),
    updateEvidence: (evidenceId: string, input: UpdateEvidenceInput) =>
      request<CareerEvidence>('PATCH', `/evidence/${id(evidenceId)}`, { body: input }),
    deleteEvidence: (evidenceId: string) => request<{ ok: true }>('DELETE', `/evidence/${id(evidenceId)}`),
    /** Stores a private file (PDF, PNG, JPEG, DOCX) on an evidence item. Free; checked against storage capacity. */
    uploadEvidenceAttachment: (evidenceId: string, file: Blob, fileName: string) =>
      request<CareerEvidence>('PUT', `/evidence/${id(evidenceId)}/attachment`, {
        raw: { body: file, contentType: file.type, headers: { 'X-File-Name': encodeURIComponent(fileName) } },
      }),
    /** A five-minute download link for the caller's own stored file. */
    evidenceAttachmentLink: (evidenceId: string) =>
      request<{ url: string; expiresAt: string }>('GET', `/evidence/${id(evidenceId)}/attachment`),
    removeEvidenceAttachment: (evidenceId: string) =>
      request<CareerEvidence>('DELETE', `/evidence/${id(evidenceId)}/attachment`),

    actionPacks: () => request<ActionPackList>('GET', '/action-packs'),
    getActionPack: (actionPackId: string) => request<ActionPack>('GET', `/action-packs/${id(actionPackId)}`),
    createActionPack: (input: CreateActionPackInput, idempotencyKey: string) =>
      request<PaidActionPack>('POST', '/action-packs', { body: input, idempotencyKey }),
    updateActionPackChecklist: (actionPackId: string, checklistId: string, done: boolean) =>
      request<ActionPack>('PATCH', `/action-packs/${id(actionPackId)}/checklist/${id(checklistId)}`, { body: { done } }),
    /** Edits any component; never charges. */
    updateActionPack: (actionPackId: string, edit: ActionPackEdit) =>
      request<ActionPack>('PATCH', `/action-packs/${id(actionPackId)}`, { body: edit }),
    /** Retries a failed component under the pack's existing reservation (no new credit). */
    retryActionPackComponent: (actionPackId: string, component: 'coverLetter') =>
      request<PaidActionPack>('POST', `/action-packs/${id(actionPackId)}/retry`, { body: { component } }),
    /** Gives up on an unfinished pack; its held credit is returned. */
    cancelActionPack: (actionPackId: string) =>
      request<{ released: boolean }>('DELETE', `/action-packs/${id(actionPackId)}`),
    saveActionPackDocuments: (actionPackId: string, components?: Array<'tailoredResume' | 'coverLetter'>) =>
      request<{ actionPack: ActionPack; savedDocuments: ActionPackSavedDocuments }>(
        'POST',
        `/action-packs/${id(actionPackId)}/documents`,
        { body: components ? { components } : {} },
      ),
    exportActionPack: (actionPackId: string, component: 'tailoredResume' | 'coverLetter', format: 'pdf' | 'docx') =>
      binary(`/action-packs/${id(actionPackId)}/export?component=${component}&format=${format}`),

    skillReports: () => request<SkillReportList>('GET', '/learning/skill-reports'),
    getSkillReport: (reportId: string) => request<SkillGapReport>('GET', `/learning/skill-reports/${id(reportId)}`),
    createSkillReport: (input: CreateSkillReportInput, idempotencyKey: string) =>
      request<PaidSkillReport>('POST', '/learning/skill-reports', { body: input, idempotencyKey }),
    updateLearningProgress: (reportId: string, milestoneId: string, completed: boolean) =>
      request<SkillGapReport>('PATCH', `/learning/skill-reports/${id(reportId)}/milestones/${id(milestoneId)}`, {
        body: { completed },
      }),
    /** Free. Needs the milestone ticked; a repeat returns the existing vault item. Ownership text is the person's own. */
    convertMilestoneToEvidence: (reportId: string, milestoneId: string, ownershipStatement?: string) =>
      request<LearningEvidenceResult>(
        'POST',
        `/learning/skill-reports/${id(reportId)}/milestones/${id(milestoneId)}/evidence`,
        { body: ownershipStatement === undefined ? {} : { ownershipStatement } },
      ),
    setProjectOwnership: (reportId: string, ownershipStatement: string) =>
      request<SkillGapReport>('PUT', `/learning/skill-reports/${id(reportId)}/project-brief/ownership`, {
        body: { ownershipStatement },
      }),
    addProjectToEvidence: (reportId: string) =>
      request<LearningEvidenceResult>('POST', `/learning/skill-reports/${id(reportId)}/project-brief/evidence`),
    saveRubricCheck: (reportId: string, input: RubricCheckInput) =>
      request<SkillGapReport>('PUT', `/learning/skill-reports/${id(reportId)}/project-brief/rubric-check`, { body: input }),

    locations: () => request<LocationProfileList>('GET', '/career-modes/locations'),
    location: (locationId: string) => request<LocationProfile>('GET', `/career-modes/locations/${id(locationId)}`),
    createLocation: (input: CreateLocationProfileInput) =>
      request<LocationProfile>('POST', '/career-modes/locations', { body: input }),
    updateLocation: (locationId: string, patch: UpdateLocationProfileInput) =>
      request<LocationProfile>('PATCH', `/career-modes/locations/${id(locationId)}`, { body: patch }),
    deleteLocation: (locationId: string) => request<{ success: true }>('DELETE', `/career-modes/locations/${id(locationId)}`),
    specialistMode: () => request<CandidateSpecialistMode>('GET', '/career-modes/specialist-mode'),
    modeContext: () => request<ModeContext>('GET', '/career-modes/context'),
    setSpecialistMode: (input: UpdateSpecialistModeInput) =>
      request<CandidateSpecialistMode>('PUT', '/career-modes/specialist-mode', { body: input }),

    portfolios: () => request<{ items: PortfolioPage[] }>('GET', '/portfolios'),
    portfolio: (portfolioId: string) => request<PortfolioPage>('GET', `/portfolios/${id(portfolioId)}`),
    createPortfolio: (input: CreatePortfolioInput) => request<PortfolioPage>('POST', '/portfolios', { body: input }),
    deletePortfolio: (portfolioId: string) => request<{ ok: true }>('DELETE', `/portfolios/${id(portfolioId)}`),
    updatePortfolio: (portfolioId: string, input: UpdatePortfolioInput) =>
      request<PortfolioPage>('PATCH', `/portfolios/${id(portfolioId)}`, { body: input }),
    publishPortfolio: (portfolioId: string, visibility: 'public' | 'private') =>
      request<PortfolioPage>('POST', `/portfolios/${id(portfolioId)}/publish`, { body: { visibility } }),
    unpublishPortfolio: (portfolioId: string) =>
      request<PortfolioPage>('POST', `/portfolios/${id(portfolioId)}/unpublish`, { body: {} }),
    revokePortfolio: (portfolioId: string) =>
      request<PortfolioPage>('POST', `/portfolios/${id(portfolioId)}/revoke`, { body: {} }),
    portfolioQr: (portfolioId: string, origin: string) =>
      request<PortfolioQr>('GET', `/portfolios/${id(portfolioId)}/qr?origin=${encodeURIComponent(origin)}`),
    publicPortfolio: (slug: string, token?: string) => {
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      return request<PublicPortfolioView>('GET', `/portfolios/public/${id(slug)}${qs}`, { anonymous: true });
    },

    billing: () => request<BillingAccount>('GET', '/billing'),
    /** V1 integration: creates no career rows. */
    access: () => request<CareerAccessView>('GET', '/access'),
    usage: () => request<UsageSummary>('GET', '/usage'),
    /** Hides 80/95/100 percent notices once shown. Without ids: every unseen notice of this month. */
    markUsageWarningsSeen: (ids?: string[]) =>
      request<{ marked: number }>('POST', '/usage/warnings/seen', { body: ids ? { ids } : {} }),
    /** Monthly ceiling for automatic top-ups. `null` removes it and turns top-ups off. Charges nothing. */
    setSpendingCap: (spendingCapCents: number | null) =>
      request<UsageTopUp>('PATCH', '/billing/spending-cap', { body: { spendingCapCents } }),
    /** Opt in or out of automatic top-ups. Turning on needs `consent: true` from the person and a spending cap. */
    setTopUp: (input: { enabled: boolean; consent?: boolean; addons?: Partial<Record<string, string>> }) =>
      request<UsageTopUp>('PATCH', '/billing/top-up', { body: input }),
    createEstimate: (input: { planId: string; interval: 'monthly' | 'annual' }) =>
      request<SavedEstimate>('POST', '/estimates', { body: input }),
    checkout: (
      input: { planId: string; interval: 'monthly' | 'annual'; provider: 'stripe' | 'apple' | 'google'; estimateId: string },
      idempotencyKey: string,
    ) => request<CheckoutResult>('POST', '/checkout', { body: input, idempotencyKey }),

    createExport: (scope: 'personal' | 'workspace') =>
      request<{ id: string; status: 'queued' }>('POST', '/exports', { body: { scope } }),
    accountExport: (exportId: string) => request<AccountExport>('GET', `/exports/${id(exportId)}`),
    deleteAccount: (input: { idToken: string; confirm: string }) =>
      request<AccountDeletion>('POST', '/account/delete', { body: input }),

    adminCatalog: () => request<{ items: AdminCatalogVersion[] }>('GET', '/admin/catalog'),
    publishAdminCatalog: () => request<{ result: 'inserted' | 'unchanged' }>('POST', '/admin/catalog', { body: {} }),
    adminFlags: () => request<{ items: AdminFlagView[] }>('GET', '/admin/flags'),
    setAdminFlag: (feature: string, enabled: boolean) =>
      request<{ items: AdminFlagView[] }>('PATCH', '/admin/flags', { body: { feature, enabled } }),
    adminHealth: () => request<{ providers: AdminProviderHealth[] }>('GET', '/admin/health'),
    adminAudit: () => request<{ items: AdminAuditEntry[] }>('GET', '/admin/audit'),
    adminEvidence: (evidenceId: string) => request<AdminEvidenceView>('GET', `/admin/evidence/${id(evidenceId)}`),
    recordEvidenceVerification: (evidenceId: string, input: RecordVerificationInput) =>
      request<AdminEvidenceView>('POST', `/admin/evidence/${id(evidenceId)}/verifications`, { body: input }),
    revokeEvidenceVerification: (verificationId: string, reason: string) =>
      request<AdminEvidenceView>('POST', `/admin/evidence/verifications/${id(verificationId)}/revoke`, { body: { reason } }),
    adminBusiness: () => request<{ items: AdminBusinessRow[] }>('GET', '/admin/business'),
    adminRecruitingOptIns: () =>
      request<{ count: number; items: Array<{ candidateAuthUserId: string; updatedAt: string }> }>('GET', '/admin/recruiting/opt-ins'),
    adminModerationQueue: (query: { status?: ModerationStatus } = {}) => {
      const qs = query.status ? `?status=${encodeURIComponent(query.status)}` : '';
      return request<{ items: ModerationQueueItem[] }>('GET', `/admin/moderation/opportunities${qs}`);
    },
    adminModerateOpportunity: (opportunityId: string, input: ModerateOpportunityInput) =>
      request<{ opportunityId: string; moderationStatus: ModerationStatus }>(
        'POST',
        `/admin/moderation/opportunities/${id(opportunityId)}/action`,
        { body: input },
      ),
  };

  async function binary(path: string): Promise<ResumeFile> {
    const token = await options.getToken();
    if (!token) throw new ApiError(401, 'unauthenticated', { code: 'unauthenticated' });
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new ApiError(0, 'network_error', { code: 'network_error' });
    }
    if (!response.ok) {
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      const body = isErrorBody(parsed) ? parsed : { code: response.status >= 500 ? 'internal_error' : 'validation_error' };
      throw new ApiError(response.status, body.code, body);
    }
    return {
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;

function isErrorBody(value: unknown): value is ErrorBody {
  return typeof value === 'object' && value !== null && typeof (value as { code?: unknown }).code === 'string';
}

/** `{ field, reason }` pairs from a `validation_error`, for marking form fields. */
export function fieldErrors(error: unknown): Array<{ field: string; reason: string }> {
  if (!isApiError(error, 'validation_error')) return [];
  const list = error.body.errors;
  if (Array.isArray(list)) {
    return list.filter(
      (e): e is { field: string; reason: string } =>
        typeof e === 'object' && e !== null && typeof e.field === 'string' && typeof e.reason === 'string',
    );
  }
  const { field, reason } = error.body;
  return typeof field === 'string' ? [{ field, reason: typeof reason === 'string' ? reason : 'invalid' }] : [];
}
