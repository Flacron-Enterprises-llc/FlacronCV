import type { MatchExplanation } from './match';
import type { ResumeLine } from './resume';

export interface ActionPackFit {
  fit: 'blocked' | 'none' | 'partial' | 'strong';
  overlap: number;
  reasons: string[];
  gaps: string[];
  unknowns: string[];
}

export interface ActionPackResume {
  title: string;
  lines: ResumeLine[];
  factIds: string[];
}

export interface ActionPackLetter {
  title: string;
  body: string;
  factIds: string[];
}

export interface ActionPackChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface ActionPackVacancySnapshot {
  title: string;
  organization: string | null;
  description: string;
  sourceUrl: string | null;
  deadline: string | null;
  checkedAt: string;
  revisionId: string;
}

export interface ActionPackProfileFactSnapshot {
  id: string;
  factType: string;
  value: Record<string, unknown>;
}

export interface ActionPack {
  id: string;
  opportunityId: string;
  opportunityRevisionId: string;
  vacancySnapshot: ActionPackVacancySnapshot;
  profileSnapshot: ActionPackProfileFactSnapshot[];
  fit: ActionPackFit;
  tailoredResume: ActionPackResume;
  coverLetter: ActionPackLetter;
  checklist: ActionPackChecklistItem[];
  nextSteps: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateActionPackInput {
  opportunityId: string;
}

export function defaultActionPackChecklist(title: string, organization: string | null): ActionPackChecklistItem[] {
  const orgName = organization || 'the employer';
  return [
    { id: 'review_resume', label: `Review tailored resume for ${title} at ${orgName}`, done: false },
    { id: 'review_cover_letter', label: `Review tailored cover letter for ${orgName}`, done: false },
    { id: 'check_deadline', label: 'Verify submission deadline and requirements', done: false },
    { id: 'attach_evidence', label: 'Attach verified career evidence & work samples', done: false },
    { id: 'prepare_interview', label: 'Practice STAR interview questions for target role', done: false },
  ];
}

export function defaultActionPackNextSteps(fit: 'blocked' | 'none' | 'partial' | 'strong', gapsCount: number): string[] {
  const steps: string[] = [];
  if (fit === 'blocked') {
    steps.push('Resolve blocking constraints (e.g. work authorization, location) before applying.');
  } else if (fit === 'strong') {
    steps.push('Direct match: review generated documents and apply promptly.');
    steps.push('Reach out to team recruiters or referral contacts on LinkedIn.');
  } else {
    steps.push('Address highlighted skill gaps with supporting evidence or coursework.');
    steps.push('Highlight transferable achievements in the cover letter.');
  }
  if (gapsCount > 0) {
    steps.push(`Consider adding evidence or projects addressing the ${gapsCount} identified skill gaps.`);
  }
  steps.push('Track this opportunity in your Applications board.');
  return steps;
}
