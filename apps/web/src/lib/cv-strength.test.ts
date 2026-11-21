import { describe, expect, it } from 'vitest';
import { cvStrength } from './cv-strength';

const full = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+44 20 0000 0000',
  city: 'London',
  headline: 'Analytical Engine Programmer',
  summary: 'x'.repeat(160),
  linkedin: 'linkedin.com/in/ada',
};
const sections = [
  { type: 'experience', items: [{ position: 'Analyst', company: 'Babbage & Co', description: 'Wrote the first algorithm.' }] },
  { type: 'education', items: [{ institution: 'Home tutoring', degree: 'Mathematics' }] },
  { type: 'skills', items: ['Maths', 'Logic', 'Writing', 'Translation', 'Notation'].map((name) => ({ name })) },
];

describe('cvStrength', () => {
  it('is 0 / starter for an empty CV, with the biggest gains first', () => {
    const s = cvStrength(null, []);
    expect(s.score).toBe(0);
    expect(s.band).toBe('starter');
    expect(s.tips[0]!.points).toBeGreaterThanOrEqual(s.tips.at(-1)!.points);
    expect(s.tips.map((t) => t.key)).toContain('summary');
  });

  it('is 100 / complete when every part recruiters look for is there', () => {
    const s = cvStrength(full, sections);
    expect(s).toEqual({ score: 100, band: 'complete', tips: [] });
  });

  it('gives partial credit and a specific next step for a short summary and few skills', () => {
    const s = cvStrength({ ...full, summary: 'Short.' }, [sections[0]!, sections[1]!, { type: 'skills', items: [{ name: 'Maths' }] }]);
    expect(s.score).toBe(100 - 7 - 5);
    expect(s.tips.map((t) => t.key)).toEqual(['summary_longer', 'skills_more']);
  });

  it('ignores hidden sections and blank items', () => {
    const s = cvStrength(full, [
      { type: 'experience', isVisible: false, items: [{ position: 'A', company: 'B', description: 'C' }] },
      { type: 'education', items: [{ institution: '  ', degree: '' }] },
      { type: 'skills', items: [{ name: '' }] },
    ]);
    expect(s.tips.map((t) => t.key)).toEqual(expect.arrayContaining(['experience', 'education', 'skills']));
  });

  it('asks for role details only once a role exists', () => {
    const noDetails = cvStrength(full, [{ type: 'experience', items: [{ position: 'A', company: 'B' }] }, sections[1]!, sections[2]!]);
    expect(noDetails.tips.map((t) => t.key)).toEqual(['experience_details']);
    const highlights = cvStrength(full, [{ type: 'experience', items: [{ position: 'A', company: 'B', highlights: ['Led X'] }] }, sections[1]!, sections[2]!]);
    expect(highlights.score).toBe(100);
  });

  it('does not count a template’s untouched example content', () => {
    const seeded = [
      { type: 'experience', items: [{ position: 'Engineer', company: 'Example Co', description: 'x', isSample: true }] },
      { type: 'education', items: [{ institution: 'Example U', degree: 'BSc', isSample: true }] },
      { type: 'skills', items: ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name, isSample: true })) },
    ];
    const s = cvStrength({ ...full, summary: 'Seeded example summary that is long enough to count. '.repeat(4) }, seeded, 'Seeded example summary that is long enough to count. '.repeat(4));
    expect(s.tips.map((t) => t.key)).toEqual(expect.arrayContaining(['summary', 'experience', 'education', 'skills']));
    // Edited items (isSample: false) are the person's own again.
    const edited = seeded.map((sec) => ({ ...sec, items: sec.items.map((i) => ({ ...i, isSample: false })) }));
    expect(cvStrength(full, edited).score).toBe(100);
  });
});
