/**
 * Per-template styling the capture stills must use so each PNG matches what
 * a user actually gets when they pick that id.
 *
 * Keep this object byte-for-byte aligned with
 * `CVService.getTemplateStyling` in `apps/api/src/modules/cv/cv.service.ts`.
 * The API is the source of truth on create; this copy exists because the
 * capture page cannot import Nest services.
 */

import type { CVStyling } from '@flacroncv/shared-types';
import { FontSize, Spacing } from '@flacroncv/shared-types';

export const CV_CAPTURE_TEMPLATE_IDS = [
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
] as const;

export type CvCaptureTemplateId = (typeof CV_CAPTURE_TEMPLATE_IDS)[number];

const STYLES: Record<string, Omit<CVStyling, 'secondaryColor'>> = {
  classic: {
    primaryColor: '#1e3a5f',
    fontFamily: 'Merriweather',
    headingFontFamily: 'Merriweather',
    fontSize: FontSize.MEDIUM,
    spacing: Spacing.NORMAL,
    showPhoto: false,
    layout: 'classic',
    sectionStyle: 'underline',
    borderRadius: 'small',
  },
  modern: {
    primaryColor: '#2563eb',
    fontFamily: 'Inter',
    headingFontFamily: 'Inter',
    fontSize: FontSize.MEDIUM,
    spacing: Spacing.NORMAL,
    showPhoto: false,
    layout: 'sidebar',
    sectionStyle: 'underline',
    borderRadius: 'small',
  },
  minimal: {
    primaryColor: '#374151',
    fontFamily: 'Inter',
    headingFontFamily: 'Inter',
    fontSize: FontSize.SMALL,
    spacing: Spacing.COMPACT,
    showPhoto: false,
    layout: 'classic',
    sectionStyle: 'minimal',
    borderRadius: 'none',
  },
  professional: {
    primaryColor: '#0f766e',
    fontFamily: 'Roboto',
    headingFontFamily: 'Montserrat',
    fontSize: FontSize.MEDIUM,
    spacing: Spacing.NORMAL,
    showPhoto: false,
    layout: 'top-bar',
    sectionStyle: 'left-border',
    borderRadius: 'small',
  },
  creative: {
    primaryColor: '#7c3aed',
    fontFamily: 'Open Sans',
    headingFontFamily: 'Playfair Display',
    fontSize: FontSize.MEDIUM,
    spacing: Spacing.RELAXED,
    showPhoto: true,
    layout: 'top-bar',
    sectionStyle: 'card',
    borderRadius: 'large',
  },
  executive: {
    primaryColor: '#0c0c0c',
    fontFamily: 'Roboto',
    headingFontFamily: 'Montserrat',
    fontSize: FontSize.LARGE,
    spacing: Spacing.RELAXED,
    showPhoto: false,
    layout: 'compact',
    sectionStyle: 'underline',
    borderRadius: 'none',
  },
  compact: {
    primaryColor: '#1d4ed8',
    fontFamily: 'Inter',
    headingFontFamily: 'Inter',
    fontSize: FontSize.SMALL,
    spacing: Spacing.COMPACT,
    showPhoto: false,
    layout: 'compact',
    sectionStyle: 'underline',
    borderRadius: 'small',
  },
  'two-column': {
    primaryColor: '#059669',
    fontFamily: 'Lora',
    headingFontFamily: 'Montserrat',
    fontSize: FontSize.MEDIUM,
    spacing: Spacing.NORMAL,
    showPhoto: true,
    layout: 'sidebar',
    sectionStyle: 'underline',
    borderRadius: 'medium',
  },
  academic: {
    primaryColor: '#6b21a8',
    fontFamily: 'Merriweather',
    headingFontFamily: 'Merriweather',
    fontSize: FontSize.MEDIUM,
    spacing: Spacing.NORMAL,
    showPhoto: false,
    layout: 'classic',
    sectionStyle: 'minimal',
    borderRadius: 'none',
  },
  bold: {
    primaryColor: '#dc2626',
    fontFamily: 'Montserrat',
    headingFontFamily: 'Montserrat',
    fontSize: FontSize.LARGE,
    spacing: Spacing.RELAXED,
    showPhoto: true,
    layout: 'top-bar',
    sectionStyle: 'left-border',
    borderRadius: 'medium',
  },
};

export function getTemplateStyling(templateId: string): Omit<CVStyling, 'secondaryColor'> {
  return STYLES[templateId] || STYLES.modern;
}
