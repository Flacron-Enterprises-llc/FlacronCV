import type { CV, CVSection } from '@flacroncv/shared-types';

/**
 * Flatten a CV + its sections into plain text suitable for feeding to the ATS
 * analyzer (POST /ai/ats-check). Only visible sections are included, ordered by
 * the CV's sectionOrder. Item shapes are loose (CVSectionItem is an `any` union),
 * so we handle the common fields defensively.
 */
export function serializeCVToText(cv: CV, sections: CVSection[]): string {
  const p = (cv.personalInfo || {}) as Record<string, any>;
  const lines: string[] = [];

  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  if (name) lines.push(name);
  if (p.headline) lines.push(String(p.headline));
  if (p.summary) lines.push(`\nSummary:\n${p.summary}`);

  const visible = [...(sections || [])]
    .filter((s) => s.isVisible)
    .sort((a, b) => {
      const oa = cv.sectionOrder.indexOf(a.id);
      const ob = cv.sectionOrder.indexOf(b.id);
      return (oa === -1 ? Infinity : oa) - (ob === -1 ? Infinity : ob);
    });

  for (const section of visible) {
    lines.push(`\n${section.title || section.type}:`);
    for (const item of section.items || []) {
      const it = item as Record<string, any>;
      if (it == null) continue;
      if (typeof it === 'string') {
        lines.push(`- ${it}`);
      } else if (it.position || it.company) {
        const head = [it.position, it.company].filter(Boolean).join(' at ');
        const dates = it.startDate || it.endDate ? ` (${it.startDate || ''} - ${it.endDate || 'Present'})` : '';
        lines.push(`- ${head}${dates}`);
        if (it.description) lines.push(`  ${it.description}`);
      } else if (it.institution || it.degree) {
        const head = [it.degree, it.field].filter(Boolean).join(' in ');
        lines.push(`- ${head}${it.institution ? ` — ${it.institution}` : ''}`);
        if (it.description) lines.push(`  ${it.description}`);
      } else if (it.name) {
        lines.push(`- ${it.name}${it.level ? ` (${it.level})` : ''}`);
      } else if (it.title) {
        lines.push(`- ${it.title}`);
        if (it.description) lines.push(`  ${it.description}`);
      }
    }
  }

  return lines.join('\n').trim();
}
