/**
 * Renders a JSON-LD script tag. `data` is already a plain object from the
 * builders in `@/lib/json-ld` — this component exists so every page emits the
 * same markup and nobody copies a second `dangerouslySetInnerHTML` pattern.
 */
export default function JsonLd({ data }: { data: unknown }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
