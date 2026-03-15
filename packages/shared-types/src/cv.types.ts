import { CVStatus, CVSectionType, SkillLevel, FontSize, Spacing } from './enums';

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  postalCode: string;
  website: string;
  linkedin: string;
  github: string;
  photoURL: string | null;
  headline: string;
  summary: string;
}

export type CVLayout = 'classic' | 'sidebar' | 'top-bar' | 'compact';
export type SectionStyle = 'underline' | 'card' | 'left-border' | 'minimal';
export type BorderRadiusStyle = 'none' | 'small' | 'medium' | 'large';

export interface CVStyling {
  primaryColor: string;
  secondaryColor?: string;
  fontFamily: string;
  headingFontFamily?: string;
  fontSize: FontSize;
  spacing: Spacing;
  showPhoto: boolean;
  layout: CVLayout;
  sectionStyle: SectionStyle;
  borderRadius: BorderRadiusStyle;
}

export interface CV {
  id: string;
  userId: string;
  title: string;
  slug: string;
  templateId: string;
  status: CVStatus;
  isPublic: boolean;
  publicSlug: string | null;
  personalInfo: PersonalInfo;
  sectionOrder: string[];
  styling: CVStyling;
  version: number;
  lastAutoSavedAt: Date;
  aiGenerated: boolean;
  aiProvider: string | null;
  viewCount: number;
  downloadCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ExperienceItem {
  id: string;
  company: string;
  position: string;
  location: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  highlights: string[];
  order: number;
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  field: string;
  location: string;
  startDate: string;
  endDate: string | null;
  gpa: string;
  description: string;
  order: number;
}

export interface SkillItem {
  id: string;
  name: string;
  level: SkillLevel;
  category: string;
  order: number;
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  url: string;
  technologies: string[];
  startDate: string;
  endDate: string | null;
  order: number;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
  expiryDate: string | null;
  credentialId: string;
  url: string;
  order: number;
}

export interface LanguageItem {
  id: string;
  name: string;
  proficiency: string;
  order: number;
}

export interface ReferenceItem {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  relationship: string;
  order: number;
}

export interface CustomItem {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  description: string;
  order: number;
}

export type CVSectionItem =
  | ExperienceItem
  | EducationItem
  | SkillItem
  | ProjectItem
  | CertificationItem
  | LanguageItem
  | ReferenceItem
  | CustomItem;

export interface CVSection {
  id: string;
  type: CVSectionType;
  title: string;
  isVisible: boolean;
  order: number;
  items: CVSectionItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CVVersion {
  id: string;
  versionNumber: number;
  snapshot: Record<string, unknown>;
  changeDescription: string;
  createdAt: Date;
  createdBy: string;
}

export interface CreateCVData {
  title: string;
  templateId: string;
}

export interface UpdateCVData {
  title?: string;
  templateId?: string;
  personalInfo?: Partial<PersonalInfo>;
  sectionOrder?: string[];
  styling?: Partial<CVStyling>;
  status?: CVStatus;
  isPublic?: boolean;
}
