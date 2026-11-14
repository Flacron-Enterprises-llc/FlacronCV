export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

/**
 * Every plan id a user document can carry.
 *
 * The five-plan catalog (decided 2026-11-14): FREE, STARTER, PROFESSIONAL,
 * CAREER_PRO, BUSINESS. Ids are identical to the career catalog `PlanId`
 * (`packages/career-shared/src/catalog.ts`).
 *
 * LEGACY: PRO, CAREER_ACCELERATOR, ENTERPRISE. Existing paying customers keep
 * them (price, limits, Stripe/Apple/Google ids, renewals) exactly as before.
 * They are never offered to new customers — see `isLegacyPlan` and
 * `customerFacingPlans`. Never delete or rename a member: the string is stored
 * on user docs, subscription records and Stripe metadata.
 */
export enum SubscriptionPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  CAREER_PRO = 'career_pro',
  BUSINESS = 'business',
  /** LEGACY — not sold to new customers. */
  PRO = 'pro',
  /** LEGACY — never sold (its Stripe price was never configured). */
  CAREER_ACCELERATOR = 'career_accelerator',
  /** LEGACY — not sold to new customers. */
  ENTERPRISE = 'enterprise',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  PAST_DUE = 'past_due',
  TRIALING = 'trialing',
  INCOMPLETE = 'incomplete',
  UNPAID = 'unpaid',
}

/**
 * Who bills this subscription. Omitted on existing user docs — treat as
 * {@link BillingProvider.STRIPE}. Do not backfill.
 */
export enum BillingProvider {
  STRIPE = 'stripe',
  APPLE = 'apple',
  GOOGLE = 'google',
}

export enum CVStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export enum CoverLetterStatus {
  DRAFT = 'draft',
  FINAL = 'final',
}

export enum CVSectionType {
  EXPERIENCE = 'experience',
  EDUCATION = 'education',
  SKILLS = 'skills',
  PROJECTS = 'projects',
  CERTIFICATIONS = 'certifications',
  LANGUAGES = 'languages',
  REFERENCES = 'references',
  AWARDS = 'awards',
  PUBLICATIONS = 'publications',
  VOLUNTEER = 'volunteer',
  CUSTOM = 'custom',
}

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export enum TicketCategory {
  BUG = 'bug',
  FEATURE_REQUEST = 'feature_request',
  BILLING = 'billing',
  ACCOUNT = 'account',
  GENERAL = 'general',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  WAITING_ON_CUSTOMER = 'waiting_on_customer',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TemplateCategory {
  CV = 'cv',
  COVER_LETTER = 'cover_letter',
}

/**
 * Application stages (spec §1 "Application workspace" status board).
 *
 * Stored documents written before this set existed may still say `wishlist`,
 * `offer` or `accepted`; see `normalizeJobStatus` in job.types.ts for how
 * those are read and how old clients' writes are mapped.
 */
export enum JobStatus {
  SAVED = 'saved',
  PREPARING = 'preparing',
  APPLIED = 'applied',
  INTERVIEWING = 'interviewing',
  OFFERED = 'offered',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
  /** @deprecated Old name of SAVED (same value); kept so existing references keep compiling. */
  WISHLIST = 'saved',
  /** @deprecated Old name of OFFERED (same value); kept so existing references keep compiling. */
  OFFER = 'offered',
}

export enum AIProvider {
  OPENAI = 'openai',
  WATSONX = 'watsonx',
}

export enum Locale {
  EN = 'en',
  ES = 'es',
  FR = 'fr',
  DE = 'de',
  AR = 'ar',
  UR = 'ur',
}

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

export enum FontSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

export enum Spacing {
  COMPACT = 'compact',
  NORMAL = 'normal',
  RELAXED = 'relaxed',
}

export enum BillingInterval {
  MONTH = 'month',
  YEAR = 'year',
}

export enum CRMCustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  LEAD = 'lead',
}

export enum CRMLeadStage {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  PROPOSAL = 'proposal',
  CLOSED_WON = 'closed_won',
  CLOSED_LOST = 'closed_lost',
}

export enum CRMTransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

export enum CRMCustomerSource {
  MANUAL = 'manual',
  WEBSITE = 'website',
  WHATSAPP = 'whatsapp',
  REFERRAL = 'referral',
  SOCIAL = 'social',
  EMAIL = 'email',
  OTHER = 'other',
}

export enum CRMActivityType {
  NOTE = 'note',
  STATUS_CHANGE = 'status_change',
  TRANSACTION = 'transaction',
  LEAD_CONVERTED = 'lead_converted',
  TAG_ADDED = 'tag_added',
  TAG_REMOVED = 'tag_removed',
}
