/**
 * Template display + search copy for the active locale.
 *
 * `nameLocalized` is seeded for all six locales. `descriptionLocalized` exists
 * on the type but the seed does not fill it, so description falls back to the
 * English `description` until that is populated (API/seed — not this slice).
 */
export function localizedTemplateField(
  localized: Record<string, string> | undefined,
  fallback: string,
  locale: string,
): string {
  const fromLocale = localized?.[locale]?.trim();
  if (fromLocale) return fromLocale;
  const fromEn = localized?.en?.trim();
  if (fromEn) return fromEn;
  return fallback;
}

/**
 * Search haystack includes the active locale, English, and every other
 * localized value so a Spanish UI still finds "Classic" and an English query
 * still finds "Clásico".
 */
export function templateSearchHaystack(
  tmpl: {
    name?: string;
    description?: string;
    nameLocalized?: Record<string, string>;
    descriptionLocalized?: Record<string, string>;
  },
  locale: string,
): string {
  const parts = [
    localizedTemplateField(tmpl.nameLocalized, tmpl.name ?? '', locale),
    localizedTemplateField(tmpl.descriptionLocalized, tmpl.description ?? '', locale),
    tmpl.name,
    tmpl.description,
    ...Object.values(tmpl.nameLocalized ?? {}),
    ...Object.values(tmpl.descriptionLocalized ?? {}),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}
