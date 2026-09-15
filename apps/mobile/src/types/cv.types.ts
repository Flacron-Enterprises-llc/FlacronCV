import { CVSectionType, CVStatus, FontSize, SkillLevel, Spacing } from './enums';

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  website?: string;
  linkedin?: string;
  github?: string;
  photoURL?: string;
  headline?: string;
  summary?: string;
}

export interface CVStyling {
  primaryColor: string;
  fontFamily: string;
  headingFontFamily?: string;
  fontSize: FontSize;
  spacing: Spacing;
  showPhoto: boolean;
}

export interface ExperienceItem {
  id: string;
  company: string;
  position: string;
  location?: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  description?: string;
  highlights?: string[];
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  field: string;
  location?: string;
  startDate: string;
  endDate?: string;
  gpa?: string;
  description?: string;
}

export interface SkillItem {
  id: string;
  name: string;
  level: SkillLevel;
  category?: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  url?: string;
  technologies?: string[];
  startDate?: string;
  endDate?: string;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
  expiryDate?: string;
  credentialId?: string;
  url?: string;
}

export interface LanguageItem {
  id: string;
  name: string;
  proficiency: string;
}

export interface ReferenceItem {
  id: string;
  name: string;
  title: string;
  company: string;
  email?: string;
  phone?: string;
  relationship?: string;
}

export interface CustomItem {
  id: string;
  title: string;
  subtitle?: string;
  date?: string;
  description?: string;
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
  createdAt: string;
  updatedAt: string;
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
  lastAutoSavedAt: string;
  aiGenerated: boolean;
  aiProvider: string | null;
  viewCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Create body — required title/templateId + Nest mobile-compat optionals. Not Partial<CV>. */
export interface CreateCVPayload {
  title: string;
  templateId: string;
  status?: CVStatus;
  isPublic?: boolean;
  personalInfo?: PersonalInfo;
  styling?: CVStyling;
  sectionOrder?: string[];
}

/** Update body — Nest UpdateCvDto whitelist. */
export interface UpdateCVPayload {
  title?: string;
  templateId?: string;
  personalInfo?: PersonalInfo;
  sectionOrder?: string[];
  styling?: CVStyling;
  status?: CVStatus;
  isPublic?: boolean;
}

/** POST /cvs/:id/sections — Nest AddSectionDto. */
export interface AddCVSectionPayload {
  id?: string;
  type: CVSectionType;
  title: string;
  order: number;
  isVisible?: boolean;
  items?: CVSectionItem[];
}

/** PUT /cvs/:id/sections/:sectionId — Nest UpdateSectionDto. */
export interface UpdateCVSectionPayload {
  title?: string;
  isVisible?: boolean;
  items?: CVSectionItem[];
  order?: number;
}

export interface CVVersion {
  id: string;
  versionNumber: number;
  snapshot: { cv: CV; sections: CVSection[] };
  changeDescription?: string;
  createdAt: string;
  createdBy: string;
}
