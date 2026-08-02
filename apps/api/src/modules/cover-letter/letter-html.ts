/**
 * Normalise a generated cover letter into the HTML shape the editor and the
 * templates both expect.
 *
 * The AI providers return plain prose with blank lines between paragraphs. That
 * string was written to `content` untouched, and every template renders
 * `content` through `dangerouslySetInnerHTML`. HTML does not honour newlines,
 * so a four-paragraph letter arrived at the reader as one unbroken slab of
 * text — the single worst thing about the letters this product generated, and
 * invisible in code review because the string itself looks perfectly formatted.
 *
 * Converting to real `<p>` blocks fixes the rendering and, because each block
 * is escaped on the way in, also stops raw model output from being interpreted
 * as markup. That matters here: the generation prompt embeds a job description
 * pasted from a third-party posting, so the model's output is not fully trusted
 * input. (This is normalisation at one boundary, not a substitute for
 * sanitising the rich-text editor path — see the note in the module below.)
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * True when `content` already looks like the editor's own HTML.
 *
 * The editor stores TipTap's `getHTML()`, which always wraps text in block
 * elements. Re-wrapping that would double-escape it into visible tag soup, so
 * only plain text gets converted. A stray `<` in otherwise-plain prose (e.g.
 * "throughput <5ms") must NOT count as HTML, hence matching a real block tag
 * rather than any angle bracket.
 */
export function looksLikeHtml(content: string): boolean {
  return /<(p|div|ul|ol|li|h[1-6]|blockquote|br)\b[^>]*>/i.test(content);
}

/**
 * Plain prose → `<p>`-per-paragraph HTML. Already-HTML input is returned as-is.
 *
 * Paragraphs split on blank lines. A single newline inside a paragraph becomes
 * `<br>`, because models use them for things like a signature block where the
 * line break is meaningful.
 */
export function toLetterHtml(content: string | null | undefined): string {
  const text = (content ?? '').trim();
  if (!text) return '';
  if (looksLikeHtml(text)) return text;

  return text
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
