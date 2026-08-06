'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useCVStore } from '@/store/cv-store';
import { useAuth } from '@/providers/AuthProvider';
import { LayoutTemplate, X, ChevronDown, Lock } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import type { CVLayout, SectionStyle, BorderRadiusStyle } from '@flacroncv/shared-types';
import { resolveEffectivePlan, CV_LAYOUT_TIER, canUseCvLayout } from '@flacroncv/shared-types';
import CVThumbnail from '@/components/cv-builder/CVThumbnail';

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
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { cv, updateStyling } = useCVStore();
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations('template_picker');

  const userPlan = resolveEffectivePlan(user?.subscription);
  const canUseLayout = (layout: CVLayout) => canUseCvLayout(layout, userPlan);

  const currentLayout    = ((cv?.styling as any)?.layout     || 'classic')   as CVLayout;
  const currentColor     = cv?.styling.primaryColor || '#2563eb';
  const currentSStyle    = ((cv?.styling as any)?.sectionStyle || 'underline') as SectionStyle;
  const currentBR        = ((cv?.styling as any)?.borderRadius  || 'small')    as BorderRadiusStyle;

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
  }, [open]);

  if (!cv) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={t('design_panel')}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 transition-colors"
      >
        <LayoutTemplate className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t('design_panel')}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className="absolute end-0 z-30 mt-2 w-72 rounded-xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900 max-h-[calc(100vh-120px)] overflow-y-auto"
            style={{ top: '100%' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5 dark:border-stone-800">
              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">{t('cv_design')}</span>
              <button onClick={() => setOpen(false)} className="rounded p-0.5 text-stone-400 hover:text-stone-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-5 p-4">
              {/* ── Layout ── */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">{t('layout_heading')}</p>
                <div className="grid grid-cols-4 gap-2">
                  {LAYOUTS.map(opt => {
                    const locked = !canUseLayout(opt.key);
                    return (
                      <button
                        key={opt.key}
                        onClick={() => {
                          if (locked) {
                            setOpen(false);
                            router.push('/settings/billing');
                            return;
                          }
                          updateStyling('layout' as any, opt.key);
                        }}
                        title={locked ? t('layout_locked_tooltip', { name: t(opt.labelKey), tier: CV_LAYOUT_TIER[opt.key] }) : t('layout_tooltip', { name: t(opt.labelKey), personality: t(opt.personalityKey) })}
                        className={`relative flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all ${
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
                          className="overflow-hidden rounded-sm border border-stone-200 dark:border-stone-700"
                          style={{ width: 72, height: 92 }}
                        >
                          <CVThumbnail layout={opt.key} color={currentColor} />
                        </div>
                        <span className="text-[9px] font-medium text-stone-600 dark:text-stone-400">{t(opt.labelKey)}</span>
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
