import { describe, expect, it } from 'vitest';
import { serializeCVToText } from './serialize-cv';
import { CV, CVSection } from '../types/cv.types';
import { CVSectionType, CVStatus, FontSize, Spacing } from '../types/enums';

function makeCv(sectionOrder: string[]): CV {
  return {
    id: 'cv1',
    userId: 'u1',
    title: 'Test',
    slug: 'test',
    templateId: 'modern',
    status: CVStatus.DRAFT,
    isPublic: false,
    publicSlug: null,
    personalInfo: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '',
      headline: 'Mathematician',
      summary: 'First programmer.',
    },
    sectionOrder,
    styling: {
      primaryColor: '#000',
      fontFamily: 'Inter',
      fontSize: FontSize.MEDIUM,
      spacing: Spacing.NORMAL,
      showPhoto: false,
    },
    version: 1,
    lastAutoSavedAt: '',
    aiGenerated: false,
    aiProvider: null,
    viewCount: 0,
    downloadCount: 0,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  };
}

function section(
  id: string,
  type: CVSectionType,
  items: CVSection['items'],
  title?: string,
): CVSection {
  return {
    id,
    type,
    title: title ?? type,
    isVisible: true,
    order: 0,
    items,
    createdAt: '',
    updatedAt: '',
  };
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
        },
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
        },
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
        { id: 'i1', name: 'French', proficiency: 'fluent' },
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
        },
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
        { id: 'i1', name: 'App', description: 'Shipped it.' },
      ]),
    ]);
    expect(text).toMatch(/- App/);
    expect(text).toContain('Shipped it.');
    expect(text).not.toMatch(/- App \(beginner\)/);
  });
});
