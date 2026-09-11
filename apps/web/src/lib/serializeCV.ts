import { CVSectionType, type CV, type CVSection } from '@flacroncv/shared-types';

/** AtsCheckDto / InterviewPrepDto / LinkedinOptimizeDto / cover-letter candidateSummary MaxLength. */
export const CV_TEXT_DTO_MAX = 50000;

/**
 * Flatten a CV + its sections into plain text for POST /ai/ats-check,
 * interview-prep, LinkedIn optimize, and cover-letter candidateSummary.
 * Visible sections only, ordered by `sectionOrder`. Truncated at the end to
 * CV_TEXT_DTO_MAX (later sections drop first), same as mobile clampDto.
 */
export function serializeCVToText(cv: CV, sections: CVSection[]): string {
  const p = cv.personalInfo;
  const lines: string[] = [];

  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();
  if (name) lines.push(name);
  if (p?.headline) lines.push(String(p.headline));
  if (p?.summary) lines.push(`\nSummary:\n${p.summary}`);

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
      if (typeof item === 'string') {
        lines.push(`- ${item}`);
        continue;
      }
      if (item == null || typeof item !== 'object') continue;
      lines.push(...serializeItem(section.type, item as unknown as Record<string, unknown>));
    }
  }

  return clampCvTextForDto(lines.join('\n').trim());
}

function clampCvTextForDto(text: string): string {
  return text.length <= CV_TEXT_DTO_MAX ? text : text.slice(0, CV_TEXT_DTO_MAX);
}

function text(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function dateRange(start: unknown, end: unknown, isCurrent?: unknown): string {
  const from = text(start);
  const to = isCurrent ? 'Present' : text(end);
  if (!from && !to) return '';
  return ` (${from} - ${to || 'Present'})`;
}

function serializeItem(type: string, it: Record<string, unknown>): string[] {
  const out: string[] = [];

  switch (type) {
    case CVSectionType.EXPERIENCE: {
      const head = [text(it.position), text(it.company)].filter(Boolean).join(' at ');
      if (head) out.push(`- ${head}${dateRange(it.startDate, it.endDate, it.isCurrent)}`);
      if (text(it.location)) out.push(`  ${text(it.location)}`);
      if (text(it.description)) out.push(`  ${text(it.description)}`);
      const highlights = Array.isArray(it.highlights)
        ? it.highlights.map(text).filter(Boolean)
        : [];
      for (const h of highlights) out.push(`  - ${h}`);
      break;
    }
    case CVSectionType.EDUCATION: {
      const head = [text(it.degree), text(it.field)].filter(Boolean).join(' in ');
      const inst = text(it.institution);
      out.push(`- ${head}${inst ? ` — ${inst}` : ''}${dateRange(it.startDate, it.endDate)}`);
      if (text(it.location)) out.push(`  ${text(it.location)}`);
      if (text(it.gpa)) out.push(`  GPA: ${text(it.gpa)}`);
      if (text(it.description)) out.push(`  ${text(it.description)}`);
      break;
    }
    case CVSectionType.SKILLS: {
      const name = text(it.name);
      if (!name) break;
      const extras = [text(it.level), text(it.category)].filter(Boolean);
      out.push(`- ${extras.length ? `${name} (${extras.join(', ')})` : name}`);
      break;
    }
    case CVSectionType.PROJECTS: {
      const name = text(it.name) || text(it.title);
      if (name) out.push(`- ${name}${dateRange(it.startDate, it.endDate)}`);
      if (text(it.description)) out.push(`  ${text(it.description)}`);
      const tech = Array.isArray(it.technologies)
        ? it.technologies.map(text).filter(Boolean)
        : [];
      if (tech.length) out.push(`  Tech: ${tech.join(', ')}`);
      if (text(it.url)) out.push(`  ${text(it.url)}`);
      break;
    }
    case CVSectionType.CERTIFICATIONS: {
      const name = text(it.name) || text(it.title);
      const issuer = text(it.issuer);
      const dated = text(it.date);
      const expiry = text(it.expiryDate);
      const meta = [issuer, dated, expiry ? `expires ${expiry}` : ''].filter(Boolean).join(', ');
      if (name) out.push(`- ${name}${meta ? ` (${meta})` : ''}`);
      if (text(it.credentialId)) out.push(`  Credential: ${text(it.credentialId)}`);
      if (text(it.url)) out.push(`  ${text(it.url)}`);
      break;
    }
    case CVSectionType.LANGUAGES: {
      const name = text(it.name);
      if (!name) break;
      const proficiency = text(it.proficiency) || text(it.level);
      out.push(`- ${proficiency ? `${name} (${proficiency})` : name}`);
      break;
    }
    case CVSectionType.REFERENCES: {
      const name = text(it.name);
      const role = [text(it.title), text(it.company)].filter(Boolean).join(', ');
      if (name) out.push(`- ${name}${role ? ` — ${role}` : ''}`);
      if (text(it.relationship)) out.push(`  ${text(it.relationship)}`);
      const contact = [text(it.email), text(it.phone)].filter(Boolean).join(', ');
      if (contact) out.push(`  ${contact}`);
      break;
    }
    default: {
      if (text(it.name)) {
        out.push(`- ${text(it.name)}${text(it.level) ? ` (${text(it.level)})` : ''}`);
      } else if (text(it.title)) {
        out.push(`- ${text(it.title)}`);
      }
      if (text(it.subtitle)) out.push(`  ${text(it.subtitle)}`);
      if (text(it.date)) out.push(`  ${text(it.date)}`);
      if (text(it.description)) out.push(`  ${text(it.description)}`);
    }
  }

  return out;
}
