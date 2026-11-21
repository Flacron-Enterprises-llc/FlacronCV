/**
 * How complete a CV is, as a 0–100 score plus the next steps that would raise
 * it most. Copy of apps/web/src/lib/cv-strength.ts (the original;
 * apps/mobile/src/lib/cv-strength-parity.test.ts keeps them identical).
 *
 * It measures completeness, not quality: it never reads the writing for
 * "good" or "bad", it only checks that the parts recruiters look for exist.
 * Pure function over a minimal structural shape so both apps' types fit.
 */

export interface StrengthPersonalInfo {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  headline?: string | null;
  summary?: string | null;
  linkedin?: string | null;
  website?: string | null;
  github?: string | null;
}

export interface StrengthSection {
  type: string;
  isVisible?: boolean;
  items: ReadonlyArray<Record<string, unknown>>;
}

export type StrengthTipKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'location'
  | 'headline'
  | 'summary'
  | 'summary_longer'
  | 'experience'
  | 'experience_details'
  | 'education'
  | 'skills'
  | 'skills_more'
  | 'links';

export interface StrengthTip {
  key: StrengthTipKey;
  /** Points this step adds. */
  points: number;
  /** Where to fix it: 'personal' or a section type. */
  target: 'personal' | 'experience' | 'education' | 'skills';
}

export interface CVStrength {
  score: number;
  /** 'starter' < 40 ≤ 'good' < 75 ≤ 'strong' < 100 = 'complete' */
  band: 'starter' | 'good' | 'strong' | 'complete';
  /** Missing steps, biggest gain first. */
  tips: StrengthTip[];
}

const filled = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

function visibleItems(sections: readonly StrengthSection[], type: string): ReadonlyArray<Record<string, unknown>> {
  // Untouched example items a template seeds (isSample: true) are not the person's own content.
  return sections
    .filter((s) => s.type === type && s.isVisible !== false)
    .flatMap((s) => s.items ?? [])
    .filter((item) => item.isSample !== true);
}

/** `sampleSummary`: the example summary a template seeded; an unchanged one does not count. */
export function cvStrength(
  personal: StrengthPersonalInfo | null | undefined,
  sections: readonly StrengthSection[],
  sampleSummary?: string | null,
): CVStrength {
  const p = personal ?? {};
  const tips: StrengthTip[] = [];
  let score = 0;
  const step = (done: boolean, points: number, key: StrengthTipKey, target: StrengthTip['target']) => {
    if (done) score += points;
    else tips.push({ key, points, target });
  };

  step(filled(p.firstName) && filled(p.lastName), 10, 'name', 'personal');
  step(filled(p.email), 10, 'email', 'personal');
  step(filled(p.phone), 5, 'phone', 'personal');
  step(filled(p.city) || filled(p.country) || filled(p.address), 5, 'location', 'personal');
  step(filled(p.headline), 10, 'headline', 'personal');

  const rawSummary = (p.summary ?? '').trim();
  const summary = sampleSummary && rawSummary === sampleSummary.trim() ? '' : rawSummary;
  if (summary.length >= 150) score += 15;
  else if (summary.length > 0) {
    score += 8;
    tips.push({ key: 'summary_longer', points: 7, target: 'personal' });
  } else tips.push({ key: 'summary', points: 15, target: 'personal' });

  const experience = visibleItems(sections, 'experience');
  const roles = experience.filter((e) => filled(e.position) && filled(e.company));
  step(roles.length > 0, 15, 'experience', 'experience');
  if (roles.length > 0) {
    const described = roles.some(
      (e) => filled(e.description) || (Array.isArray(e.highlights) && e.highlights.some((h) => filled(h))),
    );
    step(described, 5, 'experience_details', 'experience');
  }

  step(visibleItems(sections, 'education').some((e) => filled(e.institution) || filled(e.degree)), 10, 'education', 'education');

  const skills = visibleItems(sections, 'skills').filter((s) => filled(s.name)).length;
  if (skills >= 5) score += 10;
  else if (skills > 0) {
    score += 5;
    tips.push({ key: 'skills_more', points: 5, target: 'skills' });
  } else tips.push({ key: 'skills', points: 10, target: 'skills' });

  step(filled(p.linkedin) || filled(p.website) || filled(p.github), 5, 'links', 'personal');

  tips.sort((a, b) => b.points - a.points);
  const band = score >= 100 ? 'complete' : score >= 75 ? 'strong' : score >= 40 ? 'good' : 'starter';
  return { score, band, tips };
}
