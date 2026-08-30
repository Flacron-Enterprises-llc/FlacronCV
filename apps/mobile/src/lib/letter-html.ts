/**
 * Mobile editor uses a plain TextInput; API/web store TipTap-style HTML.
 * Keep these helpers in lockstep with `apps/api/src/modules/cover-letter/letter-html.ts`.
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

/** Same block-tag heuristic as the API — stray `<` in prose is not HTML. */
export function looksLikeHtml(content: string): boolean {
  return /<(p|div|ul|ol|li|h[1-6]|blockquote|br)\b[^>]*>/i.test(content);
}

/** Plain prose → `<p>` HTML for save/export. Already-HTML returned as-is. */
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

/** HTML from AI/web → plain text for TextInput. */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  if (!looksLikeHtml(html)) return html;

  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Shape stored content for the mobile editor. */
export function contentForEditor(content: string | null | undefined): string {
  return htmlToPlainText(content ?? '');
}
