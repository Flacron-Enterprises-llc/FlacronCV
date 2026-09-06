import { describe, it, expect } from 'vitest';
import { CV_CAPTURE_TEMPLATE_IDS, getTemplateStyling } from './cv-template-styling';
import {
  SAMPLE_SECTIONS,
  SAMPLE_PHOTO_DATA_URI,
  buildSampleCVForTemplate,
} from './previewSampleCV';

const BANNED = [
  'Stripe',
  'Airbnb',
  'Google',
  'Stanford',
  'Berkeley',
  'Amazon Web Services',
  'Scrum.org',
  'AWS Certified',
];

function collectText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join('\n');
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(collectText).join('\n');
  }
  return '';
}

describe('preview sample CV (store stills)', () => {
  it('uses fictional companies, schools, and issuers', () => {
    const blob = collectText(SAMPLE_SECTIONS);
    for (const name of BANNED) {
      expect(blob).not.toContain(name);
    }
  });

  it('keeps the product-manager role ladder', () => {
    const exp = SAMPLE_SECTIONS.find((s) => s.id === 'exp');
    const positions = (exp?.items ?? []).map((item) => (item as { position: string }).position);
    expect(positions).toEqual([
      'Senior Product Manager',
      'Product Manager',
      'Associate Product Manager',
    ]);
  });

  it('attaches the placeholder photo only on showPhoto templates', () => {
    for (const id of CV_CAPTURE_TEMPLATE_IDS) {
      const cv = buildSampleCVForTemplate(id);
      const styling = getTemplateStyling(id);
      expect(cv.templateId).toBe(id);
      expect(cv.styling).toMatchObject(styling);
      if (styling.showPhoto) {
        expect(cv.personalInfo.photoURL).toBe(SAMPLE_PHOTO_DATA_URI);
      } else {
        expect(cv.personalInfo.photoURL).toBeNull();
      }
    }
  });
});
