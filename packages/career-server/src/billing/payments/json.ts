/** Typed reads from an untrusted provider payload. Each returns null when the shape is wrong. */
export type JsonObject = Record<string, unknown>;

export function obj(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : null;
}

export function str(o: JsonObject | null, key: string): string | null {
  const v = o?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function num(o: JsonObject | null, key: string): number | null {
  const v = o?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function bool(o: JsonObject | null, key: string): boolean | null {
  const v = o?.[key];
  return typeof v === 'boolean' ? v : null;
}

export function child(o: JsonObject | null, key: string): JsonObject | null {
  return obj(o?.[key]);
}

export function list(o: JsonObject | null, key: string): JsonObject[] {
  const v = o?.[key];
  return Array.isArray(v) ? v.map(obj).filter((x): x is JsonObject => x !== null) : [];
}

export function fromUnixSeconds(seconds: number | null): Date | null {
  return seconds === null ? null : new Date(seconds * 1000);
}

export function fromMillis(ms: number | string | null): Date | null {
  if (ms === null) return null;
  const n = typeof ms === 'string' ? Number(ms) : ms;
  return Number.isFinite(n) ? new Date(n) : null;
}
