import { describe, it, expect } from 'vitest';
import { hasSampleContent, hasSampleSummary, isSampleItem, markEdited, stripSampleItems } from './sample-content';

const section = (id: string, type: string, items: any[]) => ({ id, type, title: type, isVisible: true, order: 0, items }) as any;
const SEEDED = 'Example summary text that the API seeded for this CV.';

describe('sample content', () => {
  const sections = [
    section('s1', 'experience', [{ id: 'e1', position: 'Senior Software Engineer', company: 'Tech Solutions Inc.', isSample: true }, { id: 'e2', position: 'My real job', company: 'Mine' }]),
    section('s2', 'skills', [{ id: 'k1', name: 'Go', isSample: true }]),
  ];

  it('recognises tagged items and the seeded summary', () => {
    expect(isSampleItem(sections[0], sections[0].items[0])).toBe(true);
    expect(isSampleItem(sections[0], sections[0].items[1])).toBe(false);
    const cv = { personalInfo: { summary: SEEDED }, sampleSummary: SEEDED } as any;
    expect(hasSampleSummary(cv)).toBe(true);
    expect(hasSampleSummary({ ...cv, personalInfo: { summary: 'My own words' } })).toBe(false);
    expect(hasSampleContent({ personalInfo: { summary: 'Mine' } } as any, sections)).toBe(true);
  });

  it('clears only example items, keeping the (now empty) sections', () => {
    expect(stripSampleItems(sections)).toEqual([
      { id: 's1', items: [sections[0].items[1]] },
      { id: 's2', items: [] },
    ]);
  });

  it('an edited example item becomes the user\'s own', () => {
    const edited = markEdited(sections[0], sections[0].items[0]);
    expect(edited.isSample).toBe(false);
    expect(isSampleItem(sections[0], edited)).toBe(false);
    // Non-sample items are returned untouched.
    expect(markEdited(sections[0], sections[0].items[1])).toBe(sections[0].items[1]);
  });

  it('recognises untagged example content from CVs created before tagging', () => {
    const legacy = section('s1', 'experience', [{ id: 'x', position: 'Software Developer', company: 'Digital Innovations Ltd.' }]);
    expect(isSampleItem(legacy, legacy.items[0])).toBe(true);
    const legacySummary = 'Results-driven professional with a strong background in delivering impactful solutions. Passionate about innovation, collaboration, and continuous improvement. Seeking opportunities to leverage expertise and contribute to organizational success.';
    expect(hasSampleSummary({ personalInfo: { summary: legacySummary } } as any)).toBe(true);
    // A single common skill is not treated as an example.
    const skills = section('k', 'skills', [{ id: '1', name: 'Python' }]);
    expect(isSampleItem(skills, skills.items[0])).toBe(false);
  });
});
