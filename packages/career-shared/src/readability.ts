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

/**
 * Format-level checks: how the text will survive a parser, not what it says.
 * Kept in their own list so existing screens that read `issues` are unchanged
 * and so format is never mixed with job fit.
 */
export const FORMAT_ISSUE_CODES = ['long_line', 'table_marker', 'unusual_characters', 'missing_contact'] as const;
export type FormatIssueCode = (typeof FORMAT_ISSUE_CODES)[number];

export interface FormatIssue {
  code: FormatIssueCode;
  section?: FactType;
  factId?: string;
}

/** A line longer than this reads as a wall of text and is often split badly by parsers. */
export const LONG_LINE_CHARS = 300;

export interface ReadabilityReport {
  label: typeof READABILITY_LABEL;
  issues: ReadabilityIssue[];
  formatIssues: FormatIssue[];
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
  return { label: READABILITY_LABEL, issues, formatIssues: formatIssues(body) };
}

/** Tabs, runs of spaces used as columns, pipes and box-drawing characters: signs of a table or columns. */
const TABLE_MARKER = /\t| {4,}\S| \| |[\u2500-\u257F]/;
/** Emoji, pictographs, dingbats, geometric icons and private-use glyphs that many parsers drop or garble. */
const UNUSUAL = /[\u25A0-\u25FF\u2600-\u27BF\uE000-\uF8FF\u{1F000}-\u{1FAFF}\uFFFD]/u;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /\+?\d[\d\s().-]{6,}\d/;

export function formatIssues(body: ResumeBody): FormatIssue[] {
  const found: FormatIssue[] = [];
  for (const section of body.sections) {
    for (const line of section.lines) {
      if (line.text.length > LONG_LINE_CHARS) found.push({ code: 'long_line', section: section.factType, factId: line.factId });
      if (TABLE_MARKER.test(line.text)) found.push({ code: 'table_marker', section: section.factType, factId: line.factId });
      if (UNUSUAL.test(line.text)) found.push({ code: 'unusual_characters', section: section.factType, factId: line.factId });
    }
  }
  const contact = body.sections.find((section) => section.factType === 'contact');
  const reachable = (contact?.lines ?? []).some((line) => EMAIL.test(line.text) || PHONE.test(line.text));
  if (!reachable) found.push({ code: 'missing_contact', section: 'contact' });
  return found;
}
