'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ApiClient, BillingAccount } from '@flacroncv/career-api-client';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { usePlanFormat } from '../plan-format';

/** Whole dollars 1..100,000 → cents; '' → no cap (null); anything else is invalid (undefined). */
export function parseCapDollars(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d{1,6}$/.test(trimmed)) return undefined;
  const dollars = Number(trimmed);
  return dollars >= 1 && dollars <= 100_000 ? dollars * 100 : undefined;
}

/**
 * Monthly spending cap for optional top-ups (spec §11: automatic overages off
 * by default; top-ups need consent, compatible packs and a cap). Shown only
 * while packs are actually on sale — a cap on nothing purchasable is noise.
 */
export function SpendingCapCard({ api, userId }: { api: ApiClient; userId: string }) {
  const t = useTranslations('plan_catalog.cap');
  const fmt = usePlanFormat();
  const queryClient = useQueryClient();
  const key = ['career-billing-account', userId] as const;
  const account = useQuery<BillingAccount>({ queryKey: key, queryFn: () => api.billing(), retry: false });
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const cap = account.data?.spendingCapCents;
    setDraft(cap === null || cap === undefined ? '' : String(Math.round(cap / 100)));
  }, [account.data?.spendingCapCents]);

  const save = useMutation({
    mutationFn: (cents: number | null) => api.setSpendingCap(cents),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      toast.success(t('saved'));
    },
    onError: () => toast.error(t('save_failed')),
  });

  if (account.isError) return null;
  const cap = account.data?.spendingCapCents ?? null;

  return (
    <Card>
      <h3 className="text-lg font-semibold text-stone-900 dark:text-white">{t('title')}</h3>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('intro')}</p>
      <p className="mt-2 text-sm font-medium text-stone-800 dark:text-stone-200" data-testid="spending-cap-current">
        {cap === null ? t('none') : t('current', { amount: fmt.usd(cap) })}
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const cents = parseCapDollars(draft);
          if (cents === undefined) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          save.mutate(cents);
        }}
      >
        <div className="space-y-1">
          <label htmlFor="spending-cap" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            {t('label')}
          </label>
          <input
            id="spending-cap"
            inputMode="numeric"
            value={draft}
            placeholder={t('placeholder')}
            aria-invalid={invalid}
            aria-describedby="spending-cap-help"
            onChange={(event) => setDraft(event.target.value)}
            className="input-field h-10 w-40"
          />
        </div>
        <Button type="submit" variant="secondary" loading={save.isPending} disabled={account.isLoading}>
          {t('save')}
        </Button>
      </form>
      <p id="spending-cap-help" className={invalid ? 'mt-1 text-xs text-red-600 dark:text-red-400' : 'mt-1 text-xs text-stone-500 dark:text-stone-400'}>
        {invalid ? t('invalid') : t('help')}
      </p>
    </Card>
  );
}
