import { notFound } from 'next/navigation';

// Same title and description as the not-found boundary. On Next 14 the
// browser hydrates from this page's render, so without this the tab title
// flipped from "Page Not Found" to the site default once React took over.
export { generateMetadata } from '../not-found';

// Catch-all for URLs that match no route in this locale. Triggering
// notFound() here renders [locale]/not-found.tsx with the locale layout,
// providers, and translations intact — the pattern next-intl documents for
// localized 404 pages. Static routes always take precedence over this.
export default function CatchAllPage(): never {
  notFound();
}
