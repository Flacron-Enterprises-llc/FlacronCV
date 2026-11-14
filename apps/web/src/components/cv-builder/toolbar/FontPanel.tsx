'use client';

import { useTranslations } from 'next-intl';
import { useCVStore } from '@/store/cv-store';
import { Type, ChevronDown } from 'lucide-react';
import { usePopover, POPOVER_SHEET } from './usePopover';

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Merriweather', label: 'Merriweather' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Lora', label: 'Lora' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Montserrat', label: 'Montserrat' },
];

/** Map stored font names to next/font CSS variable references */
const FONT_CSS_VAR: Record<string, string> = {
  'Inter': 'var(--font-inter)',
  'Merriweather': 'var(--font-merriweather)',
  'Playfair Display': 'var(--font-playfair)',
  'Roboto': 'var(--font-roboto)',
  'Lora': 'var(--font-lora)',
  'Open Sans': 'var(--font-opensans)',
  'Montserrat': 'var(--font-montserrat)',
};

export function fontNameToCssVar(name: string): string {
  return FONT_CSS_VAR[name] || FONT_CSS_VAR[name.replace(/'/g, '')] || name;
}

const FONT_SIZE_OPTIONS = [
  { value: 'small', label: 'font_small' },
  { value: 'medium', label: 'font_medium' },
  { value: 'large', label: 'font_large' },
] as const;

export default function FontPanel() {
  const t = useTranslations('cv_builder');
  const { cv, updateStyling } = useCVStore();
  // Escape closes and focus returns to the button (see usePopover).
  const { open, setOpen, triggerRef } = usePopover();

  if (!cv) return null;

  const currentBodyFont = cv.styling.fontFamily || 'Inter';
  const currentHeadingFont = cv.styling.headingFontFamily || currentBodyFont;
  const currentFontSize = cv.styling.fontSize || 'medium';

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('font_family')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 transition-colors"
        onClick={() => setOpen(!open)}
        title={t('font_family')}
      >
        <Type className="h-4 w-4" />
        <span className="hidden sm:inline">{t('font_family')}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30 sm:z-10 sm:bg-transparent" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label={t('font_family')}
            className={`${POPOVER_SHEET} p-3 sm:start-0 sm:z-20 sm:mt-1 sm:w-64 sm:animate-scale-in sm:rounded-lg`}
            data-testid="font-panel"
          >
            {/* Body Font */}
            <label htmlFor="cv-body-font" className="mb-1 block text-xs font-semibold text-stone-500 dark:text-stone-400">
              {t('body_font')}
            </label>
            <select
              id="cv-body-font"
              className="mb-3 w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300"
              value={currentBodyFont}
              onChange={(e) => updateStyling('fontFamily', e.target.value)}
              style={{ fontFamily: fontNameToCssVar(currentBodyFont) }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: fontNameToCssVar(f.value) }}>
                  {f.label}
                </option>
              ))}
            </select>

            {/* Heading Font */}
            <label htmlFor="cv-heading-font" className="mb-1 block text-xs font-semibold text-stone-500 dark:text-stone-400">
              {t('heading_font')}
            </label>
            <select
              id="cv-heading-font"
              className="mb-3 w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300"
              value={currentHeadingFont}
              onChange={(e) => updateStyling('headingFontFamily' as any, e.target.value)}
              style={{ fontFamily: fontNameToCssVar(currentHeadingFont) }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: fontNameToCssVar(f.value) }}>
                  {f.label}
                </option>
              ))}
            </select>

            {/* Font Size */}
            <label className="mb-1 block text-xs font-semibold text-stone-500 dark:text-stone-400">
              {t('font_size')}
            </label>
            <div className="flex gap-1">
              {FONT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size.value}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    currentFontSize === size.value
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300'
                      : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-700'
                  }`}
                  onClick={() => updateStyling('fontSize', size.value)}
                >
                  {t(size.label)}
                </button>
              ))}
            </div>

            {/* Font Preview */}
            <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-2.5 dark:border-stone-600 dark:bg-stone-900">
              <p
                className="text-sm font-semibold text-stone-700 dark:text-stone-300"
                style={{ fontFamily: fontNameToCssVar(currentHeadingFont) }}
              >
                {t('font_preview_heading')}
              </p>
              <p
                className="text-xs text-stone-500 dark:text-stone-400"
                style={{ fontFamily: fontNameToCssVar(currentBodyFont) }}
              >
                {/* Script-appropriate per locale — a Latin pangram tells an
                    Arabic or Urdu user nothing about how their font renders. */}
                {t('font_preview_body')}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
