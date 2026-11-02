import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import en from '../../../../public/locales/en/common.json';
import ar from '../../../../public/locales/ar/common.json';
import ProductShowcase from '../ProductShowcase';
import TemplateShowcase, { showcaseSelection } from '../TemplateShowcase';

const get = vi.fn();
let signedIn = false;
vi.mock('@/lib/api', () => ({ api: { get: (...args: unknown[]) => get(...args) } }));
vi.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ user: signedIn ? { uid: 'u1' } : null }) }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  class RO {
    observe() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), addListener() {}, removeListener() {} })) as never;
});

const tpl = (slug: string, category: 'cv' | 'cover_letter', name = slug) => ({
  id: slug,
  slug,
  category,
  tier: 'free',
  name,
  nameLocalized: { en: name, ar: `ع-${name}` },
  isActive: true,
});

const CATALOG = [
  tpl('classic', 'cv', 'Classic'),
  tpl('modern', 'cv', 'Modern'),
  tpl('professional', 'cv', 'Professional'),
  tpl('creative', 'cv', 'Creative'),
  tpl('executive', 'cv', 'Executive'),
  tpl('cl-modern', 'cover_letter', 'Modern letter'),
  tpl('cl-classic', 'cover_letter', 'Classic letter'),
];

function wrap(ui: ReactNode, messages: Record<string, unknown> = en, locale = 'en', client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('showcaseSelection', () => {
  it('counts only active templates per category and prefers the showcase order', () => {
    const sel = showcaseSelection([...CATALOG, { ...tpl('bold', 'cv'), isActive: false }] as never);
    expect(sel.cvCount).toBe(5);
    expect(sel.letterCount).toBe(2);
    expect(sel.cvPicks.map((t) => t.slug)).toEqual(['professional', 'modern', 'classic', 'creative']);
    expect(sel.letterPick?.slug).toBe('cl-modern');
  });

  it('never picks a letter slug that has no renderer', () => {
    const sel = showcaseSelection([tpl('cl-unknown', 'cover_letter')] as never);
    expect(sel.letterCount).toBe(1);
    expect(sel.letterPick).toBeUndefined();
  });
});

describe('TemplateShowcase', () => {
  beforeEach(() => get.mockReset());

  it('derives the counts from the catalog and labels previews as sample content', async () => {
    get.mockResolvedValue(CATALOG);
    wrap(<TemplateShowcase />);
    expect(await screen.findByText('CV templates: 5 · Cover-letter templates: 2')).toBeTruthy();
    expect(screen.getByText('Sample content')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Cover letter template Modern letter with sample content' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Browse the template gallery/ }).getAttribute('href')).toBe('/templates');
    expect(screen.getByText('Editable DOCX export on paid plans')).toBeTruthy();
  });

  it('leaves the counts out instead of guessing when the catalog fails', () => {
    // The failed request is seeded into the cache: a live rejected query trips
    // vitest's unhandled-rejection check through React Query's internal thenable.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, refetchOnMount: false } } });
    client.getQueryCache().build(client, { queryKey: ['public-templates'] }).setState({
      status: 'error',
      fetchStatus: 'idle',
      error: new Error('offline'),
      errorUpdatedAt: Date.now(),
      errorUpdateCount: 1,
    });
    wrap(<TemplateShowcase />, en, 'en', client);
    expect(screen.getByText(/Template previews could not be loaded/)).toBeTruthy();
    expect(screen.queryByText(/CV templates:/)).toBeNull();
    expect(screen.getByRole('link', { name: /Browse the template gallery/ })).toBeTruthy();
  });

  it('uses the localized template names in Arabic', async () => {
    get.mockResolvedValue(CATALOG);
    wrap(<TemplateShowcase />, ar as never, 'ar');
    expect(await screen.findByText('ع-Professional')).toBeTruthy();
  });
});

describe('ProductShowcase', () => {
  it('labels fictional listings and tracker counts as samples and links to V1 workflows', () => {
    signedIn = true;
    wrap(<ProductShowcase />);
    expect(screen.getByText('Sample listings')).toBeTruthy();
    expect(screen.getByText('Sample counts')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open the Job Tracker/ }).getAttribute('href')).toBe('/jobs');
    expect(screen.getByRole('link', { name: /Open your CVs/ }).getAttribute('href')).toBe('/cv');
    // The career-only note is absent unless the career integration is built in.
    expect(screen.queryByText(/optional Career add-on/)).toBeNull();
    // Decorative listings are not interactive.
    const listings = screen.getByText('Northwind Studio').closest('ul') as HTMLElement;
    expect(within(listings).queryAllByRole('button')).toHaveLength(0);
    expect(within(listings).queryAllByRole('link')).toHaveLength(0);
  });

  it('sends signed-out visitors to registration', () => {
    signedIn = false;
    wrap(<ProductShowcase />);
    expect(screen.getByRole('link', { name: /Start your CV/ }).getAttribute('href')).toBe('/register');
  });
});
