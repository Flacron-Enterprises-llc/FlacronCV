/**
 * Map the `?template=` the public /templates gallery puts on
 * /cover-letters/new to an editor template id.
 *
 * The gallery uses the template documents' slugs (`cl-classic`, `cl-modern`,
 * …) while the editor and the stored letter use the bare id (`classic`). An
 * unknown or missing value yields null — the caller keeps its default — so a
 * stale or hand-edited link can never break the page.
 */
export function coverLetterTemplateFromParam(
  param: string | null | undefined,
  knownIds: readonly string[],
): string | null {
  const raw = (param ?? '').trim().toLowerCase();
  if (!raw) return null;
  const id = raw.startsWith('cl-') ? raw.slice(3) : raw;
  return knownIds.includes(id) ? id : null;
}
