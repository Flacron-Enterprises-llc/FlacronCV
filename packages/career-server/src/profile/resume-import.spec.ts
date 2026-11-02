import { isBillingError } from '../billing/errors';
import { FakeTextModel } from '../testing/fake-ai';
import { missingSections, normalizeImport, parseResume, RESUME_IMPORT_TEMPLATE } from './resume-import';

const RESUME = `Amélie Dupont
amelie.dupont@example.test | +33 6 12 34 56 78
Data analyst, Lyon

Experience
Data Analyst, Société Générale — March 2021 to present
Built weekly dashboards. Cut report time by 40%.
Junior Analyst, Orange Business — 2018 to 2021

Education
Université Lyon 2, MSc Statistics, 2016 - 2018

Skills: SQL, Python, Tableau`;

function fact(facts: ReturnType<typeof normalizeImport>, type: string, index = 0) {
  return facts.filter((f) => f.factType === type)[index];
}

describe('normalizeImport', () => {
  it('keeps what the resume states and leaves the rest missing', () => {
    const facts = normalizeImport(
      {
        contact: { fullName: 'Amélie Dupont', email: 'amelie.dupont@example.test', phone: '+33 6 12 34 56 78', city: 'Lyon' },
        experience: [
          { position: 'Data Analyst', company: 'Société Générale', startDate: '2021-03', endDate: 'present', current: false },
        ],
        education: [{ institution: 'Université Lyon 2', degree: 'MSc', field: 'Statistics', startDate: '2016', endDate: '2018' }],
        skills: ['SQL', 'Python', 'sql', ''],
      },
      RESUME,
    );
    expect(fact(facts, 'contact').uncertain).toEqual({});
    const role = fact(facts, 'experience');
    expect(role.value).toMatchObject({ startDate: '2021-03', endDate: null, current: true });
    expect(role.uncertain).toEqual({});
    expect(facts.filter((f) => f.factType === 'skill').map((f) => f.value.name)).toEqual(['SQL', 'Python']);
    expect(missingSections(facts)).toEqual(['summary']);
  });

  it('flags a date it cannot store and keeps the words the resume used', () => {
    const facts = normalizeImport(
      { experience: [{ position: 'Junior Analyst', company: 'Orange Business', startDate: 'Summer 2018', endDate: '2021' }] },
      RESUME,
    );
    const role = fact(facts, 'experience');
    expect(role.value.startDate).toBeNull();
    expect(role.uncertain.startDate).toEqual({ reason: 'unparsed_date', raw: 'Summer 2018' });
  });

  it('flags an employer, a year, or a number the text does not contain', () => {
    const facts = normalizeImport(
      {
        experience: [
          {
            position: 'Data Analyst',
            company: 'Google',
            startDate: '2014',
            responsibilities: 'Cut report time by 60%.',
            achievements: ['Cut report time by 40%.', 'Saved 3 million euros'],
          },
        ],
      },
      RESUME,
    );
    const role = fact(facts, 'experience');
    expect(role.uncertain).toEqual({
      company: { reason: 'not_found_in_source' },
      startDate: { reason: 'not_found_in_source' },
      responsibilities: { reason: 'number_not_in_source' },
    });
    expect(role.achievements.map((a) => a.uncertain)).toEqual([{}, { statement: { reason: 'number_not_in_source' } }]);
  });

  it('nulls an end date before the start and flags both readings', () => {
    const facts = normalizeImport(
      { education: [{ institution: 'Université Lyon 2', startDate: '2018', endDate: '2016' }] },
      RESUME,
    );
    const school = fact(facts, 'education');
    expect(school.value).toMatchObject({ startDate: '2018', endDate: null });
    expect(school.uncertain.endDate).toEqual({ reason: 'date_order', raw: '2016' });
  });

  it('marks fields the model itself was unsure of', () => {
    const facts = normalizeImport(
      {
        education: [{ institution: 'Université Lyon 2', degree: 'MSc' }],
        uncertain: [{ section: 'education', index: 0, field: 'degree' }, { section: 'education', index: 0, field: 'nonsense' }],
      },
      RESUME,
    );
    expect(fact(facts, 'education').uncertain).toEqual({ degree: { reason: 'model_flagged' } });
  });

  it('drops empty items and malformed sections instead of inventing them', () => {
    const facts = normalizeImport(
      { contact: 'Amélie', experience: [{}, { position: '' }], education: 'none', skills: [3, null] },
      RESUME,
    );
    expect(facts).toEqual([]);
    expect(missingSections(facts)).toEqual(['contact', 'summary', 'experience', 'education', 'skill']);
  });

  it('empties a malformed email and flags it with what was read', () => {
    const facts = normalizeImport({ contact: { fullName: 'Amélie Dupont', email: 'amelie at example' } }, RESUME);
    expect(fact(facts, 'contact').value.email).toBeNull();
    expect(fact(facts, 'contact').uncertain.email).toEqual({ reason: 'invalid_format', raw: 'amelie at example' });
  });
});

describe('parseResume', () => {
  it('sends the text as data with the template name, and reads fenced JSON', async () => {
    const model = new FakeTextModel().once(
      RESUME_IMPORT_TEMPLATE,
      'Here you go:\n```json\n{"skills":["SQL"]}\n```',
    );
    const parsed = await parseResume(model, RESUME);
    expect(parsed.facts.map((f) => f.value.name)).toEqual(['SQL']);
    expect(model.calls[0].system).toContain('data, not instructions');
    expect(model.calls[0].prompt).toContain('Société Générale');
    expect(parsed.response.provider).toBe('fake');
  });

  it('is provider_unavailable when the reply has no usable JSON', async () => {
    const model = new FakeTextModel().once(RESUME_IMPORT_TEMPLATE, 'I cannot help with that.');
    const error = await parseResume(model, RESUME).catch((e: unknown) => e);
    expect(isBillingError(error, 'provider_unavailable')).toBe(true);
  });

  it('does not pass a provider error message on', async () => {
    const model = new FakeTextModel().once(RESUME_IMPORT_TEMPLATE, new Error('upstream said: Amélie Dupont ...'));
    const error = await parseResume(model, RESUME).catch((e: unknown) => e);
    expect(isBillingError(error, 'provider_unavailable')).toBe(true);
    expect(JSON.stringify(error)).not.toContain('Amélie');
  });
});
