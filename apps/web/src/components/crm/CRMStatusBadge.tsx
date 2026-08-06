'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  CRMCustomerStatus,
  CRMLeadStage,
  CRMTransactionStatus,
} from '@flacroncv/shared-types';

const CUSTOMER_STATUS_STYLES: Record<CRMCustomerStatus, string> = {
  [CRMCustomerStatus.ACTIVE]:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  [CRMCustomerStatus.INACTIVE]:
    'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  [CRMCustomerStatus.LEAD]:
    'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

const LEAD_STAGE_STYLES: Record<CRMLeadStage, string> = {
  [CRMLeadStage.NEW]:
    'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  [CRMLeadStage.CONTACTED]:
    'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  [CRMLeadStage.QUALIFIED]:
    'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  [CRMLeadStage.PROPOSAL]:
    'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  [CRMLeadStage.CLOSED_WON]:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  [CRMLeadStage.CLOSED_LOST]:
    'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const TX_STATUS_STYLES: Record<CRMTransactionStatus, string> = {
  [CRMTransactionStatus.COMPLETED]:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  [CRMTransactionStatus.PENDING]:
    'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  [CRMTransactionStatus.REFUNDED]:
    'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  [CRMTransactionStatus.FAILED]:
    'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

// Maps each status/stage/transaction enum value to its crm i18n key.
const LABEL_KEY_MAP: Record<string, string> = {
  active: 'active',
  inactive: 'inactive',
  lead: 'lead',
  new: 'new',
  contacted: 'contacted',
  qualified: 'qualified',
  proposal: 'proposal',
  closed_won: 'won',
  closed_lost: 'lost',
  completed: 'completed',
  pending: 'pending',
  refunded: 'refunded',
  failed: 'failed',
};

interface CRMStatusBadgeProps {
  value: CRMCustomerStatus | CRMLeadStage | CRMTransactionStatus;
  type: 'customer' | 'lead' | 'transaction';
  size?: 'sm' | 'md';
}

export default function CRMStatusBadge({
  value,
  type,
  size = 'md',
}: CRMStatusBadgeProps) {
  const t = useTranslations('crm');
  let style = '';

  if (type === 'customer') {
    style = CUSTOMER_STATUS_STYLES[value as CRMCustomerStatus] ?? '';
  } else if (type === 'lead') {
    style = LEAD_STAGE_STYLES[value as CRMLeadStage] ?? '';
  } else {
    style = TX_STATUS_STYLES[value as CRMTransactionStatus] ?? '';
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        style,
      )}
    >
      {LABEL_KEY_MAP[value] ? t(LABEL_KEY_MAP[value]) : value}
    </span>
  );
}
