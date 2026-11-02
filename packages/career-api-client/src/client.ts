import type { ActionPack, CareerPreferences, CreateActionPackInput, CreateSkillReportInput, FactValue, Locale, SkillGapReport } from '@flacroncv/career-shared';
import type {
  AiJob,
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
  WritingType,
  OpportunityDetail,
  OpportunityItem,
  PaidMatch,
  MatchResult,
  AlertList,
  AlertSettings,
  SavedSearch,
  ApplicationItem,
  ApplicationStatus,
  InterviewList,
  InterviewSession,
  InterviewStage,
  PaidInterview,
  StarStory,
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
  BillingAccount,
  UsageSummary,
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
      request<{ versionId: string; label: string; issues: Array<{ code: string; section?: string; factId?: string }> }>(
        'GET',
        `/resume-versions/${id(versionId)}/readability`,
      ),

    writingDocuments: () => request<WritingList>('GET', '/writing'),
    writingDocument: (documentId: string) => request<WritingDocument>('GET', `/writing/${id(documentId)}`),
    createWriting: (
      input: { type: WritingType; opportunityId: string | null; templateId?: string },
      idempotencyKey: string,
    ) => request<PaidWriting>('POST', '/writing', { body: input, idempotencyKey }),
    updateWriting: (
      documentId: string,
      patch: { title?: string; body?: string; confirmation?: 'draft' | 'confirmed'; templateId?: string; expectedRevision?: number },
    ) => request<WritingDocument>('PATCH', `/writing/${id(documentId)}`, { body: patch }),
    exportWriting: (documentId: string, format: 'pdf' | 'docx' | 'txt') =>
      binary(`/writing/${id(documentId)}/export?format=${format}`),

    opportunities: (query: { q?: string; category?: string; status?: string; radiusMiles?: number } = {}) => {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.category) params.set('category', query.category);
      if (query.status) params.set('status', query.status);
      if (query.radiusMiles !== undefined) params.set('radiusMiles', String(query.radiusMiles));
      const qs = params.toString();
      return request<{ items: OpportunityItem[] }>('GET', `/opportunities${qs.length > 0 ? `?${qs}` : ''}`);
    },
    opportunity: (opportunityId: string) => request<OpportunityDetail>('GET', `/opportunities/${id(opportunityId)}`),
    pasteOpportunity: (input: { text: string; sourceUrl?: string }) =>
      request<OpportunityDetail>('POST', '/opportunities', { body: input }),
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
    createSavedSearch: (input: { q?: string; category?: string; schedule?: SavedSearch['schedule']; radiusMiles?: number }) =>
      request<SavedSearch>('POST', '/saved-searches', { body: input }),
    updateSavedSearch: (searchId: string, patch: { q?: string; paused?: boolean; schedule?: SavedSearch['schedule'] }) =>
      request<SavedSearch>('PATCH', `/saved-searches/${id(searchId)}`, { body: patch }),
    deleteSavedSearch: (searchId: string) => request<{ ok: true }>('DELETE', `/saved-searches/${id(searchId)}`),

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
    createInterview: (input: { opportunityId: string; stage: InterviewStage }, idempotencyKey: string) =>
      request<PaidInterview>('POST', '/interviews/text', { body: input, idempotencyKey }),
    answerInterview: (sessionId: string, answer: string) =>
      request<InterviewSession>('POST', `/interviews/text/${id(sessionId)}/answers`, { body: { answer } }),
    challengeInterview: (sessionId: string, answerId: string, note: string) =>
      request<InterviewSession>('POST', `/interviews/text/${id(sessionId)}/challenges`, { body: { answerId, note } }),
    starStories: () => request<{ items: StarStory[] }>('GET', '/star-stories'),
    createStarStory: (input: { situation: string; task: string; action: string; result: string; factIds?: string[] }) =>
      request<StarStory>('POST', '/star-stories', { body: input }),

    voiceInterviews: () => request<VoiceList>('GET', '/interviews/voice'),
    consentVoice: () => request<{ consent: true; version: string }>('POST', '/interviews/voice/consent'),
    startVoice: (input: { kind: 'practice' | 'negotiation'; opportunityId?: string; stage?: InterviewStage; offer?: string; salarySource?: string }) =>
      request<VoiceSession>('POST', '/interviews/voice', { body: input }),
    recordVoice: (
      sessionId: string,
      input: { durationSeconds: number; transcript: string },
      idempotencyKey: string,
    ) => request<VoiceRecordResult>('POST', `/interviews/voice/${id(sessionId)}/recording`, { body: input, idempotencyKey }),
    correctVoiceTranscript: (sessionId: string, transcript: string) =>
      request<VoiceSession>('PATCH', `/interviews/voice/${id(sessionId)}/transcript`, { body: { transcript } }),
    deleteVoiceAudio: (sessionId: string) => request<VoiceSession>('DELETE', `/interviews/voice/${id(sessionId)}/audio`),

    createScenario: (
      options: Array<{ name: string; costCents: number | null; months: number | null; destination: string; wageCents: number | null; source: 'user' | 'estimate' }>,
      idempotencyKey: string,
    ) => request<PaidScope<ScenarioResult>>('POST', '/scenarios', { body: { options }, idempotencyKey }),
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
    addAchievement: (title: string) => request<{ id: string; title: string }>('POST', '/maintenance/achievements', { body: { title } }),
    addPromotionGoal: (desiredTitle: string) =>
      request<{ id: string; desiredTitle: string }>('POST', '/maintenance/promotion-goals', { body: { desiredTitle } }),
    addCredential: (name: string, expiresOn: string) =>
      request<{ id: string; name: string; expiresOn: string; due: boolean }>('POST', '/maintenance/credentials', { body: { name, expiresOn } }),
    mapOpportunities: () => request<MapList>('GET', '/maps'),
    startMap: (idempotencyKey: string) => request<PaidScope<MapSessionResult>>('POST', '/maps', { idempotencyKey }),
    addStaff: (authUserId: string, role: 'counselor' | 'manager') =>
      request<{ id: string }>('POST', '/business/staff', { body: { authUserId, role } }),
    inviteCandidate: (email: string, consent: boolean) =>
      request<{ id: string }>('POST', '/business/candidates', { body: { email, consent } }),
    assignCounselor: (staffId: string, candidateId: string) =>
      request<{ ok: true }>('POST', '/business/assignments', { body: { staffId, candidateId } }),
    businessCandidate: (candidateId: string) => request<{ id: string; email: string }>('GET', `/business/candidates/${id(candidateId)}`),
    humanServices: () => request<HumanServiceList>('GET', '/human-services'),
    bookHumanService: (providerId: string) => request<{ ok: false }>('POST', `/human-services/${id(providerId)}/bookings`),
    setRecruitingOptIn: (discoverable: boolean) =>
      request<{ discoverable: boolean }>('POST', '/recruiting/opt-in', { body: { discoverable } }),
    recruitingSearch: () => request<RecruitingSearch>('GET', '/recruiting/search'),
    employerCheckout: () => request<{ ok: false }>('POST', '/recruiting/checkout'),
    createDeveloperKey: () => request<DeveloperKey>('POST', '/developer/keys'),
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

    skillReports: () => request<SkillReportList>('GET', '/learning/skill-reports'),
    getSkillReport: (reportId: string) => request<SkillGapReport>('GET', `/learning/skill-reports/${id(reportId)}`),
    createSkillReport: (input: CreateSkillReportInput, idempotencyKey: string) =>
      request<PaidSkillReport>('POST', '/learning/skill-reports', { body: input, idempotencyKey }),
    updateLearningProgress: (reportId: string, milestoneId: string, completed: boolean) =>
      request<SkillGapReport>('PATCH', `/learning/skill-reports/${id(reportId)}/milestones/${id(milestoneId)}`, {
        body: { completed },
      }),
    convertMilestoneToEvidence: (reportId: string, milestoneId: string) =>
      request<{ evidenceId: string }>(
        'POST',
        `/learning/skill-reports/${id(reportId)}/milestones/${id(milestoneId)}/evidence`,
      ),

    locations: () => request<LocationProfileList>('GET', '/career-modes/locations'),
    location: (locationId: string) => request<LocationProfile>('GET', `/career-modes/locations/${id(locationId)}`),
    createLocation: (input: CreateLocationProfileInput) =>
      request<LocationProfile>('POST', '/career-modes/locations', { body: input }),
    updateLocation: (locationId: string, patch: UpdateLocationProfileInput) =>
      request<LocationProfile>('PATCH', `/career-modes/locations/${id(locationId)}`, { body: patch }),
    deleteLocation: (locationId: string) => request<{ success: true }>('DELETE', `/career-modes/locations/${id(locationId)}`),
    specialistMode: () => request<CandidateSpecialistMode>('GET', '/career-modes/specialist-mode'),
    setSpecialistMode: (input: UpdateSpecialistModeInput) =>
      request<CandidateSpecialistMode>('PUT', '/career-modes/specialist-mode', { body: input }),

    portfolios: () => request<{ items: PortfolioPage[] }>('GET', '/portfolios'),
    portfolio: (portfolioId: string) => request<PortfolioPage>('GET', `/portfolios/${id(portfolioId)}`),
    createPortfolio: (input: CreatePortfolioInput) => request<PortfolioPage>('POST', '/portfolios', { body: input }),
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
    setSpendingCap: (spendingCapCents: number | null) =>
      request<BillingAccount>('PATCH', '/billing/spending-cap', { body: { spendingCapCents } }),
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
