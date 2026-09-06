export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum SubscriptionPlan {
  FREE = 'free',
  PRO = 'pro',
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
