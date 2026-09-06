import { describe, it, expect } from 'vitest';
import { FontSize, Spacing } from '@flacroncv/shared-types';
import {
  CV_CAPTURE_TEMPLATE_IDS,
  getTemplateStyling,
} from './cv-template-styling';

describe('getTemplateStyling (capture / catalog ids)', () => {
  it('covers the ten CV catalog ids and nothing else', () => {
    expect([...CV_CAPTURE_TEMPLATE_IDS]).toEqual([
      'classic',
      'modern',
      'minimal',
      'compact',
      'academic',
      'professional',
      'creative',
      'executive',
      'two-column',
      'bold',
    ]);
  });

  it('matches API create styling for each catalog id', () => {
    expect(getTemplateStyling('classic')).toMatchObject({
      primaryColor: '#1e3a5f',
      fontFamily: 'Merriweather',
      headingFontFamily: 'Merriweather',
      fontSize: FontSize.MEDIUM,
      spacing: Spacing.NORMAL,
      showPhoto: false,
      layout: 'classic',
      sectionStyle: 'underline',
      borderRadius: 'small',
    });
    expect(getTemplateStyling('modern')).toMatchObject({
      primaryColor: '#2563eb',
      layout: 'sidebar',
      showPhoto: false,
      fontFamily: 'Inter',
    });
    expect(getTemplateStyling('minimal')).toMatchObject({
      primaryColor: '#374151',
      fontSize: FontSize.SMALL,
      spacing: Spacing.COMPACT,
      layout: 'classic',
      sectionStyle: 'minimal',
      showPhoto: false,
    });
    expect(getTemplateStyling('compact')).toMatchObject({
      primaryColor: '#1d4ed8',
      layout: 'compact',
      fontSize: FontSize.SMALL,
      showPhoto: false,
    });
    expect(getTemplateStyling('academic')).toMatchObject({
      primaryColor: '#6b21a8',
      layout: 'classic',
      sectionStyle: 'minimal',
      showPhoto: false,
    });
    expect(getTemplateStyling('professional')).toMatchObject({
      primaryColor: '#0f766e',
      layout: 'top-bar',
      headingFontFamily: 'Montserrat',
      showPhoto: false,
    });
    expect(getTemplateStyling('creative')).toMatchObject({
      primaryColor: '#7c3aed',
      layout: 'top-bar',
      showPhoto: true,
      sectionStyle: 'card',
      headingFontFamily: 'Playfair Display',
    });
    expect(getTemplateStyling('executive')).toMatchObject({
      primaryColor: '#0c0c0c',
      layout: 'compact',
      fontSize: FontSize.LARGE,
      showPhoto: false,
    });
    expect(getTemplateStyling('two-column')).toMatchObject({
      primaryColor: '#059669',
      layout: 'sidebar',
      showPhoto: true,
      fontFamily: 'Lora',
    });
    expect(getTemplateStyling('bold')).toMatchObject({
      primaryColor: '#dc2626',
      layout: 'top-bar',
      showPhoto: true,
      fontFamily: 'Montserrat',
    });
  });

  it('puts a photo only on creative, two-column, and bold', () => {
    const withPhoto = CV_CAPTURE_TEMPLATE_IDS.filter(
      (id) => getTemplateStyling(id).showPhoto,
    );
    expect(withPhoto).toEqual(['creative', 'two-column', 'bold']);
  });

  it('falls back to modern for an unknown id', () => {
    expect(getTemplateStyling('not-a-template')).toEqual(getTemplateStyling('modern'));
  });
});
