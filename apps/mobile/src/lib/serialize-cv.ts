import { CV, CVSection } from '../types/cv.types';

/**
 * Flatten a CV + sections into plain text for POST /ai/ats-check and
 * POST /ai/interview-prep. Same shape as web `serializeCVToText`: visible
 * sections only, ordered by `sectionOrder`.
 */
export function serializeCVToText(cv: CV, sections: CVSection[]): string {
  const p = cv.personalInfo ?? ({} as CV['personalInfo']);
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
      const it = item as unknown as Record<string, unknown>;
      if (it == null) continue;
      if (it.position || it.company) {
        const head = [it.position, it.company].filter(Boolean).join(' at ');
        const dates =
          it.startDate || it.endDate
            ? ` (${it.startDate || ''} - ${it.endDate || 'Present'})`
            : '';
        lines.push(`- ${head}${dates}`);
        if (it.description) lines.push(`  ${String(it.description)}`);
      } else if (it.institution || it.degree) {
        const head = [it.degree, it.field].filter(Boolean).join(' in ');
        lines.push(`- ${head}${it.institution ? ` — ${it.institution}` : ''}`);
        if (it.description) lines.push(`  ${String(it.description)}`);
      } else if (it.name) {
        lines.push(`- ${it.name}${it.level ? ` (${it.level})` : ''}`);
      } else if (it.title) {
        lines.push(`- ${it.title}`);
        if (it.description) lines.push(`  ${String(it.description)}`);
      }
    }
  }

  return lines.join('\n').trim();
}
