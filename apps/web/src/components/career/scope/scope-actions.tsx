'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isApiError } from '@flacroncv/career-api-client';
import { InlineNote } from '@/components/career/ui';

/**
 * A result message for one action. Each panel keeps one per action and shows
 * it beside that action's button, so a refusal for "Create an API key" never
 * appears as a page-wide note about something else.
 */
export interface ActionNote {
  tone: 'success' | 'error' | 'info';
  /** Key under `career.scope`. */
  key: string;
  values?: Record<string, string | number>;
}

/** Maps an API refusal to the message for the action that was refused. */
export function errorNote(error: unknown, notForSale = 'closed_body'): ActionNote {
  if (isApiError(error, 'plan_upgrade_required')) return { tone: 'error', key: 'upgrade_body' };
  // Say that the allowance is used up, not only that nothing was saved.
  if (isApiError(error, 'quota_exhausted')) return { tone: 'error', key: 'quota_used_body' };
  if (isApiError(error, 'capacity_exceeded')) return { tone: 'error', key: 'quota_body' };
  if (isApiError(error, 'not_purchasable')) return { tone: 'info', key: notForSale };
  if (isApiError(error, 'permission_denied')) return { tone: 'error', key: 'permission_body' };
  if (isApiError(error, 'not_found')) return { tone: 'error', key: 'not_found_body' };
  if (isApiError(error, 'feature_unavailable')) return { tone: 'info', key: 'off_body' };
  if (isApiError(error, 'provider_unavailable')) return { tone: 'error', key: 'provider_body' };
  if (isApiError(error, 'validation_error')) {
    if (error.body.field === 'attribution') return { tone: 'error', key: 'attribution_body' };
    return { tone: 'error', key: 'invalid_body' };
  }
  return { tone: 'error', key: 'failed_body' };
}

/**
 * One request at a time per panel: a double click cannot send two paid
 * requests. `run` returns false when another action was still running.
 */
export function useScopeBusy() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (work: () => Promise<void>): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      await work();
      return true;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

export function ScopeNote({ note, className }: { note: ActionNote | null; className?: string }) {
  const t = useTranslations('career.scope');
  if (!note) return null;
  return (
    <InlineNote tone={note.tone} className={className}>
      {t(note.key, note.values)}
    </InlineNote>
  );
}
