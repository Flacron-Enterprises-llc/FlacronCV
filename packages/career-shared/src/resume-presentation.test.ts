import { describe, expect, it } from 'vitest';
import {
  formatResumeDate,
  isResumeDatePart,
  resumeContactLine,
  resumeDisplayName,
  resumeSectionHeading,
  splitResumeLine,
} from './resume-presentation';

describe('resume presentation', () => {
  it('uses CV headings in the resume language instead of internal fact keys', () => {
    expect(resumeSectionHeading('skill', 'en')).toBe('Skills');
    expect(resumeSectionHeading('experience', 'fr')).toBe('Expérience professionnelle');
    expect(resumeSectionHeading('education', 'fr')).toBe('Formation');
    expect(resumeSectionHeading('summary', undefined)).toBe('Summary');
  });

  it('formats ISO months and present in each language and leaves typed text alone', () => {
    expect(formatResumeDate('2021-01', 'en')).toBe('Jan 2021');
    expect(formatResumeDate('2024-06', 'fr')).toBe('juin 2024');
    expect(formatResumeDate('2018', 'fr')).toBe('2018');
    expect(formatResumeDate('2021-01 – present', 'fr')).toBe('janv. 2021 – Aujourd’hui');
    expect(isResumeDatePart('Northbridge Civic Library')).toBe(false);
    expect(isResumeDatePart('2021-01')).toBe(true);
    expect(isResumeDatePart('2021 — present')).toBe(true);
    expect(isResumeDatePart('Q3 2021')).toBe(false);
  });

  it('splits a line wherever its dates are, keeping responsibilities after them', () => {
    expect(
      splitResumeLine('Programme coordinator · Northbridge Civic Library · Montreal · 2021-01 · 2024-06 · Led weekend catalogue clinics', 'en'),
    ).toEqual({
      title: 'Programme coordinator · Northbridge Civic Library · Montreal',
      dates: 'Jan 2021 – Jun 2024',
      detail: 'Led weekend catalogue clinics',
    });
    expect(splitResumeLine('B.A. Information studies · Université de Montréal · 2018', 'fr')).toEqual({
      title: 'B.A. Information studies · Université de Montréal',
      dates: '2018',
      detail: '',
    });
    expect(splitResumeLine('Cataloguing, records care', 'en')).toEqual({ title: 'Cataloguing, records care', dates: '', detail: '' });
  });

  it('heads the page with the contact name and does not repeat it in the contact line', () => {
    const body = {
      sections: [
        { factType: 'contact' as const, lines: [{ factId: 'c1', factType: 'contact' as const, text: 'Ada Review · ada@example.test · Montreal', uncertain: false }] },
      ],
    };
    expect(resumeDisplayName(body, 'Resume')).toBe('Ada Review');
    expect(resumeDisplayName(body, 'Resume', { c1: 'Ada R. Review · ada@example.test' })).toBe('Ada R. Review');
    expect(resumeDisplayName({ sections: [] }, 'Resume')).toBe('Resume');
    expect(resumeContactLine('Ada Review · ada@example.test · Montreal', 'Ada Review')).toBe('ada@example.test · Montreal');
  });
});
