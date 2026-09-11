import { describe, expect, it } from 'vitest';
import { CVSectionType, type CV, type CVSection } from '@flacroncv/shared-types';
import { serializeCVToText, CV_TEXT_DTO_MAX } from './serializeCV';

function makeCv(sectionOrder: string[]): CV {
  return {
    id: 'cv1',
    personalInfo: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      headline: 'Mathematician',
      summary: 'First programmer.',
    },
    sectionOrder,
  } as CV;
}

function section(
  id: string,
  type: CVSectionType,
  items: CVSection['items'],
): CVSection {
  return {
    id,
    type,
    title: type,
    isVisible: true,
    items,
  } as CVSection;
}

describe('serializeCVToText', () => {
  it('includes project description and technologies (not only the name)', () => {
    const text = serializeCVToText(makeCv(['p1']), [
      section('p1', CVSectionType.PROJECTS, [
        {
          id: 'i1',
          name: 'Analytical Engine',
          description: 'Notes on computation.',
          technologies: ['Math', 'Punch cards'],
          url: 'https://example.com',
        } as CVSection['items'][number],
      ]),
    ]);
    expect(text).toContain('Analytical Engine');
    expect(text).toContain('Notes on computation.');
    expect(text).toContain('Tech: Math, Punch cards');
    expect(text).toContain('https://example.com');
  });

  it('includes certification issuer and date', () => {
    const text = serializeCVToText(makeCv(['c1']), [
      section('c1', CVSectionType.CERTIFICATIONS, [
        {
          id: 'i1',
          name: 'AWS Solutions Architect',
          issuer: 'Amazon',
          date: '2024-01',
          expiryDate: '2027-01',
          credentialId: 'ABC',
        } as CVSection['items'][number],
      ]),
    ]);
    expect(text).toContain('AWS Solutions Architect');
    expect(text).toContain('Amazon');
    expect(text).toContain('2024-01');
    expect(text).toContain('expires 2027-01');
    expect(text).toContain('ABC');
  });

  it('includes language proficiency, not only the name', () => {
    const text = serializeCVToText(makeCv(['l1']), [
      section('l1', CVSectionType.LANGUAGES, [
        { id: 'i1', name: 'French', proficiency: 'fluent' } as CVSection['items'][number],
      ]),
    ]);
    expect(text).toContain('French (fluent)');
  });

  it('includes reference role and contact details', () => {
    const text = serializeCVToText(makeCv(['r1']), [
      section('r1', CVSectionType.REFERENCES, [
        {
          id: 'i1',
          name: 'Jane Smith',
          title: 'Engineering Manager',
          company: 'Acme',
          email: 'jane@example.com',
          phone: '555',
          relationship: 'Former manager',
        } as CVSection['items'][number],
      ]),
    ]);
    expect(text).toContain('Jane Smith — Engineering Manager, Acme');
    expect(text).toContain('Former manager');
    expect(text).toContain('jane@example.com');
    expect(text).toContain('555');
  });

  it('does not treat a project name as a skill-only line', () => {
    const text = serializeCVToText(makeCv(['p1']), [
      section('p1', CVSectionType.PROJECTS, [
        { id: 'i1', name: 'App', description: 'Shipped it.' } as CVSection['items'][number],
      ]),
    ]);
    expect(text).toMatch(/- App/);
    expect(text).toContain('Shipped it.');
  });

  it('truncates at the end to the DTO max (later sections first)', () => {
    const text = serializeCVToText(makeCv(['p1']), [
      section('p1', CVSectionType.PROJECTS, [
        {
          id: 'i1',
          name: 'App',
          description: 'x'.repeat(CV_TEXT_DTO_MAX + 1000),
        } as CVSection['items'][number],
      ]),
    ]);
    expect(text.length).toBe(CV_TEXT_DTO_MAX);
    expect(text.startsWith('Ada Lovelace')).toBe(true);
    expect(text).toContain('App');
  });
});
