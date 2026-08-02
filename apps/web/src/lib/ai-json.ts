/**
 * Best-effort parse of a JSON object emitted by an LLM.
 *
 * Models often wrap the object in ```json fences OR add a sentence before/after
 * it ("Sure, here is the JSON: { … } Hope this helps!"). Stripping fences alone
 * then leaves stray prose that makes JSON.parse throw — and because the AI
 * credit is already spent server-side by the time the client parses, that shows
 * up to the user as "lost a credit, got nothing". Slicing to the outermost
 * {…} before parsing recovers those responses.
 *
 * Returns null when no valid JSON object can be recovered (callers treat null as
 * "unusable AI output").
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
