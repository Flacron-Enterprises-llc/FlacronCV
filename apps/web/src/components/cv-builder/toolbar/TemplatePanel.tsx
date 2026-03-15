'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useCVStore } from '@/store/cv-store';
import { LayoutTemplate, X, ChevronDown } from 'lucide-react';
import type { CVLayout, SectionStyle, BorderRadiusStyle } from '@flacroncv/shared-types';

// ─── Layout cards ─────────────────────────────────────────────────────────────

interface LayoutOption {
  key: CVLayout;
  label: string;
  personality: string;
  preview: React.ReactNode;
}

function LayoutThumbnail({ type }: { type: CVLayout }) {
  const base = 'rounded-sm overflow-hidden';
  const accent = '#6366f1';

  if (type === 'classic') return (
    <div className={base} style={{ width: 72, height: 92, background: '#fff', border: '1px solid #e5e7eb', padding: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ height: 10, background: accent, borderRadius: 2, width: '60%', margin: '0 auto' }} />
      <div style={{ height: 2, background: '#e5e7eb', borderRadius: 1, margin: '1px 0' }} />
      {[70, 90, 80, 60].map((w, i) => (
        <div key={i} style={{ height: 3, background: i === 0 ? '#d1d5db' : '#f3f4f6', borderRadius: 1, width: `${w}%` }} />
      ))}
      <div style={{ height: 1, background: accent, marginTop: 2 }} />
      {[100, 85, 75].map((w, i) => (
        <div key={i} style={{ height: 3, background: '#f3f4f6', borderRadius: 1, width: `${w}%` }} />
      ))}
    </div>
  );

  if (type === 'sidebar') return (
    <div className={base} style={{ width: 72, height: 92, display: 'flex', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      <div style={{ width: '32%', background: accent, padding: '5px 3px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', margin: '0 auto 3px' }} />
        {[80, 60, 90, 70, 55].map((w, i) => (
          <div key={i} style={{ height: 2, background: 'rgba(255,255,255,0.4)', borderRadius: 1, width: `${w}%` }} />
        ))}
      </div>
      <div style={{ flex: 1, background: '#fff', padding: '5px 4px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[80, 60, 90, 70, 55, 85, 65].map((w, i) => (
          <div key={i} style={{ height: 3, background: i % 3 === 0 ? '#d1d5db' : '#f3f4f6', borderRadius: 1, width: `${w}%` }} />
        ))}
      </div>
    </div>
  );

  if (type === 'top-bar') return (
    <div className={base} style={{ width: 72, height: 92, background: '#fff', border: '1px solid #e5e7eb', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: accent, padding: '6px 5px', display: 'flex', gap: 4, alignItems: 'center' }}>
        <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.85)', borderRadius: 1, width: '75%' }} />
          <div style={{ height: 2, background: 'rgba(255,255,255,0.5)', borderRadius: 1, width: '55%' }} />
        </div>
      </div>
      <div style={{ flex: 1, padding: '4px 5px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[85, 70, 90, 65, 80, 55].map((w, i) => (
          <div key={i} style={{ height: 3, background: i === 0 || i === 3 ? '#d1d5db' : '#f3f4f6', borderRadius: 1, width: `${w}%` }} />
        ))}
      </div>
    </div>
  );

  // compact
  return (
    <div className={base} style={{ width: 72, height: 92, background: '#fff', border: '1px solid #e5e7eb', padding: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <div style={{ height: 5, background: accent, borderRadius: 1, width: '55%' }} />
        <div style={{ height: 4, background: '#e5e7eb', borderRadius: 1, width: '30%' }} />
      </div>
      <div style={{ height: 1, background: accent, width: '100%' }} />
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        <div style={{ flex: '0 0 58%', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[90, 75, 85, 60, 80].map((w, i) => (
            <div key={i} style={{ height: 3, background: i === 0 ? '#d1d5db' : '#f3f4f6', borderRadius: 1, width: `${w}%` }} />
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[85, 70, 60, 80, 55].map((w, i) => (
            <div key={i} style={{ height: 3, background: i === 0 ? '#d1d5db' : '#f3f4f6', borderRadius: 1, width: `${w}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

const LAYOUTS: LayoutOption[] = [
  { key: 'classic',  label: 'Classic',    personality: 'Modern Minimal',          preview: <LayoutThumbnail type="classic" /> },
  { key: 'sidebar',  label: 'Sidebar',    personality: 'Corporate Professional',   preview: <LayoutThumbnail type="sidebar" /> },
  { key: 'top-bar',  label: 'Top Bar',    personality: 'Creative / Bold',          preview: <LayoutThumbnail type="top-bar" /> },
  { key: 'compact',  label: 'Compact',    personality: 'Executive Dense',          preview: <LayoutThumbnail type="compact" /> },
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
            className="absolute end-0 z-30 mt-2 w-72 rounded-xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900"
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
                  {LAYOUTS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => updateStyling('layout' as any, opt.key)}
                      title={`${opt.label} — ${opt.personality}`}
                      className={`flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all ${
                        currentLayout === opt.key
                          ? 'ring-2 ring-brand-500 bg-brand-50 dark:bg-brand-900/20'
                          : 'hover:bg-stone-50 dark:hover:bg-stone-800'
                      }`}
                    >
                      {opt.preview}
                      <span className="text-[9px] font-medium text-stone-600 dark:text-stone-400">{opt.label}</span>
                    </button>
                  ))}
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
