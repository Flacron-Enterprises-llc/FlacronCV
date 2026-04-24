'use client';

import React, { useState } from 'react';
import { Lock, Sparkles, ArrowRight, Crown, Zap, Eye } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import CVThumbnail from '@/components/cv-builder/CVThumbnail';
import TemplatePreviewModal from '@/components/cv-builder/TemplatePreviewModal';
import type { CVLayout } from '@flacroncv/shared-types';

/* ─── Props ──────────────────────────────────────────────────────────────────── */

export interface TemplateCardProps {
  id: string;
  name: string;
  description?: string;
  layout: CVLayout;
  color: string;
  personality?: string;
  /**
   * false → "Free" badge + "Use for Free" button
   * true  → "Pro"  badge + "Buy to Use"   button
   */
  isPro: boolean;
  /** Label shown in paywall/preview ("Pro" | "Enterprise"). Defaults to "Pro". */
  tierLabel?: string;
  /** True while this card's creation request is in-flight. */
  isCreating?: boolean;
  /** True when any creation is pending — disables all action buttons. */
  isDisabled?: boolean;
  /** Called when the user confirms template selection. */
  onSelect: (id: string) => void;
  /** Whether the current user's plan grants access to this template. */
  userCanAccess: boolean;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export default function TemplateCard({
  id,
  name,
  description,
  layout,
  color,
  personality,
  isPro,
  tierLabel = 'Pro',
  isCreating = false,
  isDisabled = false,
  onSelect,
  userCanAccess,
}: TemplateCardProps) {
  const router = useRouter();
  const [showPaywall, setShowPaywall]   = useState(false);
  const [showPreview, setShowPreview]   = useState(false);

  const isLocked = isPro && !userCanAccess;
  const TierIcon = tierLabel === 'Enterprise' ? Crown : Zap;

  const handleSelectClick = () => {
    if (isPro && !userCanAccess) {
      setShowPaywall(true);
      return;
    }
    onSelect(id);
  };

  const handleUpgrade = () => {
    setShowPaywall(false);
    router.push('/settings/billing');
  };

  return (
    <>
      {/* ── Card ── */}
      <div
        className={[
          'group flex flex-col overflow-hidden rounded-2xl border-2 bg-white transition-all dark:bg-stone-800',
          isLocked
            ? 'border-stone-200 opacity-80 dark:border-stone-700'
            : 'border-stone-200 hover:border-brand-400 hover:shadow-md dark:border-stone-700 dark:hover:border-brand-500',
        ].join(' ')}
      >
        {/* ── Thumbnail ── */}
        <div className="relative h-48 overflow-hidden bg-stone-50 dark:bg-stone-900">
          <CVThumbnail layout={layout} color={color} />

          {/* Lock overlay (inaccessible pro templates) */}
          {isLocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-[2px]">
              <Lock className="h-6 w-6 text-white drop-shadow" />
              <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                {tierLabel} Plan Required
              </span>
            </div>
          )}

          {/* ── Hover action bar ── appears on any card hover */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 transition-all group-hover:bg-black/30">
            <button
              onClick={() => setShowPreview(true)}
              disabled={isDisabled}
              className="flex translate-y-2 items-center gap-1.5 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-stone-800 opacity-0 shadow-md transition-all hover:bg-white group-hover:translate-y-0 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Preview ${name} template`}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          </div>

          {/* Personality tag — accessible templates */}
          {!isLocked && personality && (
            <div className="absolute bottom-2 start-2 rounded-full bg-black/50 px-2.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              {personality}
            </div>
          )}
        </div>

        {/* ── Card body ── */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex-1 space-y-1">
            <h3 className="font-semibold text-stone-900 dark:text-white">{name}</h3>
            {description && (
              <p className="line-clamp-2 text-xs text-stone-500 dark:text-stone-400">
                {description}
              </p>
            )}
            <div className="pt-1">
              {isPro ? (
                <Badge variant="brand" size="sm">
                  <TierIcon className="me-1 h-3 w-3" />
                  {tierLabel}
                </Badge>
              ) : (
                <Badge variant="success" size="sm">
                  <Sparkles className="me-1 h-3 w-3" />
                  Free
                </Badge>
              )}
            </div>
          </div>

          {/* CTA button */}
          {isPro ? (
            <Button
              size="sm"
              variant={userCanAccess ? 'primary' : 'outline'}
              className="w-full"
              loading={isCreating}
              disabled={isDisabled}
              icon={!userCanAccess ? <Lock className="h-3.5 w-3.5" /> : undefined}
              onClick={handleSelectClick}
            >
              {userCanAccess ? 'Select Template' : 'Buy to Use'}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              className="w-full"
              loading={isCreating}
              disabled={isDisabled}
              onClick={handleSelectClick}
            >
              Use for Free
            </Button>
          )}
        </div>
      </div>

      {/* ── Full-screen Preview Modal ── */}
      <TemplatePreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        templateName={name}
        layout={layout}
        accentColor={color}
        isPro={isPro}
        tierLabel={tierLabel}
        userCanAccess={userCanAccess}
        onSelect={() => handleSelectClick()}
      />

      {/* ── Purchase Required Modal (direct "Buy to Use" click path) ── */}
      <Modal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        size="sm"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40">
            <TierIcon className="h-8 w-8 text-brand-600 dark:text-brand-400" />
          </div>
          <h3 className="text-xl font-bold text-stone-900 dark:text-white">Purchase Required</h3>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            <span className="font-semibold text-stone-800 dark:text-stone-200">{name}</span> is a{' '}
            <span className="font-semibold text-brand-600 dark:text-brand-400">{tierLabel}</span>{' '}
            template. Upgrade your plan to unlock it and all other {tierLabel} templates.
          </p>
          <ul className="mt-4 w-full space-y-2 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-left text-sm dark:border-stone-700 dark:bg-stone-800/60">
            {[
              'Unlimited CV exports (PDF & DOCX)',
              `Access to all ${tierLabel} templates`,
              'AI-powered writing assistant',
              'Priority customer support',
            ].map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-stone-700 dark:text-stone-300">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                {benefit}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex w-full flex-col gap-3">
            <Button
              variant="primary"
              className="w-full"
              icon={<ArrowRight className="h-4 w-4" />}
              onClick={handleUpgrade}
            >
              Upgrade to {tierLabel}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setShowPaywall(false)}>
              Maybe Later
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
