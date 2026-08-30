import axios from 'axios';

/** Nest AllExceptionsFilter body: `{ success, statusCode, message, code? }`. */
export function nestErrorMessage(err: unknown): string {
  if (!axios.isAxiosError(err)) return '';
  const data = err.response?.data;
  if (!data || typeof data !== 'object') return '';
  const raw = (data as { message?: unknown }).message;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === 'string').join(' ');
  return '';
}

export function nestErrorCode(err: unknown): string {
  if (!axios.isAxiosError(err)) return '';
  const data = err.response?.data;
  if (!data || typeof data !== 'object') return '';
  const code = (data as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

export function isNetworkFailure(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

/** Prefer server copy (abuse / limit); then network; else fallback. */
export function requestFailureMessage(err: unknown, fallback: string): string {
  if (isNetworkFailure(err)) {
    return 'No connection. Check your network and try again.';
  }
  const message = nestErrorMessage(err);
  if (message) return message;
  return fallback;
}

export function isLimitRejection(err: unknown): boolean {
  if (!axios.isAxiosError(err) || err.response?.status !== 403) return false;
  return /limit reached/i.test(nestErrorMessage(err));
}

/** Free create / AI blocked until Firebase email is verified (abuse grant). */
export function isEmailUnverifiedRejection(err: unknown): boolean {
  return nestErrorCode(err) === 'ABUSE_EMAIL_UNVERIFIED';
}
