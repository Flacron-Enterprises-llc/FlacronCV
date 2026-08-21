'use client';

import { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

const LINK_CLASS =
  'font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-400';

const NEW_TAB = { target: '_blank' as const, rel: 'noopener noreferrer' };

/** Legal routes as next-intl rich tags. Open in a new tab so the form is not lost. */
export function legalDocLinks(className: string = LINK_CLASS) {
  return {
    terms: (chunks: ReactNode) => (
      <Link href="/terms-of-service" className={className} {...NEW_TAB}>
        {chunks}
      </Link>
    ),
    privacy: (chunks: ReactNode) => (
      <Link href="/privacy-policy" className={className} {...NEW_TAB}>
        {chunks}
      </Link>
    ),
    disclaimer: (chunks: ReactNode) => (
      <Link href="/disclaimer" className={className} {...NEW_TAB}>
        {chunks}
      </Link>
    ),
    refund: (chunks: ReactNode) => (
      <Link href="/refund-policy" className={className} {...NEW_TAB}>
        {chunks}
      </Link>
    ),
  };
}

interface LegalAcceptanceModalProps {
  isOpen: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onAccept: () => void;
  onCancel: () => void;
  accepting?: boolean;
}

export default function LegalAcceptanceModal({
  isOpen,
  checked,
  onCheckedChange,
  onAccept,
  onCancel,
  accepting = false,
}: LegalAcceptanceModalProps) {
  const t = useTranslations('auth');
  const checkboxId = 'legal-acceptance-checkbox';

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={t('legal_modal_title')} size="lg">
      <label htmlFor={checkboxId} className="flex cursor-pointer items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 text-brand-600 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-900"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
        <span className="text-sm text-stone-700 dark:text-stone-300">
          {t.rich('legal_modal_checkbox', legalDocLinks())}
        </span>
      </label>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={accepting}>
          {t('legal_modal_cancel')}
        </Button>
        <Button type="button" onClick={onAccept} disabled={!checked || accepting} loading={accepting}>
          {t('legal_modal_accept')}
        </Button>
      </div>
    </Modal>
  );
}
