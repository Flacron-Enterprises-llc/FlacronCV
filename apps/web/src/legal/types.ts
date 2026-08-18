/**
 * English-only legal bodies. Chrome (Last updated, TOC, Back to top) stays in
 * t(); the controlling-version sentence lives here so it is not a JSX literal
 * and is not stuffed into locale JSON (that would rot locale-untranslated).
 */

export const LEGAL_VERSION = '2026-08-16';
export const LEGAL_LAST_UPDATED = 'August 16, 2026';

export const CONTROLLING_VERSION =
  'The English version of these legal terms is the official and controlling version. Any translation is provided for convenience only.';

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] };

export interface LegalSection {
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  id: 'terms' | 'disclaimer' | 'refund' | 'cookies';
  version: typeof LEGAL_VERSION;
  lastUpdated: typeof LEGAL_LAST_UPDATED;
  path: string;
  title: string;
  /** English meta description — these documents are the canonical English text. */
  description: string;
  preamble: LegalBlock[];
  sections: LegalSection[];
}

export function p(text: string): LegalBlock {
  return { type: 'p', text };
}

export function ul(items: string[]): LegalBlock {
  return { type: 'ul', items };
}

export function ol(items: string[]): LegalBlock {
  return { type: 'ol', items };
}

export function section(id: string, title: string, blocks: LegalBlock[]): LegalSection {
  return { id, title, blocks };
}
