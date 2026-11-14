/**
 * Example content seeded into a CV created from a template.
 *
 * A new CV starts with a fictional career (two jobs, a degree, ten skills and a
 * summary) so the template has something to show. That example is useful — but
 * nothing marked it as an example, so it was easy to export a CV that still
 * described someone else. The API now tags what it seeds (`isSample: true` on
 * each item, and the seeded summary text on the CV as `sampleSummary`); this
 * module reads those tags, plus an exact fingerprint of the old seed so CVs
 * created before the tags existed are recognised too.
 *
 * Editing a seeded item makes it the user's own (CVEditor marks it with
 * `isSample: false` via markEdited), so
 * "sample content present" means "untouched example content present".
 */
import type { CV, CVSection } from '@flacroncv/shared-types';

/** The summary every template CV was seeded with before tagging existed. */
const LEGACY_SAMPLE_SUMMARY =
  'Results-driven professional with a strong background in delivering impactful solutions. Passionate about innovation, collaboration, and continuous improvement. Seeking opportunities to leverage expertise and contribute to organizational success.';

const LEGACY_SAMPLE_JOBS = new Set([
  'Senior Software Engineer|Tech Solutions Inc.',
  'Software Developer|Digital Innovations Ltd.',
]);
const LEGACY_SAMPLE_EDUCATION = 'University of Technology|Bachelor of Science|Computer Science';
const LEGACY_SAMPLE_SKILLS = 'JavaScript|TypeScript|React|Node.js|Python|SQL|Git|Docker|AWS|Agile/Scrum';

type AnyItem = Record<string, unknown>;

function isLegacySampleItem(sectionType: string, item: AnyItem, section: CVSection): boolean {
  if (sectionType === 'experience') {
    return LEGACY_SAMPLE_JOBS.has(`${item.position}|${item.company}`);
  }
  if (sectionType === 'education') {
    return `${item.institution}|${item.degree}|${item.field}` === LEGACY_SAMPLE_EDUCATION;
  }
  if (sectionType === 'skills') {
    // A single "Python" skill is plausibly the user's own; the exact seeded
    // list of ten, in order, is not.
    const names = (section.items as unknown as AnyItem[]).map((i) => i.name).join('|');
    return names === LEGACY_SAMPLE_SKILLS;
  }
  return false;
}

export function isSampleItem(section: CVSection, item: unknown): boolean {
  const it = (item ?? {}) as AnyItem;
  if (it.isSample === true) return true;
  // Explicitly released by an edit (see markEdited).
  if (it.isSample === false) return false;
  return isLegacySampleItem(section.type, it, section);
}

/** True while the CV's summary is still exactly the seeded example. */
export function hasSampleSummary(cv: Pick<CV, 'personalInfo'> & { sampleSummary?: unknown }): boolean {
  const summary = (cv.personalInfo?.summary ?? '').trim();
  if (!summary) return false;
  const seeded = typeof cv.sampleSummary === 'string' ? cv.sampleSummary.trim() : '';
  return summary === (seeded || LEGACY_SAMPLE_SUMMARY);
}

export function hasSampleContent(cv: Pick<CV, 'personalInfo'> & { sampleSummary?: unknown }, sections: CVSection[]): boolean {
  return hasSampleSummary(cv) || sections.some((s) => s.items.some((item) => isSampleItem(s, item)));
}

/**
 * Sections with every untouched example item removed. Sections that become
 * empty are kept (with their headings) so the user still has the structure to
 * fill in. Returns only the sections that changed.
 */
export function stripSampleItems(sections: CVSection[]): Array<{ id: string; items: CVSection['items'] }> {
  const changed: Array<{ id: string; items: CVSection['items'] }> = [];
  for (const s of sections) {
    const kept = s.items.filter((item) => !isSampleItem(s, item));
    if (kept.length !== s.items.length) changed.push({ id: s.id, items: kept });
  }
  return changed;
}

/**
 * The item after the user edits it: no longer an example. Stored as an explicit
 * `isSample: false` so an untagged legacy seed item stops matching the
 * fingerprint too. Items that were never samples are returned unchanged.
 */
export function markEdited<T extends object>(section: CVSection, item: T): T {
  return isSampleItem(section, item) ? { ...item, isSample: false } : item;
}
