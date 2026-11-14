'use client';

import React, { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useCVStore } from '@/store/cv-store';
import { useAuth } from '@/providers/AuthProvider';
import { LayoutTemplate, X, ChevronDown, Lock } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import type { CVLayout, SectionStyle, BorderRadiusStyle } from '@flacroncv/shared-types';
import { resolveEffectivePlan, CV_LAYOUT_TIER, canUseCvLayout } from '@flacroncv/shared-types';
import { fcgeUpgradeClicked } from '@/lib/fcge';
import CVThumbnail from '@/components/cv-builder/CVThumbnail';
import { CV_DOC_LANGS, isCVDocLang, type CVDocLang } from '@/components/cv-builder/templates/document-locale';
import { usePopover, POPOVER_SHEET } from './usePopover';

/** Endonyms — a language is listed in its own name in every UI locale. */
const DOC_LANGUAGE_NAMES: Record<CVDocLang, string> = {
  en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español', ar: 'العربية', ur: 'اردو',
};

// ─── Layout cards ─────────────────────────────────────────────────────────────

interface LayoutOption {
  key: CVLayout;
  labelKey: string;
  personalityKey: string;
}

// Option tables hold i18n KEYS, not literals — the panel is rendered in all six
// locales (including RTL Arabic and Urdu) and previously showed raw English here.
// Same pattern as FontPanel's FONT_SIZE_OPTIONS.
const LAYOUTS: LayoutOption[] = [
  { key: 'classic',    labelKey: 'layout_classic',    personalityKey: 'layout_classic_desc'    },
  { key: 'sidebar',    labelKey: 'layout_sidebar',    personalityKey: 'layout_sidebar_desc'    },
  { key: 'top-bar',    labelKey: 'layout_top_bar',    personalityKey: 'layout_top_bar_desc'    },
  { key: 'compact',    labelKey: 'layout_compact',    personalityKey: 'layout_compact_desc'    },
  { key: 'slate-gold', labelKey: 'layout_slate_gold', personalityKey: 'layout_slate_gold_desc' },
];

const COLORS = [
  { labelKey: 'color_indigo',     value: '#4f46e5' },
  { labelKey: 'color_blue',       value: '#2563eb' },
  { labelKey: 'color_cyan',       value: '#0891b2' },
  { labelKey: 'color_emerald',    value: '#059669' },
  { labelKey: 'color_teal',       value: '#0d9488' },
  { labelKey: 'color_rose',       value: '#e11d48' },
  { labelKey: 'color_orange',     value: '#ea580c' },
  { labelKey: 'color_amber',      value: '#d97706' },
  { labelKey: 'color_violet',     value: '#7c3aed' },
  { labelKey: 'color_slate',      value: '#475569' },
  { labelKey: 'color_stone',      value: '#78716c' },
  { labelKey: 'color_zinc',       value: '#3f3f46' },
];

const SECTION_STYLES: { key: SectionStyle; labelKey: string }[] = [
  { key: 'underline',    labelKey: 'section_style_underline' },
  { key: 'left-border',  labelKey: 'section_style_left_border' },
  { key: 'card',         labelKey: 'section_style_badge' },
  { key: 'minimal',      labelKey: 'section_style_minimal' },
];

const BORDER_RADII: { key: BorderRadiusStyle; labelKey: string }[] = [
  { key: 'none',   labelKey: 'corner_sharp' },
  { key: 'small',  labelKey: 'corner_subtle' },
  { key: 'medium', labelKey: 'corner_rounded' },
  { key: 'large',  labelKey: 'corner_soft' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplatePanel() {
  const { open, setOpen, close, triggerRef } = usePopover();
  const panelRef = useRef<HTMLDivElement>(null);
  const { cv, updateStyling } = useCVStore();
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations('template_picker');
  const tc = useTranslations('common');
  // Plan names as the user sees them elsewhere ("Pro", "Enterprise"), not the
  // raw tier ids ("pro") the tooltip used to print.
  const tierName = (tier: string) =>
    tier === 'enterprise' ? tc('enterprise') : tier === 'free' ? tc('free') : tc('pro');

  const userPlan = resolveEffectivePlan(user?.subscription);
  const canUseLayout = (layout: CVLayout) => canUseCvLayout(layout, userPlan);

  const currentLayout    = ((cv?.styling as any)?.layout     || 'classic')   as CVLayout;
  const currentColor     = cv?.styling.primaryColor || '#2563eb';
  const currentSStyle    = ((cv?.styling as any)?.sectionStyle || 'underline') as SectionStyle;
  const currentBR        = ((cv?.styling as any)?.borderRadius  || 'small')    as BorderRadiusStyle;
  const currentDocLang   = isCVDocLang((cv?.styling as any)?.documentLanguage) ? (cv?.styling as any).documentLanguage as string : 'auto';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  if (!cv) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-label={t('design_panel')}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 transition-colors"
      >
        <LayoutTemplate className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t('design_panel')}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Dimmed backdrop on phones (bottom sheet); invisible click-catcher above. */}
          <div className="fixed inset-0 z-30 bg-black/30 sm:z-20 sm:bg-transparent" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label={t('cv_design')}
            className={`${POPOVER_SHEET} sm:end-0 sm:z-30 sm:w-80`}
            data-testid="design-panel"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5 dark:border-stone-800">
              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">{t('cv_design')}</span>
              <button onClick={() => close()} aria-label={tc('close')} className="rounded p-1 text-stone-400 hover:text-stone-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-5 p-4">
              {/* ── Layout ── */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">{t('layout_heading')}</p>
                {/* Three fluid columns: four fixed 72px cards did not fit the
                    panel's width and overlapped each other. */}
                <div className="grid grid-cols-3 gap-2">
                  {LAYOUTS.map(opt => {
                    const locked = !canUseLayout(opt.key);
                    return (
                      <button
                        key={opt.key}
                        onClick={() => {
                          if (locked) {
                            fcgeUpgradeClicked(CV_LAYOUT_TIER[opt.key]);
                            setOpen(false);
                            router.push('/settings/billing');
                            return;
                          }
                          updateStyling('layout' as any, opt.key);
                        }}
                        title={locked ? t('layout_locked_tooltip', { name: t(opt.labelKey), tier: tierName(CV_LAYOUT_TIER[opt.key]) }) : t('layout_tooltip', { name: t(opt.labelKey), personality: t(opt.personalityKey) })}
                        aria-pressed={currentLayout === opt.key}
                        className={`relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all ${
                          currentLayout === opt.key
                            ? 'ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-900/20'
                            : locked
                              ? 'opacity-60 hover:bg-stone-50 dark:hover:bg-stone-800'
                              : 'hover:bg-stone-50 dark:hover:bg-stone-800'
                        }`}
                      >
                        {/* Use the CV's actual primary color so the user sees
                            how each layout looks with their chosen accent. */}
                        <div
                          className="aspect-[72/92] w-full overflow-hidden rounded-sm border border-stone-200 dark:border-stone-700"
                        >
                          <CVThumbnail layout={opt.key} color={currentColor} />
                        </div>
                        <span className="w-full truncate text-center text-[10px] font-medium text-stone-600 dark:text-stone-400">{t(opt.labelKey)}</span>
                        {locked && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg">
                            <div className="rounded-full bg-stone-900/70 p-1">
                              <Lock className="h-3 w-3 text-white" />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Personality label */}
                <p className="mt-1.5 text-center text-[10px] text-stone-400 italic">
                  {(() => {
                    const key = LAYOUTS.find(l => l.key === currentLayout)?.personalityKey;
                    return key ? t(key) : null;
                  })()}
                </p>
              </div>

              {/* ── Primary colour ── */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">{t('accent_colour')}</p>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      title={t(c.labelKey)}
                      onClick={() => updateStyling('primaryColor', c.value)}
                      style={{ background: c.value, width: 22, height: 22, borderRadius: '50%' }}
                      className={`transition-transform hover:scale-110 ${
                        currentColor === c.value ? 'ring-2 ring-offset-2 ring-stone-400 scale-110' : ''
                      }`}
                    />
                  ))}
                  {/* Custom colour */}
                  <label title={t('custom_colour')} style={{ position: 'relative', width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', border: '2px dashed #ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: '#999' }}>+</span>
                    <input
                      type="color"
                      value={currentColor}
                      onChange={e => updateStyling('primaryColor', e.target.value)}
                      style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                    />
                  </label>
                </div>
              </div>

              {/* ── Section heading style ── */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">{t('section_headings')}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {SECTION_STYLES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => updateStyling('sectionStyle' as any, s.key)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        currentSStyle === s.key
                          ? 'bg-brand-600 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'
                      }`}
                    >
                      {t(s.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Border radius ── */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">{t('corner_style')}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {BORDER_RADII.map(r => (
                    <button
                      key={r.key}
                      onClick={() => updateStyling('borderRadius' as any, r.key)}
                      className={`rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
                        currentBR === r.key
                          ? 'bg-brand-600 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400'
                      }`}
                    >
                      {t(r.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Document language ──
                  Direction and the headings the template prints ("Profile",
                  "Present", month names) follow the CV's language, not the
                  interface's. Auto detects it from the content. */}
              <div>
                <label htmlFor="cv-doc-language" className="mb-2 block text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('doc_language')}
                </label>
                <select
                  id="cv-doc-language"
                  value={currentDocLang}
                  onChange={(e) => updateStyling('documentLanguage' as any, e.target.value)}
                  aria-describedby="cv-doc-language-hint"
                  className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300"
                >
                  <option value="auto">{t('doc_language_auto')}</option>
                  {CV_DOC_LANGS.map((lang) => (
                    // Each language in its own name, so it is findable whatever
                    // the interface language is.
                    <option key={lang} value={lang} lang={lang}>{DOC_LANGUAGE_NAMES[lang]}</option>
                  ))}
                </select>
                <p id="cv-doc-language-hint" className="mt-1 text-[11px] text-stone-400">{t('doc_language_hint')}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
