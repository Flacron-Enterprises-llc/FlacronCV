import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: null },
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { ApiError } from '@/lib/api';
import { useApiErrorMessage } from './useApiErrorMessage';

const en = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'public', 'locales', 'en', 'common.json'), 'utf8'),
) as Record<string, unknown>;
const es = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'public', 'locales', 'es', 'common.json'), 'utf8'),
) as Record<string, unknown>;

function Probe({ error, fallback }: { error: unknown; fallback?: string }) {
  const format = useApiErrorMessage();
  return <p data-testid="msg">{format(error, fallback)}</p>;
}

function readMsg(locale: string, messages: Record<string, unknown>, error: unknown, fallback?: string): string {
  const { getByTestId, unmount } = render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Probe error={error} fallback={fallback} />
    </NextIntlClientProvider>,
  );
  const text = getByTestId('msg').textContent ?? '';
  unmount();
  cleanup();
  return text;
}

describe('useApiErrorMessage', () => {
  it('maps transport kinds to t() so a Spanish UI does not show English api.ts copy', () => {
    expect(readMsg('es', es, new ApiError('This is taking longer than expected.', { kind: 'timeout' }))).toBe(
      (es.auth as { errors: { timeout: string } }).errors.timeout,
    );
    expect(readMsg('es', es, new ApiError('You appear to be offline.', { kind: 'offline' }))).toBe(
      (es.auth as { errors: { offline: string } }).errors.offline,
    );
    expect(readMsg('es', es, new ApiError("Couldn't reach the server.", { kind: 'network' }))).toBe(
      (es.auth as { errors: { network: string } }).errors.network,
    );
  });

  it('never shows a 5xx body: uses the caller fallback, else the generic message', () => {
    const err = new ApiError('Internal server error', { kind: 'http', status: 500 });
    expect(readMsg('es', es, err, 'No se pudo guardar')).toBe('No se pudo guardar');
    expect(readMsg('en', en, err)).toBe((en.auth as { errors: { generic: string } }).errors.generic);
    expect(readMsg('en', en, new ApiError('Request failed (HTTP 502)', { kind: 'http', status: 502 }))).toBe(
      (en.auth as { errors: { generic: string } }).errors.generic,
    );
  });

  it('localizes the client-built HTTP text when there is no fallback', () => {
    expect(readMsg('es', es, new ApiError('Request failed (HTTP 404)', { kind: 'http', status: 404 }))).toBe(
      (es.auth as { errors: { http: string } }).errors.http.replace('{status}', '404'),
    );
  });

  it('maps known error codes to their own translation', () => {
    const err = new ApiError('No active subscription found. Please subscribe to a plan first.', {
      kind: 'http',
      status: 400,
      code: 'NO_SUBSCRIPTION',
    });
    expect(readMsg('es', es, err, 'fallback')).toBe(
      (es.billing as { errors: { noSubscription: string } }).errors.noSubscription,
    );
  });

  it('keeps an English 4xx sentence in English, prefers the localized fallback elsewhere', () => {
    const err = new ApiError('Plan limit reached', { kind: 'http', status: 403 });
    expect(readMsg('en', en, err, 'Could not save')).toBe('Plan limit reached');
    expect(readMsg('es', es, err, 'No se pudo guardar')).toBe('No se pudo guardar');
    // No fallback: the specific English sentence beats a vague generic one.
    expect(readMsg('es', es, err)).toBe('Plan limit reached');
  });

  it('uses the localized rate-limit message for 429', () => {
    expect(readMsg('es', es, new ApiError('ThrottlerException: Too Many Requests', { kind: 'http', status: 429 }))).toBe(
      (es.auth as { errors: { too_many_attempts: string } }).errors.too_many_attempts,
    );
  });
});
