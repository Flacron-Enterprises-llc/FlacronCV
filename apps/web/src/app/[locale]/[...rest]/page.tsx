import { notFound } from 'next/navigation';

// Catch-all for URLs that match no route in this locale. Triggering
// notFound() here renders [locale]/not-found.tsx with the locale layout,
// providers, and translations intact — the pattern next-intl documents for
// localized 404 pages. Static routes always take precedence over this.
export default function CatchAllPage(): never {
  notFound();
}
