import axios from 'axios';
import { aiCreditsExhaustedMessage } from '../config/paid-upgrades';
import { isNetworkFailure, nestErrorCode, nestErrorMessage } from './api-errors';

/**
 * Same branches as SummaryStep (E6): no connection, unconfirmed refund,
 * credits exhausted, then a generic fallback. Do not collapse these.
 */
export function engineFailureMessage(
  err: unknown,
  fallback = 'Could not generate. Please try again.',
): string {
  if (isNetworkFailure(err) || (axios.isAxiosError(err) && !err.response)) {
    return 'No connection. Check your network and try again.';
  }
  const data = axios.isAxiosError(err) ? err.response?.data : undefined;
  const rec = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const message =
    typeof rec.message === 'string' ? rec.message : nestErrorMessage(err);
  const code = typeof rec.code === 'string' ? rec.code : nestErrorCode(err);

  if (code === 'AI_CREDIT_NOT_REFUNDED') {
    return 'Could not generate. A credit may have been used. Check your balance and try again.';
  }
  if (/credit/i.test(message)) {
    return aiCreditsExhaustedMessage('summaryHttp');
  }
  return fallback;
}
