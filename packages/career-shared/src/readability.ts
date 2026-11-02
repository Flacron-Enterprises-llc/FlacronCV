/**
 * CV03 readability. Parsing issues on one resume version.
 * This is not a job-fit comparison and it is not an employer ATS score.
 * There is no number.
 */

import { CORE_FACT_TYPES } from './facts';
import type { FactType } from './facts';
import type { ResumeBody } from './resume';

export const READABILITY_LABEL = 'flacroncv_readability';

export const READABILITY_ISSUE_CODES = ['empty', 'unconfirmed_version', 'missing_section', 'uncertain_line'] as const;
export type ReadabilityIssueCode = (typeof READABILITY_ISSUE_CODES)[number];

export interface ReadabilityIssue {
  code: ReadabilityIssueCode;
  section?: FactType;
  factId?: string;
}

export interface ReadabilityReport {
  label: typeof READABILITY_LABEL;
  issues: ReadabilityIssue[];
}

export function readabilityReport(body: ResumeBody): ReadabilityReport {
  const issues: ReadabilityIssue[] = [];
  const present = new Set(body.sections.map((section) => section.factType));
  if (body.sections.length === 0) issues.push({ code: 'empty' });
  if (body.confirmation !== 'confirmed') issues.push({ code: 'unconfirmed_version' });
  for (const section of CORE_FACT_TYPES) {
    if (!present.has(section)) issues.push({ code: 'missing_section', section });
  }
  for (const section of body.sections) {
    for (const line of section.lines) {
      if (line.uncertain) issues.push({ code: 'uncertain_line', section: section.factType, factId: line.factId });
    }
  }
  return { label: READABILITY_LABEL, issues };
}
