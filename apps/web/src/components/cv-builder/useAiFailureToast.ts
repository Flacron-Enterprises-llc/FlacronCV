'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ApiError, isAiCreditUnconfirmed } from '@/lib/api';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';

/**
 * One failure toast for all five AI features (summary, ATS check, interview
 * prep, LinkedIn, resume import).
 *
 * The API's failure body is English ("Flacron Engine generation failed"), and
 * the modals printed it verbatim in every locale; the summary modal also left
 * out the credit line the others showed. Now:
 *  - title: the feature's own translated failure message, except for transport
 *    problems (offline / timeout / network), which keep their specific copy;
 *  - description: whether a credit was used — AI_CREDIT_NOT_REFUNDED says one
 *    may have been, everything else (incl. AI_CREDIT_REFUNDED) says none was.
 */
export function useAiFailureToast() {
  const tCommon = useTranslations('common');
  const formatApiError = useApiErrorMessage();
  return (error: unknown, featureFailedMessage: string) => {
    const transport = error instanceof ApiError && error.kind !== 'http';
    const title = transport ? formatApiError(error, featureFailedMessage) : featureFailedMessage;
    toast.error(title, {
      description: tCommon(
        isAiCreditUnconfirmed(error) ? 'generate_failed_charge_unconfirmed' : 'generate_failed_no_charge',
      ),
    });
  };
}
