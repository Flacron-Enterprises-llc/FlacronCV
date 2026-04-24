'use client';

/**
 * TemplatePreviewModal
 *
 * Full-screen preview of a CV template rendered with sample data.
 * Designed to show Pro templates without giving away the product —
 * the preview is non-interactive, right-click is blocked, and common
 * DevTools keyboard shortcuts are suppressed while the modal is open.
 *
 * Layout:
 *   ┌─────────────────────────────┬──────────────────────┐
 *   │  Scaled live template       │  Info panel          │
 *   │  (non-interactive)          │  Name, tier, bullets │
 *   │                             │  [Upgrade to Edit]   │
 *   └─────────────────────────────┴──────────────────────┘
 */

import React, { useEffect, useRef } from 'react';
import { X, Lock, ArrowRight, Crown, Zap, Sparkles, CheckCircle2 } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import type { CVLayout } from '@flacroncv/shared-types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import ClassicLayout   from './templates/ClassicLayout';
import SidebarLayout   from './templates/SidebarLayout';
import TopBarLayout    from './templates/TopBarLayout';
import CompactLayout   from './templates/CompactLayout';
import SlateGoldLayout from './templates/SlateGoldLayout';
import { buildSampleCV, SAMPLE_SECTIONS } from '@/lib/previewSampleCV';

/* ─── Props ──────────────────────────────────────────────────────────────────── */

export interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateName: string;
  layout: CVLayout;
  accentColor: string;
  /** false = Free template (no upgrade wall) */
  isPro: boolean;
  tierLabel?: string;
  /** If false AND isPro, the "Upgrade to Edit" wall is shown */
  userCanAccess: boolean;
  onSelect: () => void;
}

/* ─── Layout renderer ────────────────────────────────────────────────────────── */

function TemplateRenderer({ layout, accentColor }: { layout: CVLayout; accentColor: string }) {
  const cv       = buildSampleCV(layout, accentColor);
  const sections = SAMPLE_SECTIONS;
  const props    = { cv, sections };

  switch (layout) {
    case 'sidebar':    return <SidebarLayout   {...props} />;
    case 'top-bar':    return <TopBarLayout    {...props} />;
    case 'compact':    return <CompactLayout   {...props} />;
    case 'slate-gold': return <SlateGoldLayout {...props} />;
    default:           return <ClassicLayout   {...props} />;
  }
}

/* ─── Main component ─────────────────────────────────────────────────────────── */

export default function TemplatePreviewModal({
  isOpen,
  onClose,
  templateName,
  layout,
  accentColor,
  isPro,
  tierLabel = 'Pro',
  userCanAccess,
  onSelect,
}: TemplatePreviewModalProps) {
  const router     = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);

  // ── Block DevTools shortcuts while modal is open ──────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const blockShortcuts = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      if (
        e.key === 'F12' ||                        // DevTools
        (ctrl && shift && e.key === 'I') ||        // Inspect
        (ctrl && shift && e.key === 'J') ||        // Console
        (ctrl && shift && e.key === 'C') ||        // Inspect element
        (ctrl && e.key === 'u') ||                 // View source
        (ctrl && e.key === 'U') ||                 // View source (caps)
        (ctrl && e.key === 's') ||                 // Save page
        (ctrl && e.key === 'S')                    // Save page (caps)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', blockShortcuts, { capture: true });
    return () => document.removeEventListener('keydown', blockShortcuts, { capture: true });
  }, [isOpen]);

  // ── Lock body scroll ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const showUpgradeWall = isPro && !userCanAccess;
  const TierIcon = tierLabel === 'Enterprise' ? Crown : tierLabel === 'Pro' ? Zap : Sparkles;

  const PRO_PERKS = [
    'Unlimited PDF & DOCX exports',
    `Access to all ${tierLabel} templates`,
    'AI-powered writing assistant',
    'Custom branding & accent colors',
    'Priority customer support',
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${templateName}`}
    >
      {/* ── Backdrop ── */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* ── Modal shell ── */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl overflow-hidden rounded-none sm:my-6 sm:rounded-2xl shadow-2xl">

        {/* ═══ LEFT — Template preview ═══════════════════════════════════════ */}
        <div
          ref={previewRef}
          className="relative flex-1 overflow-hidden bg-stone-100 dark:bg-stone-900"
          // Disable right-click on the whole preview pane
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Scaled A4 template — fills the pane height */}
          <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4">
            <div
              style={{
                width: '794px',
                transformOrigin: 'top center',
                // Dynamically scale the 794px template to fit the container.
                // Using CSS custom property set inline so it works without JS.
                transform: 'scale(var(--preview-scale, 0.62))',
              }}
              className="[--preview-scale:0.52] sm:[--preview-scale:0.58] lg:[--preview-scale:0.66] xl:[--preview-scale:0.72]"
            >
              <TemplateRenderer layout={layout} accentColor={accentColor} />
            </div>
          </div>

          {/* Invisible interaction blocker — sits above the template so users
              can't click, select, or drag elements. Pointer-events:auto here
              but we stop all meaningful events below. */}
          <div
            className="absolute inset-0 z-10 cursor-default select-none"
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
          />

          {/* Upgrade overlay — blurs the bottom half when user can't access */}
          {showUpgradeWall && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          )}

          {/* Template name tag — bottom-left corner */}
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <span className="text-xs font-semibold text-white">{templateName}</span>
            <Badge
              variant={isPro ? 'brand' : 'success'}
              size="sm"
              className="text-[10px]"
            >
              {isPro ? tierLabel : 'Free'}
            </Badge>
          </div>
        </div>

        {/* ═══ RIGHT — Info panel ═════════════════════════════════════════════ */}
        <div className="flex w-72 shrink-0 flex-col bg-white dark:bg-stone-800 lg:w-80">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700">
            <span className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              Template Preview
            </span>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-white"
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
            {/* Template identity */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-xl font-bold text-stone-900 dark:text-white">
                  {templateName}
                </h2>
                {isPro && (
                  <Badge variant="brand" size="sm">
                    <TierIcon className="me-1 h-3 w-3" />
                    {tierLabel}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {showUpgradeWall
                  ? `This is a ${tierLabel} template. Upgrade your plan to use it with your own data.`
                  : 'This preview uses sample data. Select this template to start building your own CV.'}
              </p>
            </div>

            {/* What you get — only shown for locked pro templates */}
            {showUpgradeWall && (
              <div className="rounded-xl border border-stone-100 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/60">
                <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  <TierIcon className="h-3.5 w-3.5 text-brand-500" />
                  {tierLabel} Plan Includes
                </p>
                <ul className="space-y-2">
                  {PRO_PERKS.map((perk) => (
                    <li key={perk} className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Accent color swatch */}
            <div className="flex items-center gap-3">
              <div
                className="h-8 w-8 rounded-lg border border-stone-200 shadow-sm dark:border-stone-600"
                style={{ background: accentColor }}
              />
              <div>
                <p className="text-xs font-medium text-stone-700 dark:text-stone-300">Accent color</p>
                <p className="font-mono text-xs text-stone-400 dark:text-stone-500 uppercase">
                  {accentColor}
                </p>
              </div>
            </div>

            {/* Interaction note */}
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This preview is read-only and protected. All content is sample data.
            </p>
          </div>

          {/* Footer CTA */}
          <div className="border-t border-stone-200 p-5 dark:border-stone-700">
            {showUpgradeWall ? (
              <div className="space-y-3">
                <Button
                  variant="primary"
                  className="w-full"
                  icon={<ArrowRight className="h-4 w-4" />}
                  onClick={() => {
                    onClose();
                    router.push('/settings/billing');
                  }}
                >
                  Upgrade to {tierLabel}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-stone-500"
                  onClick={onClose}
                >
                  Maybe Later
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    onClose();
                    onSelect();
                  }}
                >
                  {isPro ? 'Select Template' : 'Use for Free'}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-stone-500"
                  onClick={onClose}
                >
                  Back to Gallery
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
