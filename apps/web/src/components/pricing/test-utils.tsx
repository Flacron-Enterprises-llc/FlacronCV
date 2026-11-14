import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import en from '../../../public/locales/en/common.json';

/** Renders with real English messages and a fresh query cache; collects missing-message errors. */
export function renderPricing(node: ReactNode, messages: AbstractIntlMessages = en as AbstractIntlMessages, locale = 'en'): RenderResult & { missing: string[] } {
  const missing: string[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
        onError={(error) => {
          missing.push(error.message);
        }}
      >
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, missing };
}
