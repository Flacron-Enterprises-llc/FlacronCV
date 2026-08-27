import { randomUUID } from 'expo-crypto';
import { SubscriptionPlan } from '../types/enums';

export {
  resolveEffectivePlan,
  effectivePlanForCopy,
  canAccessTemplate,
  canCreateCV,
  canCreateCoverLetter,
  canUseAI,
  canExport,
} from './entitlements';

/**
 * D1 — same input contract as apps/web/src/lib/format-date.ts `toDate`.
 * Firestore Timestamps arrive as `{seconds}` / `{_seconds}` (or a live
 * `.toDate()`); `new Date(thatObject)` is Invalid Date.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' || typeof value === 'string') {
    if (typeof value === 'string' && DATE_ONLY.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      const local = new Date(y, m - 1, d);
      return isNaN(local.getTime()) ? null : local;
    }
    if (value === '') return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.toDate === 'function') {
      const d = (o.toDate as () => Date)();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    const seconds =
      typeof o.seconds === 'number'
        ? o.seconds
        : typeof o._seconds === 'number'
          ? o._seconds
          : null;
    if (seconds != null) {
      const d = new Date(seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

export function formatDate(value: unknown): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function planHasWatermark(plan: SubscriptionPlan): boolean {
  return plan === SubscriptionPlan.FREE;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/** UUID v4 (36 chars). AddSectionDto.id MaxLength(80). Throws; no Math.random fallback. */
export function generateId(): string {
  return randomUUID();
}
