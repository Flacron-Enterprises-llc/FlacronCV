import { describe, expect, it } from 'vitest';
import {
  ACCENT_COLORS,
  accentLabel,
  applyTemplate,
  BORDER_RADIUS_OPTIONS,
  buildDesignUpdate,
  canSelectLayout,
  canSelectTemplate,
  designDraftFromCV,
  effectiveHeadingFont,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  LAYOUT_OPTIONS,
  normalizeHex,
  SECTION_STYLE_OPTIONS,
  TEMPLATE_STYLING,
  templateTier,
} from './cv-design';
import type { SubscriptionPlan as SharedPlan } from '../../../../packages/shared-types/src/enums';

const FREE = 'free' as SharedPlan;
const PRO = 'pro' as SharedPlan;
const ENTERPRISE = 'enterprise' as SharedPlan;

describe('option tables match the website and CvStylingDto', () => {
  it('has the web layouts, presets, styles, corners, fonts and sizes', () => {
    expect(LAYOUT_OPTIONS.map((l) => l.key)).toEqual(['classic', 'sidebar', 'top-bar', 'compact', 'slate-gold']);
    expect(ACCENT_COLORS).toHaveLength(12);
    expect(ACCENT_COLORS.map((c) => c.value)).toContain('#4f46e5');
    expect(SECTION_STYLE_OPTIONS.map((s) => s.key)).toEqual(['underline', 'left-border', 'card', 'minimal']);
    expect(BORDER_RADIUS_OPTIONS.map((r) => r.key)).toEqual(['none', 'small', 'medium', 'large']);
    expect(FONT_OPTIONS).toEqual(['Inter', 'Merriweather', 'Playfair Display', 'Roboto', 'Lora', 'Open Sans', 'Montserrat']);
    expect(FONT_SIZE_OPTIONS.map((s) => s.key)).toEqual(['small', 'medium', 'large']);
  });

  it('has a create-time preset for every built-in template', () => {
    expect(Object.keys(TEMPLATE_STYLING).sort()).toEqual(
      ['academic', 'bold', 'classic', 'compact', 'creative', 'executive', 'minimal', 'modern', 'professional', 'two-column'],
    );
  });
});

describe('designDraftFromCV', () => {
  it('uses the website fallbacks for missing or invalid keys', () => {
    const d = designDraftFromCV({ templateId: '', styling: { layout: 'weird', fontSize: 'huge' } });
    expect(d).toEqual({
      templateId: 'modern',
      layout: 'classic',
      primaryColor: '#2563eb',
      sectionStyle: 'underline',
      borderRadius: 'small',
      fontFamily: 'Inter',
      fontSize: 'medium',
    });
    expect(effectiveHeadingFont(d)).toBe('Inter');
  });

  it('reads stored values including heading font, spacing and photo', () => {
    const d = designDraftFromCV({
      templateId: 'creative',
      styling: { ...TEMPLATE_STYLING.creative },
    });
    expect(d.layout).toBe('top-bar');
    expect(d.headingFontFamily).toBe('Playfair Display');
    expect(d.spacing).toBe('relaxed');
    expect(d.showPhoto).toBe(true);
  });
});

describe('normalizeHex', () => {
  it('accepts 3/6 digits with or without #', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('1e3a5f')).toBe('#1e3a5f');
    expect(normalizeHex('  #1E3A5F ')).toBe('#1e3a5f');
  });
  it('rejects anything else', () => {
    for (const bad of ['', '#12', '#12345', '#ggg', 'red', '#1234567', 'rgb(0,0,0)']) {
      expect(normalizeHex(bad)).toBeNull();
    }
  });
  it('labels presets and custom colours', () => {
    expect(accentLabel('#2563EB')).toBe('Blue');
    expect(accentLabel('#123456')).toBe('Custom');
  });
});

describe('plan gating (CV_LAYOUT_TIER / CV_TEMPLATE_TIER)', () => {
  it('locks Pro layouts for Free, except the stored one', () => {
    expect(canSelectLayout('top-bar', FREE, 'classic')).toBe(false);
    expect(canSelectLayout('slate-gold', FREE, 'classic')).toBe(false);
    expect(canSelectLayout('compact', FREE, 'classic')).toBe(true);
    expect(canSelectLayout('top-bar', FREE, 'top-bar')).toBe(true);
    expect(canSelectLayout('slate-gold', PRO, 'classic')).toBe(true);
  });

  it('gates templates by the built-in tier first, then the catalog tier', () => {
    expect(templateTier('bold', 'free')).toBe('enterprise');
    expect(templateTier('custom-x', 'pro')).toBe('pro');
    expect(templateTier('custom-y')).toBe('free');
    expect(canSelectTemplate('professional', FREE, 'modern')).toBe(false);
    expect(canSelectTemplate('professional', PRO, 'modern')).toBe(true);
    expect(canSelectTemplate('bold', PRO, 'modern')).toBe(false);
    expect(canSelectTemplate('bold', ENTERPRISE, 'modern')).toBe(true);
    expect(canSelectTemplate('bold', FREE, 'bold')).toBe(true);
  });
});

describe('buildDesignUpdate', () => {
  const original = designDraftFromCV({ templateId: 'modern', styling: { ...TEMPLATE_STYLING.modern } });

  it('returns null when nothing changed', () => {
    expect(buildDesignUpdate(original, { ...original })).toBeNull();
  });

  it('sends only the changed styling keys', () => {
    const payload = buildDesignUpdate(original, { ...original, primaryColor: '#e11d48', sectionStyle: 'card' });
    expect(payload).toEqual({ styling: { primaryColor: '#e11d48', sectionStyle: 'card' } });
  });

  it('sends a heading font set explicitly over an unset one', () => {
    const noHeading = designDraftFromCV({ templateId: 'modern', styling: { fontFamily: 'Inter' } });
    expect(buildDesignUpdate(noHeading, { ...noHeading, headingFontFamily: 'Lora' })).toEqual({
      styling: { headingFontFamily: 'Lora' },
    });
  });

  it('switching template sends templateId plus the preset keys that differ', () => {
    const switched = applyTemplate(original, 'professional');
    expect(buildDesignUpdate(original, switched)).toEqual({
      templateId: 'professional',
      styling: {
        layout: 'top-bar',
        primaryColor: '#0f766e',
        sectionStyle: 'left-border',
        fontFamily: 'Roboto',
        headingFontFamily: 'Montserrat',
      },
    });
  });

  it('unknown template ids fall back to the modern preset (as the API does)', () => {
    expect(applyTemplate(original, 'nope').layout).toBe('sidebar');
  });
});
