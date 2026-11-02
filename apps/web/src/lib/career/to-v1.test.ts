import { describe, expect, it } from 'vitest';
import type { FactForDocument, ResumeBody } from '@flacroncv/career-shared';
import { createV1CoverLetter, createV1Cv, planV1Cv, type V1Api } from './to-v1';

const facts: FactForDocument[] = [
  { id: 'f-contact', factType: 'contact', value: { fullName: 'Ada Example', email: 'ada@example.test', city: 'Lyon' } },
  { id: 'f-exp', factType: 'experience', value: { company: 'Fictional Co', position: 'Analyst', startDate: '2021-03' } },
  { id: 'f-skill', factType: 'skill', value: { name: 'SQL', category: 'Data' } },
  { id: 'f-lang', factType: 'language', value: { name: 'French', proficiency: 'Native' } },
];

const body: ResumeBody = {
  templateId: 'classic',
  confirmation: 'confirmed',
  sections: [
    { factType: 'contact', lines: [{ factId: 'f-contact', factType: 'contact', text: 'Ada Example', uncertain: false }] },
    { factType: 'summary', lines: [{ factId: 'summary', factType: 'summary', text: 'Analyst with data experience.', uncertain: false }] },
    { factType: 'experience', lines: [{ factId: 'f-exp', factType: 'experience', text: 'Analyst, Fictional Co', uncertain: false }] },
    { factType: 'skill', lines: [{ factId: 'f-skill', factType: 'skill', text: 'SQL (Data)', uncertain: false }] },
    { factType: 'language', lines: [{ factId: 'f-lang', factType: 'language', text: 'French (Native)', uncertain: false }] },
  ],
};

/** Records calls; mimics V1 seeding three sample sections on create. */
function fakeV1() {
  const calls: Array<[string, string, unknown?]> = [];
  const api: V1Api = {
    async get<T>(endpoint: string) {
      calls.push(['GET', endpoint]);
      return [
        { id: 's-exp', type: 'experience', title: 'Experience', order: 0 },
        { id: 's-edu', type: 'education', title: 'Education', order: 1 },
        { id: 's-skill', type: 'skills', title: 'Skills', order: 2 },
      ] as T;
    },
    async post<T>(endpoint: string, payload?: unknown) {
      calls.push(['POST', endpoint, payload]);
      return { id: endpoint === '/cvs' ? 'cv-1' : endpoint === '/cover-letters' ? 'cl-1' : 'x' } as T;
    },
    async put<T>(endpoint: string, payload?: unknown) {
      calls.push(['PUT', endpoint, payload]);
      return {} as T;
    },
    async delete<T>(endpoint: string) {
      calls.push(['DELETE', endpoint]);
      return null as T;
    },
  };
  return { api, calls };
}

describe('career draft -> V1 CV', () => {
  it('maps contact and summary to personal info and keeps only V1 fields', () => {
    const plan = planV1Cv(body, facts, 'Analyst CV', (type) => `T:${type}`);
    expect(plan.create).toEqual({
      title: 'Analyst CV',
      templateId: 'classic',
      personalInfo: { firstName: 'Ada', lastName: 'Example', email: 'ada@example.test', city: 'Lyon', summary: 'Analyst with data experience.' },
    });
    expect(plan.sections.map((section) => [section.type, section.title])).toEqual([
      ['experience', 'T:experience'],
      ['skills', 'T:skills'],
      ['languages', 'T:languages'],
    ]);
  });

  it('never states a skill level the person did not record', () => {
    const plan = planV1Cv(body, facts, 'CV', (type) => type);
    const skill = plan.sections.find((section) => section.type === 'skills')!.items[0];
    expect(skill).toMatchObject({ name: 'SQL', category: 'Data' });
    expect(skill).not.toHaveProperty('level');
  });

  it('creates through V1 endpoints: overwrites matching samples, removes the rest, adds new sections', async () => {
    const { api, calls } = fakeV1();
    const plan = planV1Cv(body, facts, 'CV', (type) => type);
    expect(await createV1Cv(api, plan)).toBe('cv-1');
    expect(calls.map(([method, endpoint]) => `${method} ${endpoint}`)).toEqual([
      'POST /cvs',
      'PUT /cvs/cv-1',
      'GET /cvs/cv-1/sections',
      'PUT /cvs/cv-1/sections/s-exp',
      'DELETE /cvs/cv-1/sections/s-edu',
      'PUT /cvs/cv-1/sections/s-skill',
      'POST /cvs/cv-1/sections',
    ]);
    expect(calls[1][2]).toEqual({
      personalInfo: { firstName: 'Ada', lastName: 'Example', email: 'ada@example.test', city: 'Lyon', summary: 'Analyst with data experience.' },
    });
    expect(calls[6][2]).toMatchObject({ type: 'languages', order: 2, isVisible: true });
  });

  it('clears the V1 sample summary when the draft has none', async () => {
    const { api, calls } = fakeV1();
    const noSummary = { ...body, sections: body.sections.filter((section) => section.factType !== 'summary') };
    await createV1Cv(api, planV1Cv(noSummary, facts, 'CV', (type) => type));
    expect((calls[1][2] as { personalInfo: { summary: string } }).personalInfo.summary).toBe('');
  });
});

describe('career letter -> V1 cover letter', () => {
  it('creates the letter, then stores the text as V1 letter HTML', async () => {
    const { api, calls } = fakeV1();
    expect(await createV1CoverLetter(api, { title: 'Letter', body: 'Dear team,\n\nI <3 data.' })).toBe('cl-1');
    expect(calls).toEqual([
      ['POST', '/cover-letters', { title: 'Letter' }],
      ['PUT', '/cover-letters/cl-1', { content: '<p>Dear team,</p><p>I &lt;3 data.</p>' }],
    ]);
  });
});
