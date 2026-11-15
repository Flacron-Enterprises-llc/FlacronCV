import axios from 'axios';
import { aiCreditsExhaustedMessage } from '../config/paid-upgrades';
import { isNetworkFailure, nestErrorCode, nestErrorMessage } from './api-errors';
import { t } from '../i18n';

/**
 * Same branches as SummaryStep (E6): no connection, unconfirmed refund,
 * credits exhausted, then a generic fallback. Do not collapse these.
 */
export function engineFailureMessage(
  err: unknown,
  fallback = t('errors.engine.generic'),
): string {
  if (isNetworkFailure(err) || (axios.isAxiosError(err) && !err.response)) {
    return t('common.noConnection');
  }
  const data = axios.isAxiosError(err) ? err.response?.data : undefined;
  const rec = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const message =
    typeof rec.message === 'string' ? rec.message : nestErrorMessage(err);
  const code = typeof rec.code === 'string' ? rec.code : nestErrorCode(err);

  if (code === 'AI_CREDIT_NOT_REFUNDED') {
    return t('errors.engine.creditNotRefunded');
  }
  // Five-plan metering (same codes the website maps): nothing ran, nothing was used.
  if (code === 'USAGE_METER_UNAVAILABLE') {
    return t('plans.upgrade.fact.meter');
  }
  if (code === 'ANALYSES_EXHAUSTED') {
    return t('plans.upgrade.fact.analyses');
  }
  if (/credit/i.test(message)) {
    return aiCreditsExhaustedMessage('summaryHttp');
  }
  return fallback;
}
