'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Sparkles, Check, Crown } from 'lucide-react';
import { PLAN_CONFIGS, SubscriptionPlan } from '@flacroncv/shared-types';
import { useAuth } from '@/providers/AuthProvider';
import { track } from '@/lib/analytics';

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

  // Stored plan, not resolveEffectivePlan — a past_due Pro user must still see
  // the paid copy (credits reset next billing month). The placeholder account
  // always claims Free; treating that as real would tell a paying customer
  // their allowance never renews whenever the API blips.
  const storedPlan = user?.subscription?.plan;
  const isStoredFree =
    Boolean(user) && !degraded && !placeholderAccount && (storedPlan === SubscriptionPlan.FREE || !storedPlan);
  const copyKey =
    isStoredFree && (reason === 'ai_credits' || reason === 'exports') ? `${reason}_free` : reason;

  // Today this modal always sells Pro. Keep one binding so a later
  // Free→Enterprise (or Pro→Enterprise) transition cannot update the
  // benefit list and leave the template sentence advertising a different plan.
  const offeredPlan = SubscriptionPlan.PRO;
  const offeredConfig = PLAN_CONFIGS[offeredPlan];
  const templateReach = t(`template_reach.${offeredConfig.limits.templates}`);

  // The benefit list is read from PLAN_CONFIGS, not hand-written.
  //
  // It previously claimed "Unlimited AI Credits" and "Unlimited CVs & Cover
  // Letters" for Pro — Pro actually grants 100 credits and 10 CVs. The paywall
  // was promising more than the plan delivers at the exact moment the user
  // decides to pay. Reading the real config makes that impossible, and the
  // advertised-vs-enforced test in the API suite keeps the config itself honest.
  const offeredFeatures = offeredConfig.features;

  const handleUpgrade = () => {
    onClose();
    router.push('/settings/billing');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t(`reasons.${copyKey}.title`)} size="md">
      <div className="space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30">
            <Icon className="h-8 w-8 text-brand-600 dark:text-brand-400" />
          </div>
        </div>

        {/* Description */}
        <p className="text-center text-sm text-stone-600 dark:text-stone-400">
          {t(`reasons.${copyKey}.description`, { reach: templateReach })}
        </p>

        {/* What the offered plan actually includes */}
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-800/50">
          <h4 className="mb-3 font-semibold text-stone-900 dark:text-white">
            {t('plan_includes', { plan: offeredConfig.name })}
          </h4>
          <ul className="space-y-2 text-sm text-stone-600 dark:text-stone-400">
            {offeredFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="min-w-0">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button
            variant="primary"
            onClick={handleUpgrade}
            icon={<Crown className="h-4 w-4" />}
            className="flex-1"
          >
            {t('upgrade_now')}
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {t('maybe_later')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
