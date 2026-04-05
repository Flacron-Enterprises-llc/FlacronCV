'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useCVStore } from '@/store/cv-store';
import { useAuth } from '@/providers/AuthProvider';
import { LayoutTemplate, X, ChevronDown, Lock } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import type { CVLayout, SectionStyle, BorderRadiusStyle } from '@flacroncv/shared-types';
import { SubscriptionPlan } from '@flacroncv/shared-types';
import CVThumbnail from '@/components/cv-builder/CVThumbnail';

// ─── Layout cards ─────────────────────────────────────────────────────────────

// Layouts gated by plan
const LAYOUT_PLAN: Record<CVLayout, SubscriptionPlan> = {
  'classic':  SubscriptionPlan.FREE,
  'sidebar':  SubscriptionPlan.FREE,
  'top-bar':  SubscriptionPlan.PRO,
  'compact':  SubscriptionPlan.PRO,
};

interface LayoutOption {
  key: CVLayout;
  label: string;
  personality: string;
}

const LAYOUTS: LayoutOption[] = [
  { key: 'classic',  label: 'Classic',  personality: 'Modern Minimal'        },
  { key: 'sidebar',  label: 'Sidebar',  personality: 'Corporate Professional' },
  { key: 'top-bar',  label: 'Top Bar',  personality: 'Creative / Bold'        },
  { key: 'compact',  label: 'Compact',  personality: 'Executive Dense'        },
];

const COLORS = [
  { label: 'Indigo',     value: '#4f46e5' },
  { label: 'Blue',       value: '#2563eb' },
  { label: 'Cyan',       value: '#0891b2' },
  { label: 'Emerald',    value: '#059669' },
  { label: 'Teal',       value: '#0d9488' },
  { label: 'Rose',       value: '#e11d48' },
  { label: 'Orange',     value: '#ea580c' },
  { label: 'Amber',      value: '#d97706' },
  { label: 'Violet',     value: '#7c3aed' },
  { label: 'Slate',      value: '#475569' },
  { label: 'Stone',      value: '#78716c' },
  { label: 'Zinc',       value: '#3f3f46' },
];

const SECTION_STYLES: { key: SectionStyle; label: string }[] = [
  { key: 'underline',    label: 'Underline' },
  { key: 'left-border',  label: 'Left border' },
  { key: 'card',         label: 'Badge' },
  { key: 'minimal',      label: 'Minimal' },
];

const BORDER_RADII: { key: BorderRadiusStyle; label: string }[] = [
  { key: 'none',   label: 'Sharp' },
  { key: 'small',  label: 'Subtle' },
  { key: 'medium', label: 'Rounded' },
  { key: 'large',  label: 'Soft' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplatePanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { cv, updateStyling } = useCVStore();
  const { user } = useAuth();
  const router = useRouter();

  const userPlan = (user?.subscription?.plan || SubscriptionPlan.FREE) as SubscriptionPlan;
  const planOrder = [SubscriptionPlan.FREE, SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE];
  const canUseLayout = (layout: CVLayout) =>
    planOrder.indexOf(userPlan) >= planOrder.indexOf(LAYOUT_PLAN[layout]);

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
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 transition-colors"
      >
        <LayoutTemplate className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Design</span>
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
              <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">CV Design</span>
              <button onClick={() => setOpen(false)} className="rounded p-0.5 text-stone-400 hover:text-stone-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-5 p-4">
              {/* ── Layout ── */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">Layout</p>
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
                        title={locked ? `${opt.label} — Requires ${LAYOUT_PLAN[opt.key]} plan` : `${opt.label} — ${opt.personality}`}
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
                        <span className="text-[9px] font-medium text-stone-600 dark:text-stone-400">{opt.label}</span>
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
                  {LAYOUTS.find(l => l.key === currentLayout)?.personality}
                </p>
              </div>

              {/* ── Primary colour ── */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">Accent Colour</p>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      title={c.label}
                      onClick={() => updateStyling('primaryColor', c.value)}
                      style={{ background: c.value, width: 22, height: 22, borderRadius: '50%' }}
                      className={`transition-transform hover:scale-110 ${
                        currentColor === c.value ? 'ring-2 ring-offset-2 ring-stone-400 scale-110' : ''
                      }`}
                    />
                  ))}
                  {/* Custom colour */}
                  <label title="Custom colour" style={{ position: 'relative', width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', border: '2px dashed #ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">Section Headings</p>
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
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Border radius ── */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">Corner Style</p>
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
                      {r.label}
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
