import { extractJsonObject } from './ai-json';

/** `LinkedinOptimizeDto`: cvContent required (max 50000), targetRole optional (max 200). */
export const LINKEDIN_CV_CONTENT_MAX = 50000;
export const LINKEDIN_TARGET_ROLE_MAX = 200;

export interface LinkedInRequest {
  cvContent: string;
  targetRole?: string;
}

export interface LinkedInResult {
  headline: string;
  about: string;
  skills: string[];
  tips: string[];
}

function clamp(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/**
 * `POST /ai/linkedin` body — exactly the DTO keys. A blank role is omitted
 * (the website sends `targetRole.trim() || undefined`).
 */
export function buildLinkedInRequest(cvContent: string, targetRole: string): LinkedInRequest {
  const body: LinkedInRequest = { cvContent: clamp(cvContent, LINKEDIN_CV_CONTENT_MAX) };
  const role = clamp(targetRole, LINKEDIN_TARGET_ROLE_MAX);
  if (role) body.targetRole = role;
  return body;
}

/** Same parse as the website's `LinkedInModal.parseLinkedIn`. */
export function parseLinkedIn(raw: string): LinkedInResult | null {
  const obj = extractJsonObject(raw);
  if (!obj || typeof obj !== 'object') return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  const result: LinkedInResult = {
    headline: str(obj.headline),
    about: str(obj.about),
    skills: arr(obj.skills),
    tips: arr(obj.tips),
  };
  if (!result.headline && !result.about && !result.skills.length) return null;
  return result;
}

/** Skills copy text — the website copies `skills.join(', ')`. */
export function skillsCopyText(result: LinkedInResult): string {
  return result.skills.join(', ');
}

/** Whole result as one shareable text, for "Share all". */
export function linkedInShareText(result: LinkedInResult): string {
  const parts: string[] = [];
  if (result.headline) parts.push(`Headline\n${result.headline}`);
  if (result.about) parts.push(`About section\n${result.about}`);
  if (result.skills.length) parts.push(`Skills & keywords\n${skillsCopyText(result)}`);
  if (result.tips.length) parts.push(`Tips\n${result.tips.map((t) => `- ${t}`).join('\n')}`);
  return parts.join('\n\n');
}
