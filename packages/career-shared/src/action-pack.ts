import type { MatchExplanation } from './match';
import type { ResumeLine } from './resume';

export interface ActionPackFit {
  fit: 'blocked' | 'none' | 'partial' | 'strong';
  overlap: number;
  /** English sentences, kept for clients that do not translate. */
  reasons: string[];
  gaps: string[];
  unknowns: string[];
  /** The matched and missing words behind `reasons` and `gaps`. Absent on packs made before they existed. */
  reasonTokens?: string[];
  gapTokens?: string[];
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

/** Checklist ids, in order. Screens translate each id; `label` is the English text for other clients. */
export const ACTION_PACK_CHECKLIST_IDS = ['review_resume', 'review_cover_letter', 'check_deadline', 'attach_evidence', 'prepare_interview'] as const;

/**
 * `organization` is the stated employer or null (see `statedOrganization`):
 * an unstated employer is left out of the sentence, never written as a placeholder.
 */
export function defaultActionPackChecklist(title: string, organization: string | null): ActionPackChecklistItem[] {
  const at = organization ? ` at ${organization}` : '';
  return [
    { id: 'review_resume', label: `Review the tailored resume for ${title}${at}`, done: false },
    { id: 'review_cover_letter', label: organization ? `Review the cover letter for ${organization}` : 'Review the cover letter', done: false },
    { id: 'check_deadline', label: 'Verify the submission deadline and requirements', done: false },
    { id: 'attach_evidence', label: 'Attach verified career evidence and work samples', done: false },
    { id: 'prepare_interview', label: 'Practise STAR answers for the role', done: false },
  ];
}

export type ActionPackNextStepCode =
  | 'resolve_blockers'
  | 'apply_promptly'
  | 'reach_out'
  | 'address_gaps'
  | 'highlight_transferable'
  | 'add_gap_evidence'
  | 'track_application';

/**
 * Next steps as codes, derived only from the fit and the gap count, so a
 * screen can translate them (and re-derive them for packs saved before the
 * codes existed). `add_gap_evidence` takes the gap count as its parameter.
 */
export function actionPackNextStepCodes(fit: ActionPackFit['fit'], gapsCount: number): ActionPackNextStepCode[] {
  const codes: ActionPackNextStepCode[] = [];
  if (fit === 'blocked') codes.push('resolve_blockers');
  else if (fit === 'strong') codes.push('apply_promptly', 'reach_out');
  else codes.push('address_gaps', 'highlight_transferable');
  if (gapsCount > 0) codes.push('add_gap_evidence');
  codes.push('track_application');
  return codes;
}

const NEXT_STEP_TEXT: Record<ActionPackNextStepCode, (gaps: number) => string> = {
  resolve_blockers: () => 'Resolve blocking constraints (e.g. work authorization, location) before applying.',
  apply_promptly: () => 'Direct match: review generated documents and apply promptly.',
  reach_out: () => 'Reach out to team recruiters or referral contacts on LinkedIn.',
  address_gaps: () => 'Address highlighted skill gaps with supporting evidence or coursework.',
  highlight_transferable: () => 'Highlight transferable achievements in the cover letter.',
  add_gap_evidence: (gaps) => `Consider adding evidence or projects addressing the ${gaps} identified skill ${gaps === 1 ? 'gap' : 'gaps'}.`,
  track_application: () => 'Track this opportunity in your Applications board.',
};

/** English next steps, stored with the pack for clients that do not translate the codes. */
export function defaultActionPackNextSteps(fit: ActionPackFit['fit'], gapsCount: number): string[] {
  return actionPackNextStepCodes(fit, gapsCount).map((code) => NEXT_STEP_TEXT[code](gapsCount));
}
