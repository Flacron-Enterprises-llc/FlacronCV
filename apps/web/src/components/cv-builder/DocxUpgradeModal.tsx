'use client';

import { useTranslations } from 'next-intl';
import { Crown, FileSpreadsheet } from 'lucide-react';
import { SubscriptionPlan } from '@flacroncv/shared-types';
import { useRouter } from '@/i18n/routing';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { fcgeUpgradeClicked } from '@/lib/fcge';

/**
 * Shown when a Free user picks DOCX export.
 *
 * DOCX is included from Starter up (the API answers `docx_requires_paid`), which has
 * nothing to do with export allowance — but the shared UpgradeModal only knew
 * "Export limit reached", so a Free user with exports to spare was told they
 * had run out. This says what is actually true, and that PDF still works.
 */
export default function DocxUpgradeModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useTranslations('cv_builder');
  const tUp = useTranslations('upgrade_modal');
  const router = useRouter();

  const upgrade = () => {
    fcgeUpgradeClicked(SubscriptionPlan.STARTER);
    onClose();
    router.push('/settings/billing');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('docx_pro_title')} size="md">
      <div className="space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30">
            <FileSpreadsheet className="h-8 w-8 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          </div>
        </div>
        <p className="text-center text-sm text-stone-600 dark:text-stone-400">{t('docx_pro_body')}</p>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button variant="primary" onClick={upgrade} icon={<Crown className="h-4 w-4" />} className="flex-1">
            {tUp('upgrade_now')}
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {tUp('maybe_later')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
