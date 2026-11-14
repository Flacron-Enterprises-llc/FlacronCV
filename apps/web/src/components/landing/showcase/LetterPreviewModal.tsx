'use client';

/**
 * Full-screen preview of a COVER-LETTER template on the public gallery.
 *
 * The CV preview modal (cv-builder/TemplatePreviewModal) renders a sample CV
 * whatever it is given, so cover-letter cards used to open a CV and list CV
 * benefits ("Unlimited CV exports"). This modal renders the letter with the
 * same renderer the homepage showcase and the editor use (LetterThumb), and
 * lists what the template's plan really includes, straight from the limits
 * the API enforces (localizedPlanFeatures).
 */

import { useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle2, Lock, X } from 'lucide-react';
import { PLAN_CONFIGS, SubscriptionPlan } from '@flacroncv/shared-types';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { useModalA11y } from '@/hooks/useModalA11y';
import { localizedPlanFeatures } from '@/lib/plan-features';
import { LetterThumb } from './DocumentThumb';

export interface LetterPreviewModalProps {
  onClose: () => void;
  /** Catalogue slug, `cl-<renderer id>`. */
  slug: string;
  templateName: string;
  tier: SubscriptionPlan;
  /** Localized tier name for display. */
  tierName: string;
  /** Signed in and on a plan that includes this template. */
  userCanAccess: boolean;
  /** Called for the primary action when the visitor may use the template. */
  onSelect: () => void;
  /** Called for the primary action when the template needs a higher plan. */
  onUpgrade: () => void;
}

export default function LetterPreviewModal({
  onClose,
  slug,
  templateName,
  tier,
  tierName,
  userCanAccess,
  onSelect,
  onUpgrade,
}: LetterPreviewModalProps) {
  const t = useTranslations('template_picker');
  const tAll = useTranslations();
  const tPricing = useTranslations('pricing');
  const tCommon = useTranslations('common');
  const dialogRef = useModalA11y<HTMLDivElement>(true, onClose);

  const isPaidTier = tier !== SubscriptionPlan.FREE;
  // Signed-out visitors see the plan's contents too; the CTA sends them to
  // sign in (handled by onSelect on the page), never to a dead end.
  const showUpgradeWall = isPaidTier && !userCanAccess;
  const perks = localizedPlanFeatures(
    tier,
    tPricing,
    tAll(`upgrade_modal.template_reach.${PLAN_CONFIGS[tier].limits.templates}`),
  );
  const titleId = `letter-preview-${slug}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch overflow-hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col overflow-hidden shadow-2xl outline-none sm:my-6 sm:rounded-2xl lg:flex-row"
      >
        {/* Letter preview */}
        <div
          className="relative min-h-[45vh] flex-1 overflow-y-auto bg-stone-100 p-4 sm:p-6 lg:min-h-0 dark:bg-stone-900"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="mx-auto w-full max-w-[560px] select-none shadow-lg">
            <LetterThumb slug={slug} label={t('preview_aria', { name: templateName })} />
          </div>
        </div>

        {/* Info panel */}
        <div className="flex w-full shrink-0 flex-col bg-white lg:w-80 dark:bg-stone-800">
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700">
            <span className="text-sm font-semibold text-stone-700 dark:text-stone-300">{t('preview_title')}</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-white"
              aria-label={tCommon('close')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="text-xl font-bold text-stone-900 dark:text-white">
                  {templateName}
                </h2>
                <Badge variant={isPaidTier ? 'brand' : 'success'} size="sm">
                  {tierName}
                </Badge>
              </div>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {showUpgradeWall ? t('locked_desc', { tier: tierName }) : t('unlocked_desc_letter')}
              </p>
            </div>

            <div className="rounded-xl border border-stone-100 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/60">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {t('plan_includes', { tier: tierName })}
              </p>
              <ul className="space-y-2">
                {perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>

            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('readonly_note')}
            </p>
          </div>

          <div className="space-y-3 border-t border-stone-200 p-5 dark:border-stone-700">
            {showUpgradeWall ? (
              <Button
                variant="primary"
                className="w-full"
                icon={<ArrowRight className="h-4 w-4" />}
                onClick={() => {
                  onClose();
                  onUpgrade();
                }}
              >
                {t('upgrade_to', { tier: tierName })}
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full"
                onClick={() => {
                  onClose();
                  onSelect();
                }}
              >
                {isPaidTier ? t('select_template') : t('use_free')}
              </Button>
            )}
            <Button variant="ghost" className="w-full text-stone-500" onClick={onClose}>
              {t('back_to_gallery')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
