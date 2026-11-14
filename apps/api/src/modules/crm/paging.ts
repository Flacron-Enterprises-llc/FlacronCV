/**
 * Read a positive integer query parameter (page, limit). Anything missing,
 * non-numeric, zero or negative falls back to `fallback`: `?page=abc` used to
 * become NaN and produce an empty list reporting `page: null`.
 */
export function positiveInt(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
