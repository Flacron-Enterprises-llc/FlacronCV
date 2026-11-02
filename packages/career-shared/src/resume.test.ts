import { describe, expect, it } from 'vitest';
import {
  applyModelOrder,
  applyModelOrderKeepingRequired,
  composeResume,
  factLineText,
  generateProfileReady,
  isResumeTemplateId,
  keptGenerateFactIds,
  patchResumeBody,
  resumeLayoutOf,
  resumePlainLines,
} from './resume';
import type { ResumeFactInput } from './resume';

const skill: ResumeFactInput = {
  id: 's1',
  factType: 'skill',
  value: { name: 'SQL', category: 'Data' },
  confirmation: 'confirmed',
  uncertain: {},
};

const draftRole: ResumeFactInput = {
  id: 'e1',
  factType: 'experience',
  value: { position: 'Analyst', company: 'Babbage', experienceFactId: 'ignored' },
  confirmation: 'draft',
  uncertain: { company: { reason: 'not_found_in_source' } },
};

describe('resume body', () => {
  it('writes a line from the fact fields and skips reference ids', () => {
    expect(factLineText('experience', draftRole.value)).toBe('Analyst · Babbage');
    expect(factLineText('skill', { name: 'SQL' })).toBe('SQL');
  });

  it('keeps a skill category or language level inside its item, so inline lists stay readable', () => {
    expect(factLineText('skill', { name: 'SQL', category: 'Data' })).toBe('SQL (Data)');
    expect(factLineText('language', { name: 'Français', proficiency: 'Natif' })).toBe('Français (Natif)');
    expect(factLineText('language', { name: 'English', proficiency: '  ' })).toBe('English');
  });

  it('keeps a draft fact on the resume and marks the line uncertain', () => {
    const body = composeResume([skill, draftRole], 'classic');
    expect(body.confirmation).toBe('draft');
    expect(body.sections.map((section) => section.factType)).toEqual(['experience', 'skill']);
    expect(body.sections[0]?.lines[0]).toMatchObject({ text: 'Analyst · Babbage', uncertain: true });
    expect(body.sections[1]?.lines[0]).toMatchObject({ text: 'SQL (Data)', uncertain: false });
  });

  it('drops an id the model invented and keeps the fact text', () => {
    const body = applyModelOrder(composeResume([skill, draftRole], 'classic'), ['missing', 's1']);
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0]?.lines[0]?.text).toBe('SQL (Data)');
    expect(JSON.stringify(body)).not.toContain('missing');
  });

  it('lets the person edit one line and confirm the version', () => {
    const body = composeResume([draftRole], 'sidebar');
    const edited = patchResumeBody(body, { lines: [{ factId: 'e1', text: 'Analyst, Babbage & Co' }] });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.body.sections[0]?.lines[0]).toMatchObject({ text: 'Analyst, Babbage & Co', uncertain: false });
    expect(edited.body.confirmation).toBe('draft');
    const confirmed = patchResumeBody(edited.body, { confirmation: 'confirmed', templateId: 'compact' });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.body.confirmation).toBe('confirmed');
    expect(confirmed.body.templateId).toBe('compact');
    const refused = patchResumeBody(confirmed.body, { lines: [{ factId: 'other', text: 'Invented employer' }] });
    expect(refused).toEqual({ ok: false, field: 'other', reason: 'not_on_version' });
  });

  it('keeps the original five layouts and accepts migrated V1 catalog ids', () => {
    expect(isResumeTemplateId('classic')).toBe(true);
    expect(isResumeTemplateId('sidebar')).toBe(true);
    expect(isResumeTemplateId('modern')).toBe(true);
    expect(isResumeTemplateId('two-column')).toBe(true);
    expect(isResumeTemplateId('editorial')).toBe(true);
    expect(isResumeTemplateId('structured')).toBe(true);
    expect(resumeLayoutOf('modern')).toBe('sidebar');
    expect(resumeLayoutOf('professional')).toBe('topbar');
    expect(resumeLayoutOf('editorial')).toBe('editorial');
    expect(resumeLayoutOf('structured')).toBe('structured');
  });

  it('puts confirmed contact and experience back when the model omits them', () => {
    const contact: ResumeFactInput = {
      id: 'c1',
      factType: 'contact',
      value: { fullName: 'Ada Lovelace', email: 'ada@example.test', city: 'Montreal' },
      confirmation: 'confirmed',
      uncertain: {},
    };
    const role: ResumeFactInput = {
      id: 'e2',
      factType: 'experience',
      value: { position: 'Cataloguer', company: 'Northwind', startDate: '2019-03', endDate: '2024-06' },
      confirmation: 'confirmed',
      uncertain: {},
    };
    const drafted = composeResume([contact, role, skill], 'classic');
    const kept = applyModelOrderKeepingRequired(drafted, ['s1'], keptGenerateFactIds([contact, role, skill]));
    expect(kept.sections.map((section) => section.factType)).toEqual(['contact', 'experience', 'skill']);
    expect(kept.sections.flatMap((section) => section.lines.map((line) => line.text)).join('\n')).toContain('Ada Lovelace');
    expect(kept.sections.flatMap((section) => section.lines.map((line) => line.text)).join('\n')).toContain('Northwind');
    expect(generateProfileReady([skill])).toEqual({
      ok: false,
      field: 'facts',
      reason: 'need_experience_or_education',
    });
    expect(generateProfileReady([role, skill]).ok).toBe(true);
  });

  it('adds the free-plan line only when asked', () => {
    const body = composeResume([skill], 'classic');
    expect(resumePlainLines(body, false).join('\n')).not.toContain('FlacronCV');
    expect(resumePlainLines(body, true).join('\n')).toContain('Prepared with FlacronCV');
  });
});
