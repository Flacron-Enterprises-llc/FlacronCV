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

function Probe({ error }: { error: unknown }) {
  const format = useApiErrorMessage();
  return <p data-testid="msg">{format(error)}</p>;
}

function readMsg(locale: string, messages: Record<string, unknown>, error: unknown): string {
  const { getByTestId, unmount } = render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Probe error={error} />
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

  it('localizes the HTTP fallback and leaves a real API body.message alone', () => {
    expect(readMsg('en', en, new ApiError('Request failed (HTTP 502)', { kind: 'http', status: 502 }))).toBe(
      'Request failed (HTTP 502)',
    );
    expect(readMsg('es', es, new ApiError('Request failed (HTTP 502)', { kind: 'http', status: 502 }))).toBe(
      (es.auth as { errors: { http: string } }).errors.http.replace('{status}', '502'),
    );
    expect(readMsg('es', es, new ApiError('Plan limit reached', { kind: 'http', status: 403 }))).toBe(
      'Plan limit reached',
    );
  });
});
