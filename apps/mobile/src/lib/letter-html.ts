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

/**
 * Decode the entities TipTap / escapeHtml produce. `&amp;` goes LAST so an
 * escaped entity typed as text ("&amp;lt;") comes back as "&lt;", not "<".
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (m, dec: string) => safeCodePoint(Number(dec), m))
    .replace(/&#x([0-9a-f]+);/gi, (m, hex: string) => safeCodePoint(parseInt(hex, 16), m))
    .replace(/&amp;/g, '&');
}

function safeCodePoint(code: number, fallback: string): string {
  try {
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * HTML from AI/web → plain text for TextInput.
 *
 * Lossy by nature (bold/italic/underline, list semantics and alignment have no
 * plain-text form). List items stay on their own "• " lines and headings stay
 * their own paragraph so the text is readable; callers use
 * `hasRichFormatting` (cover-letter-content.ts) to make the loss an explicit
 * choice before plain text is ever written back.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  if (!looksLikeHtml(html)) return html;

  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/(p|h[1-6]|ul|ol|blockquote)>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/• \n+/g, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Shape stored content for the mobile editor. */
export function contentForEditor(content: string | null | undefined): string {
  return htmlToPlainText(content ?? '');
}
