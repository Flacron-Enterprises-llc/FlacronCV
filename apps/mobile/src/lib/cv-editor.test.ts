import { beforeEach, describe, expect, it } from 'vitest';
import {
  ADDABLE_SECTION_TYPES,
  appendOrder,
  buildCertificationItem,
  buildCustomItem,
  buildCvRootUpdate,
  buildNewSection,
  buildSectionCreate,
  buildSectionUpdate,
  CV_TITLE_MAX,
  CV_TITLE_REQUIRED,
  CV_TITLE_TOO_LONG,
  customItemTitle,
  formatHighlights,
  isStandardSectionType,
  moveSectionId,
  nonStandardSections,
  parseHighlights,
  planSectionSave,
  SECTION_TITLE_REQUIRED,
  sectionsOfType,
  shouldRecreateSection,
  validateCvTitle,
  validateSectionTitle,
} from './cv-editor';
import { useCVStore } from '../store/cv-store';
import { CV, CVSection } from '../types/cv.types';
import { CVSectionType, CVStatus, FontSize, Spacing } from '../types/enums';

const NOW = '2026-01-01T00:00:00.000Z';

function section(id: string, type: CVSectionType, order = 0, isVisible = true): CVSection {
  return { id, type, title: id, isVisible, order, items: [], createdAt: NOW, updatedAt: NOW };
}

function makeCv(): CV {
  return {
    id: 'cv1',
    userId: 'u1',
    title: 'My CV',
    slug: 'my-cv',
    templateId: 'modern',
    status: CVStatus.DRAFT,
    isPublic: false,
    publicSlug: null,
    personalInfo: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '1',
      address: '1 Analytical St',
      postalCode: 'AB1 2CD',
      photoURL: 'https://example.com/p.jpg',
    },
    sectionOrder: ['a', 'b', 'c'],
    styling: {
      primaryColor: '#123456',
      fontFamily: 'Inter',
      fontSize: FontSize.MEDIUM,
      spacing: Spacing.NORMAL,
      showPhoto: true,
      layout: 'sidebar',
    },
    version: 1,
    lastAutoSavedAt: NOW,
    aiGenerated: false,
    aiProvider: null,
    viewCount: 0,
    downloadCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

describe('validateCvTitle', () => {
  it('requires a non-blank title and trims it', () => {
    expect(validateCvTitle('')).toEqual({ ok: false, error: CV_TITLE_REQUIRED });
    expect(validateCvTitle('   ')).toEqual({ ok: false, error: CV_TITLE_REQUIRED });
    expect(validateCvTitle(undefined)).toEqual({ ok: false, error: CV_TITLE_REQUIRED });
    expect(validateCvTitle('  Data Analyst CV  ')).toEqual({ ok: true, title: 'Data Analyst CV' });
  });

  it('caps at the DTO MaxLength of 200 after trimming', () => {
    expect(validateCvTitle('x'.repeat(CV_TITLE_MAX))).toEqual({ ok: true, title: 'x'.repeat(200) });
    expect(validateCvTitle(` ${'x'.repeat(CV_TITLE_MAX)} `).ok).toBe(true);
    expect(validateCvTitle('x'.repeat(CV_TITLE_MAX + 1))).toEqual({ ok: false, error: CV_TITLE_TOO_LONG });
  });

  it('section titles follow AddSectionDto (non-blank, ≤200)', () => {
    expect(validateSectionTitle(' ')).toEqual({ ok: false, error: SECTION_TITLE_REQUIRED });
    expect(validateSectionTitle(' Awards ')).toEqual({ ok: true, title: 'Awards' });
    expect(validateSectionTitle('y'.repeat(201)).ok).toBe(false);
  });
});

describe('section helpers', () => {
  it('lists the same addable types as the web, custom last', () => {
    expect(ADDABLE_SECTION_TYPES.map((t) => t.type)).toEqual([
      'experience', 'education', 'skills', 'projects', 'certifications', 'languages', 'references', 'custom',
    ]);
    expect(ADDABLE_SECTION_TYPES[7].label).toBe('Custom Section');
  });

  it('splits standard and non-standard sections', () => {
    const list = [
      section('e1', CVSectionType.EXPERIENCE),
      section('c1', CVSectionType.CUSTOM),
      section('aw', CVSectionType.AWARDS),
      section('e2', CVSectionType.EXPERIENCE),
    ];
    expect(sectionsOfType(list, CVSectionType.EXPERIENCE).map((s) => s.id)).toEqual(['e1', 'e2']);
    expect(nonStandardSections(list).map((s) => s.id)).toEqual(['c1', 'aw']);
    expect(isStandardSectionType('custom')).toBe(false);
    expect(isStandardSectionType('references')).toBe(true);
  });

  it('moves one place up/down and refuses impossible moves', () => {
    expect(moveSectionId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveSectionId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveSectionId(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(moveSectionId(['a', 'b', 'c'], 'c', 1)).toBeNull();
    expect(moveSectionId(['a', 'b', 'c'], 'z', 1)).toBeNull();
  });

  it('builds a new visible empty section with a DTO-valid order', () => {
    const s = buildNewSection('id1', CVSectionType.CUSTOM, 'Volunteering', 5, NOW);
    expect(s).toEqual({
      id: 'id1', type: 'custom', title: 'Volunteering', isVisible: true, order: 5, items: [],
      createdAt: NOW, updatedAt: NOW,
    });
    expect(buildNewSection('x', CVSectionType.CUSTOM, 't', 5000, NOW).order).toBe(1000);
    expect(appendOrder([section('a', CVSectionType.SKILLS)])).toBe(1);
  });
});

describe('item builders', () => {
  it('parses highlights one per line, strips bullets, caps at 50', () => {
    expect(parseHighlights('- Led team\n\n• Shipped v2\r\n  * Cut costs  ')).toEqual(['Led team', 'Shipped v2', 'Cut costs']);
    expect(parseHighlights('')).toEqual([]);
    expect(parseHighlights(Array.from({ length: 60 }, (_, i) => `h${i}`).join('\n'))).toHaveLength(50);
    expect(formatHighlights(['a', ' ', 'b'])).toBe('a\nb');
    expect(formatHighlights(undefined)).toBe('');
  });

  it('certification keeps unknown keys, stores blank expiry as null, saves url', () => {
    const item = buildCertificationItem(
      'c1',
      { id: 'c1', name: 'old', issuer: 'old', date: 'old', order: 3 },
      { name: ' AWS ', issuer: 'Amazon', date: '2024-01', expiryDate: '', credentialId: 'X', url: ' aws.com ' },
    );
    expect(item).toEqual({
      id: 'c1', name: 'AWS', issuer: 'Amazon', date: '2024-01', expiryDate: null, credentialId: 'X', url: 'aws.com', order: 3,
    });
    expect(buildCertificationItem('c2', null, { name: 'n', issuer: 'i', date: 'd', expiryDate: '2027-01' }).expiryDate).toBe('2027-01');
  });

  it('custom items write title+name; subtitle/date only for CUSTOM', () => {
    expect(buildCustomItem('i1', 'custom', null, { title: ' Award ', subtitle: 'Gold', date: '2023', description: 'x' })).toEqual({
      id: 'i1', title: 'Award', name: 'Award', subtitle: 'Gold', date: '2023', description: 'x',
    });
    expect(buildCustomItem('i2', 'awards', null, { title: 'Prize', subtitle: 'ignored', description: '' })).toEqual({
      id: 'i2', title: 'Prize', name: 'Prize', description: '',
    });
    expect(customItemTitle({ id: 'x', name: 'Only name' } as never)).toBe('Only name');
  });
});

describe('save payloads', () => {
  it('root update sends web autosave keys but only showPhoto from styling', () => {
    const body = buildCvRootUpdate(makeCv());
    expect(Object.keys(body).sort()).toEqual(['personalInfo', 'sectionOrder', 'styling', 'title']);
    expect(body.styling).toEqual({ showPhoto: true });
    expect(body.personalInfo).toMatchObject({ address: '1 Analytical St', postalCode: 'AB1 2CD' });
  });

  it('section create/update bodies match AddSectionDto / UpdateSectionDto', () => {
    const s = { ...section('s1', CVSectionType.CUSTOM, 2, false), title: 'Hobbies' };
    expect(buildSectionCreate(s)).toEqual({ id: 's1', type: 'custom', title: 'Hobbies', order: 2, isVisible: false, items: [] });
    expect(buildSectionUpdate(s)).toEqual({ title: 'Hobbies', isVisible: false, items: [], order: 2 });
  });

  it('plans POST / PUT / DELETE like the web', () => {
    const plan = planSectionSave([section('new', CVSectionType.CUSTOM), section('kept', CVSectionType.SKILLS)], ['kept', 'gone']);
    expect(plan.create.map((s) => s.id)).toEqual(['new']);
    expect(plan.update.map((s) => s.id)).toEqual(['kept']);
    expect(plan.remove).toEqual(['gone']);
    expect(shouldRecreateSection(404)).toBe(true);
    expect(shouldRecreateSection(500)).toBe(true);
    expect(shouldRecreateSection(400)).toBe(false);
    expect(shouldRecreateSection(undefined)).toBe(false);
  });
});

describe('cv-store editor actions', () => {
  beforeEach(() => {
    useCVStore.getState().reset();
    useCVStore.getState().setCV(makeCv());
    useCVStore.getState().setSections([
      section('a', CVSectionType.EXPERIENCE, 0),
      section('b', CVSectionType.SKILLS, 1),
      section('c', CVSectionType.CUSTOM, 2),
    ]);
  });

  it('moveSection reorders the list, order values and sectionOrder', () => {
    useCVStore.getState().moveSection('c', -1);
    const st = useCVStore.getState();
    expect(st.sections.map((s) => s.id)).toEqual(['a', 'c', 'b']);
    expect(st.sections.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(st.cv?.sectionOrder).toEqual(['a', 'c', 'b']);
    expect(st.isDirty).toBe(true);
  });

  it('moveSection at the edge is a no-op', () => {
    useCVStore.getState().moveSection('a', -1);
    expect(useCVStore.getState().isDirty).toBe(false);
  });

  it('updateTitle marks dirty; applySavedTitle does not', () => {
    useCVStore.getState().applySavedTitle('Renamed');
    expect(useCVStore.getState().cv?.title).toBe('Renamed');
    expect(useCVStore.getState().isDirty).toBe(false);
    useCVStore.getState().updateTitle('Edited');
    expect(useCVStore.getState().cv?.title).toBe('Edited');
    expect(useCVStore.getState().isDirty).toBe(true);
  });
});
