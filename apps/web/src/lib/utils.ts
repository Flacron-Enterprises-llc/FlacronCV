import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toDate } from './format-date';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date-ish value as "Jul 29, 2026".
 *
 * Parsing is delegated to `toDate` (format-date.ts) because firebase-admin
 * serialises a Firestore Timestamp as `{_seconds,_nanoseconds}` — the
 * underscore-prefixed shape. The previous local implementation only understood
 * `{seconds}`, so every Firestore-backed timestamp fell through to
 * `new Date(object)` → Invalid Date → an EMPTY string. That is what rendered
 * bare "Updated" labels (with no date) on the cover-letter cards, the admin
 * template cards, and the ticket/CV/job lists.
 *
 * Returns an em dash rather than '' for a missing/unparseable value so a label
 * like "Updated {date}" can never render as a dangling word again.
 */
export function formatDate(date: unknown): string {
  const d = toDate(date);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
