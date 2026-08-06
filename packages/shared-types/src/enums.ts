export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum SubscriptionPlan {
  FREE = 'free',
  PRO = 'pro',
  // ASSUMPTION (client to confirm): a premium individual tier positioned BETWEEN
  // Pro and Enterprise (see PLAN_RANK + PLAN_CONFIGS). Purchase is gated "coming
  // soon" until a real Stripe price id is configured.
  CAREER_ACCELERATOR = 'career_accelerator',
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

export enum JobStatus {
  WISHLIST = 'wishlist',
  APPLIED = 'applied',
  INTERVIEWING = 'interviewing',
  OFFER = 'offer',
  REJECTED = 'rejected',
  ACCEPTED = 'accepted',
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
