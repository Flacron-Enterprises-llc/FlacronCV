import { describe, expect, it } from 'vitest';
import { composeResume } from './resume';
import { readabilityReport } from './readability';
import type { ResumeFactInput } from './resume';

const skill: ResumeFactInput = {
  id: 's1',
  factType: 'skill',
  value: { name: 'SQL' },
  confirmation: 'draft',
  uncertain: { name: { reason: 'not_found_in_source' } },
};

describe('readability', () => {
  it('lists parsing issues and does not score the resume or a job', () => {
    const report = readabilityReport(composeResume([skill], 'classic'));
    expect(report.label).toBe('flacroncv_readability');
    expect(report.issues.map((issue) => issue.code)).toEqual([
      'unconfirmed_version',
      'missing_section',
      'missing_section',
      'missing_section',
      'missing_section',
      'uncertain_line',
    ]);
    expect(report.issues.filter((issue) => issue.code === 'missing_section').map((issue) => issue.section)).toEqual([
      'contact',
      'summary',
      'experience',
      'education',
    ]);
    expect(JSON.stringify(report)).not.toContain('score');
    expect(JSON.stringify(report)).not.toContain('fit');
  });

  it('is quiet when the version is confirmed and the core sections are present', () => {
    const facts: ResumeFactInput[] = [
      { id: 'c', factType: 'contact', value: { fullName: 'Ada' }, confirmation: 'confirmed', uncertain: {} },
      { id: 'u', factType: 'summary', value: { text: 'Analyst' }, confirmation: 'confirmed', uncertain: {} },
      { id: 'e', factType: 'experience', value: { position: 'Analyst', company: 'Babbage' }, confirmation: 'confirmed', uncertain: {} },
      { id: 'd', factType: 'education', value: { institution: 'London' }, confirmation: 'confirmed', uncertain: {} },
      { id: 's', factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed', uncertain: {} },
    ];
    expect(readabilityReport(composeResume(facts, 'classic')).issues).toEqual([]);
  });
});