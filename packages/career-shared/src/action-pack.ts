import { FACT_TYPES, isFactType } from './facts';
import type { FactType } from './facts';
import { matchTokens } from './match';
import type { MatchExplanation } from './match';
import { factLineText } from './resume';
import type { ResumeFactInput, ResumeLine } from './resume';

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
  /**
   * Listing words each kept fact matched, by fact id. Absent on packs made
   * before the résumé was tailored, and on lines the person added back.
   */
  relevance?: Record<string, string[]>;
  /** Confirmed facts left out because they matched nothing in the listing; the person can add them back. */
  omittedFactIds?: string[];
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

/**
 * `generating`: the first attempt is running. `partial`: a component failed
 * and the pack's one reservation is still held for a retry. `complete`: the
 * credit was used once. `expired`: a partial pack whose hold ran out; the
 * credit went back and the pack can only be deleted.
 */
export const ACTION_PACK_STATUSES = ['generating', 'partial', 'complete', 'expired'] as const;
export type ActionPackStatus = (typeof ACTION_PACK_STATUSES)[number];

export const ACTION_PACK_COMPONENTS = ['fit', 'tailoredResume', 'coverLetter', 'checklist', 'nextSteps'] as const;
export type ActionPackComponent = (typeof ACTION_PACK_COMPONENTS)[number];

/** Letter attempts one pack reservation covers (the first run plus retries) before it is released. */
export const ACTION_PACK_LETTER_ATTEMPTS = 3;

/** Where a pack's documents were copied in Documents. */
export interface ActionPackSavedDocuments {
  resumeId: string | null;
  resumeVersionId: string | null;
  letterDocumentId: string | null;
}

export interface ActionPack {
  id: string;
  /** Absent on packs made before resumable packs existed; those are complete. */
  status?: ActionPackStatus;
  /** Why a component failed, by component (e.g. `coverLetter: 'unusable_output'`). */
  componentErrors?: Partial<Record<ActionPackComponent, string>>;
  /** Letter attempts used so far under this pack's reservation. */
  letterAttempts?: number;
  /** Components the person changed by hand. */
  editedComponents?: ActionPackComponent[];
  savedDocuments?: ActionPackSavedDocuments;
  opportunityId: string;
  opportunityRevisionId: string;
  vacancySnapshot: ActionPackVacancySnapshot;
  profileSnapshot: ActionPackProfileFactSnapshot[];
  fit: ActionPackFit;
  tailoredResume: ActionPackResume;
  /** Null only while the pack is generating or partial (the letter has not been written yet). */
  coverLetter: ActionPackLetter | null;
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

/** Fact types a tailored résumé always keeps (who the person is and where they worked or studied). */
const ALWAYS_KEPT: readonly FactType[] = ['contact', 'summary', 'experience', 'education'];
/** Sections that stay at the top in this order whatever their relevance. */
const LEADING: readonly FactType[] = ['contact', 'summary'];

export interface TailoredResumeResult {
  lines: ResumeLine[];
  factIds: string[];
  relevance: Record<string, string[]>;
  omittedFactIds: string[];
}

/**
 * Tailors the résumé to one listing using only the confirmed facts given.
 * Each fact is scored by the distinct listing words its own text contains
 * (the same words the fit explanation uses). Roles and schools are always
 * kept but the most relevant come first; skills, projects, achievements,
 * certifications, languages and references are kept only when they match a
 * listing word, unless none in that section matches (then the section is
 * kept as it was, so a résumé is never emptied by tailoring). Sections after
 * contact and summary are ordered by their best match. Nothing is written:
 * every line is the fact's own text, and a draft fact is never used.
 */
export function tailorActionPackResume(facts: ResumeFactInput[], listingText: string): TailoredResumeResult {
  const listingWords = new Set(matchTokens(listingText));
  const scored = facts
    .filter((fact) => fact.confirmation === 'confirmed')
    .map((fact, order) => {
      const text = factLineText(fact.factType, fact.value);
      const matched = [...new Set(matchTokens(text).filter((word) => listingWords.has(word)))];
      return { fact, text, matched, order };
    })
    .filter((entry) => entry.text.length > 0);

  const sections: { factType: FactType; best: number; typeOrder: number; entries: typeof scored }[] = [];
  const omittedFactIds: string[] = [];
  FACT_TYPES.forEach((factType, typeOrder) => {
    const inType = scored.filter((entry) => entry.fact.factType === factType);
    if (inType.length === 0) return;
    const anyMatch = inType.some((entry) => entry.matched.length > 0);
    const kept =
      ALWAYS_KEPT.includes(factType) || !anyMatch ? inType : inType.filter((entry) => entry.matched.length > 0);
    for (const entry of inType) if (!kept.includes(entry)) omittedFactIds.push(entry.fact.id);
    // Stable: equal scores keep the profile's order.
    const ordered = kept.slice().sort((a, b) => b.matched.length - a.matched.length || a.order - b.order);
    sections.push({ factType, best: Math.max(...kept.map((entry) => entry.matched.length)), typeOrder, entries: ordered });
  });
  sections.sort((a, b) => {
    const aLead = LEADING.indexOf(a.factType);
    const bLead = LEADING.indexOf(b.factType);
    if (aLead !== -1 || bLead !== -1) {
      if (aLead === -1) return 1;
      if (bLead === -1) return -1;
      return aLead - bLead;
    }
    return b.best - a.best || a.typeOrder - b.typeOrder;
  });

  const lines: ResumeLine[] = [];
  const relevance: Record<string, string[]> = {};
  for (const section of sections) {
    for (const entry of section.entries) {
      lines.push({ factId: entry.fact.id, factType: section.factType, text: entry.text, uncertain: false });
      if (entry.matched.length > 0) relevance[entry.fact.id] = entry.matched;
    }
  }
  return { lines, factIds: lines.map((line) => line.factId), relevance, omittedFactIds };
}

export const ACTION_PACK_EDIT_LIMITS = {
  title: 200,
  letterBody: 20_000,
  lineText: 5_000,
  resumeLines: 200,
  listItems: 30,
  listItemText: 500,
  checklistLabel: 300,
} as const;

/** What a person may change in a pack. Each present key replaces that component. */
export interface ActionPackEdit {
  fit?: { reasons: string[]; gaps: string[] };
  /** Lines in the order wanted. Every fact id must be a confirmed fact frozen in the pack. */
  tailoredResume?: { title?: string; lines: Array<{ factId: string; text: string }> };
  coverLetter?: { title?: string; body: string };
  /** Items in order. A known id without a label keeps its label; a label makes it the person's own item. */
  checklist?: Array<{ id?: string; label?: string; done: boolean }>;
  nextSteps?: string[];
}

export interface EditablePackParts {
  fit: ActionPackFit;
  tailoredResume: ActionPackResume;
  coverLetter: ActionPackLetter | null;
  checklist: ActionPackChecklistItem[];
  nextSteps: string[];
  profileSnapshot: ActionPackProfileFactSnapshot[];
}

export type ActionPackEditResult =
  | { ok: true; parts: Omit<EditablePackParts, 'profileSnapshot'>; edited: ActionPackComponent[] }
  | { ok: false; field: string; reason: string };

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}

function cleanList(value: unknown, max: number, itemMax: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const items: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (text.length > itemMax) return null;
    if (text.length > 0) items.push(text);
  }
  return items;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Applies a person's edit to a pack. Text is theirs to write, but a résumé
 * line can only stand for a confirmed fact frozen in the pack, so editing
 * never adds a fact the profile did not confirm. `newId` names a checklist
 * item the person wrote.
 */
export function applyActionPackEdit(
  current: EditablePackParts,
  edit: unknown,
  newId: () => string,
): ActionPackEditResult {
  const patch = asRecord(edit);
  if (!patch) return { ok: false, field: 'body', reason: 'invalid' };
  const L = ACTION_PACK_EDIT_LIMITS;
  const parts: Omit<EditablePackParts, 'profileSnapshot'> = {
    fit: current.fit,
    tailoredResume: current.tailoredResume,
    coverLetter: current.coverLetter,
    checklist: current.checklist,
    nextSteps: current.nextSteps,
  };
  const edited: ActionPackComponent[] = [];

  if (patch.fit !== undefined) {
    const fit = asRecord(patch.fit);
    const reasons = fit ? cleanList(fit.reasons, L.listItems, L.listItemText) : null;
    const gaps = fit ? cleanList(fit.gaps, L.listItems, L.listItemText) : null;
    if (!reasons || !gaps) return { ok: false, field: 'fit', reason: 'invalid' };
    // Typed sentences replace the matched words; the fit level and unknowns stay as measured.
    const { reasonTokens: _reasonTokens, gapTokens: _gapTokens, ...measured } = current.fit;
    parts.fit = { ...measured, reasons, gaps };
    edited.push('fit');
  }

  if (patch.tailoredResume !== undefined) {
    const resume = asRecord(patch.tailoredResume);
    const rawLines = resume?.lines;
    if (!resume || !Array.isArray(rawLines) || rawLines.length === 0 || rawLines.length > L.resumeLines) {
      return { ok: false, field: 'tailoredResume', reason: 'invalid' };
    }
    const title = resume.title === undefined ? current.tailoredResume.title : cleanText(resume.title, L.title);
    if (!title) return { ok: false, field: 'tailoredResume.title', reason: 'invalid' };
    const snapshot = new Map(current.profileSnapshot.map((fact) => [fact.id, fact]));
    const seen = new Set<string>();
    const lines: ResumeLine[] = [];
    for (const raw of rawLines) {
      const line = asRecord(raw);
      const factId = line && typeof line.factId === 'string' ? line.factId : '';
      const fact = snapshot.get(factId);
      if (!fact || !isFactType(fact.factType)) return { ok: false, field: 'tailoredResume.lines', reason: 'unknown_fact' };
      if (seen.has(factId)) return { ok: false, field: 'tailoredResume.lines', reason: 'duplicate' };
      const text = cleanText(line?.text, L.lineText);
      if (!text) return { ok: false, field: 'tailoredResume.lines', reason: 'invalid' };
      seen.add(factId);
      lines.push({ factId, factType: fact.factType, text, uncertain: false });
    }
    const relevance: Record<string, string[]> = {};
    for (const [id, words] of Object.entries(current.tailoredResume.relevance ?? {})) if (seen.has(id)) relevance[id] = words;
    parts.tailoredResume = {
      title,
      lines,
      factIds: lines.map((line) => line.factId),
      relevance,
      omittedFactIds: current.profileSnapshot.map((fact) => fact.id).filter((id) => !seen.has(id)),
    };
    edited.push('tailoredResume');
  }

  if (patch.coverLetter !== undefined) {
    if (!current.coverLetter) return { ok: false, field: 'coverLetter', reason: 'not_ready' };
    const letter = asRecord(patch.coverLetter);
    const body = letter ? cleanText(letter.body, L.letterBody) : null;
    const title = letter?.title === undefined ? current.coverLetter.title : cleanText(letter.title, L.title);
    if (!body || !title) return { ok: false, field: 'coverLetter', reason: 'invalid' };
    parts.coverLetter = { ...current.coverLetter, title, body };
    edited.push('coverLetter');
  }

  if (patch.checklist !== undefined) {
    if (!Array.isArray(patch.checklist) || patch.checklist.length > L.listItems) {
      return { ok: false, field: 'checklist', reason: 'invalid' };
    }
    const known = new Map(current.checklist.map((item) => [item.id, item]));
    const items: ActionPackChecklistItem[] = [];
    const ids = new Set<string>();
    for (const raw of patch.checklist) {
      const item = asRecord(raw);
      if (!item || typeof item.done !== 'boolean') return { ok: false, field: 'checklist', reason: 'invalid' };
      const existing = typeof item.id === 'string' ? known.get(item.id) : undefined;
      let next: ActionPackChecklistItem;
      if (item.label === undefined) {
        if (!existing) return { ok: false, field: 'checklist', reason: 'invalid' };
        next = { ...existing, done: item.done };
      } else {
        const label = cleanText(item.label, L.checklistLabel);
        if (!label) return { ok: false, field: 'checklist', reason: 'invalid' };
        // A built-in id is translated on screen; once reworded it becomes the person's own item.
        const builtIn = existing !== undefined && (ACTION_PACK_CHECKLIST_IDS as readonly string[]).includes(existing.id);
        const id = existing && !builtIn ? existing.id : newId();
        next = { id, label, done: item.done };
      }
      if (ids.has(next.id)) return { ok: false, field: 'checklist', reason: 'duplicate' };
      ids.add(next.id);
      items.push(next);
    }
    parts.checklist = items;
    edited.push('checklist');
  }

  if (patch.nextSteps !== undefined) {
    const steps = cleanList(patch.nextSteps, L.listItems, L.listItemText);
    if (!steps) return { ok: false, field: 'nextSteps', reason: 'invalid' };
    parts.nextSteps = steps;
    edited.push('nextSteps');
  }

  if (edited.length === 0) return { ok: false, field: 'body', reason: 'empty' };
  return { ok: true, parts, edited };
}
