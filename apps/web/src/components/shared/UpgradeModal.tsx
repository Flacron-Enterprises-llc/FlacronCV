'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ALLOWANCES, PLANS } from '@flacroncv/career-shared';
import { useRouter } from '@/i18n/routing';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Sparkles, Check, Crown } from 'lucide-react';
import { SubscriptionPlan } from '@flacroncv/shared-types';
import { useAuth } from '@/providers/AuthProvider';
import { track } from '@/lib/analytics';
import { fcgeUpgradeClicked } from '@/lib/fcge';
import { TEMPLATE_TIER, billingPlanHref, nextPlanUp } from '@/components/pricing/plan-catalog';
import { usePlanFormat } from '@/components/pricing/plan-format';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: 'ai_credits' | 'exports' | 'templates' | 'cvs' | 'cover_letters';
}

const REASON_ICON = {
  ai_credits: Sparkles,
  exports: Crown,
  templates: Crown,
  cvs: Crown,
  cover_letters: Crown,
} as const;

export default function UpgradeModal({ isOpen, onClose, reason = 'ai_credits' }: UpgradeModalProps) {
  const router = useRouter();
  const t = useTranslations('upgrade_modal');
  const tPlans = useTranslations('career.plans');
  const tCatalog = useTranslations('plan_catalog');
  const fmt = usePlanFormat();
  const { user, degraded, placeholderAccount } = useAuth();
  const exhaustedTracked = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      exhaustedTracked.current = false;
      return;
    }
    if (exhaustedTracked.current) return;
    exhaustedTracked.current = true;
    track('free_allowance_exhausted', { reason });
  }, [isOpen, reason]);

  const Icon = REASON_ICON[reason];

  // Stored plan, not resolveEffectivePlan — a past_due paid user must still see
  // the paid copy. The placeholder account always claims Free; treating that as
  // real would tell a paying customer their allowance never renews whenever the
  // API blips.
  const storedPlan = user?.subscription?.plan;
  const isStoredFree =
    Boolean(user) && !degraded && !placeholderAccount && (storedPlan === SubscriptionPlan.FREE || !storedPlan);
  const copyKey =
    isStoredFree && (reason === 'ai_credits' || reason === 'exports') ? `${reason}_free` : reason;

  // The next of the five plans above the customer's (legacy plans count as
  // their equivalent tier). Business has nothing above it: Contact Sales.
  const offeredPlan = nextPlanUp(isStoredFree ? 'free' : storedPlan) ?? null;
  const templateReach = t(`template_reach.${offeredPlan ? TEMPLATE_TIER[offeredPlan] : 'enterprise'}`);

  // Benefits come from the catalog, never hand-written, so the paywall cannot
  // promise more than the plan delivers.
  const offeredFeatures = offeredPlan
    ? [
        tPlans('benefit.documentCredits', { count: ALLOWANCES[offeredPlan].documentCredits ?? 0 }),
        tPlans('benefit.resumeAnalyses', { count: ALLOWANCES[offeredPlan].resumeAnalyses ?? 0 }),
        tCatalog('benefits.resume_versions', { count: ALLOWANCES[offeredPlan].resumeVersions ?? 0, amount: fmt.count(ALLOWANCES[offeredPlan].resumeVersions ?? 0) }),
        templateReach,
        ...(ALLOWANCES[offeredPlan].docxExport ? [tCatalog('benefits.docx')] : []),
        ...(ALLOWANCES[offeredPlan].removeExportBranding ? [tCatalog('benefits.no_branding')] : []),
        tCatalog('benefits.pdf_unlimited'),
      ]
    : [];

  const handleUpgrade = () => {
    onClose();
    if (!offeredPlan) {
      router.push('/pricing#contact-sales');
      return;
    }
    fcgeUpgradeClicked(offeredPlan);
    router.push(billingPlanHref(offeredPlan, 'monthly'));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t(`reasons.${copyKey}.title`)} size="md">
      <div className="space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30">
            <Icon className="h-8 w-8 text-brand-600 dark:text-brand-400" />
          </div>
        </div>

        <p className="text-center text-sm text-stone-600 dark:text-stone-400">
          {t(`reasons.${copyKey}.description`, { reach: templateReach })}
        </p>

        {offeredPlan ? (
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-800/50">
            <h4 className="font-semibold text-stone-900 dark:text-white">
              {t('plan_includes', { plan: fmt.planName(offeredPlan) })}
            </h4>
            <p className="mb-3 mt-0.5 text-sm tabular-nums text-stone-600 dark:text-stone-400">
              {fmt.usd(PLANS[offeredPlan].monthlyCents)}
              {tCatalog('per_month')}
            </p>
            <ul className="space-y-2 text-sm text-stone-600 dark:text-stone-400">
              {offeredFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="min-w-0">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-center text-sm text-stone-600 dark:text-stone-400">{tCatalog('upgrade_top_plan')}</p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button variant="primary" onClick={handleUpgrade} icon={<Crown className="h-4 w-4" />} className="flex-1">
            {offeredPlan ? t('see_plan', { plan: fmt.planName(offeredPlan) }) : tCatalog('contact_sales')}
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {t('maybe_later')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
