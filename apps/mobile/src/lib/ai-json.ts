/**
 * Best-effort parse of a JSON object from an Engine response.
 * Models wrap objects in fences or add a sentence around `{…}`. Credit is
 * already reserved server-side by then — a parse throw looks like a lost credit.
 */
export function extractJsonObject<T = Record<string, unknown>>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
