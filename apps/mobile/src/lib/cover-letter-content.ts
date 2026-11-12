import { contentForEditor, escapeHtml, looksLikeHtml, toLetterHtml } from './letter-html';

/**
 * The mobile editor is plain text; the stored letter is the website's rich-text
 * HTML. These helpers keep one guarantee: the app never rewrites the stored
 * HTML unless the user actually changed the text (or explicitly accepted
 * editing a formatted letter as plain text).
 */

/**
 * True when the stored HTML carries formatting the plain-text editor cannot
 * represent: anything beyond bare `<p>` paragraphs and `<br>` line breaks
 * (bold/italic/underline, lists, headings, alignment styles, links, ...).
 * Saving plain text over such a letter would drop that formatting.
 */
export function hasRichFormatting(content: string | null | undefined): boolean {
  const html = content ?? '';
  if (!looksLikeHtml(html)) return false;
  const tags = html.match(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi) ?? [];
  return tags.some((tag) => !/^<\/?p>$/i.test(tag) && !/^<br\s*\/?>$/i.test(tag));
}

/**
 * The `content` to PUT, or `undefined` to leave the stored letter untouched.
 *
 * - `savedHtml`: what the server holds now.
 * - `baseHtml`: the HTML the editor text was last derived from. Equal to
 *   `savedHtml` unless a paragraph was rewritten in the HTML itself.
 * - `editorText`: what is in the TextInput.
 *
 * When the text still matches `baseHtml`, the HTML is sent as is (so formatting
 * survives); only typed edits are converted with `toLetterHtml`.
 */
export function contentToSave(args: {
  savedHtml: string | null | undefined;
  baseHtml: string | null | undefined;
  editorText: string;
}): string | undefined {
  const saved = args.savedHtml ?? '';
  const base = args.baseHtml ?? '';
  if (args.editorText === contentForEditor(base)) {
    return base === saved ? undefined : base;
  }
  return toLetterHtml(args.editorText);
}

/** Paragraphs of the plain-text letter (blank-line separated), trimmed, non-empty. */
export function splitParagraphs(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/** Bullet prefix the plain view puts in front of list items. */
function stripBullet(text: string): string {
  return text.replace(/^•\s+/, '');
}

function sameParagraph(a: string, b: string): boolean {
  return stripBullet(a.trim()) === stripBullet(b.trim());
}

/**
 * Replace the first paragraph whose text equals `original` (plain text).
 * Returns null when it is no longer there (edited meanwhile) or the
 * replacement is empty — nothing is changed in that case.
 */
export function replaceParagraphInText(
  text: string,
  original: string,
  replacement: string,
): string | null {
  const next = splitParagraphs(replacement);
  if (next.length === 0) return null;
  const blocks = splitParagraphs(text);
  const index = blocks.findIndex((block) => sameParagraph(block, original));
  if (index === -1) return null;
  blocks.splice(index, 1, ...next);
  return blocks.join('\n\n');
}

/**
 * Replace one `<p>` of the stored HTML in place, leaving every other node (and
 * its formatting) byte-for-byte untouched. The new text is escaped; each
 * replacement paragraph reuses the original `<p ...>` opening tag so its
 * alignment survives. Returns null when no paragraph matches.
 */
export function replaceParagraphInHtml(
  html: string,
  original: string,
  replacement: string,
): string | null {
  const next = splitParagraphs(replacement);
  if (next.length === 0 || !looksLikeHtml(html)) return null;
  const pattern = /(<p\b[^>]*>)([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const text = contentForEditor(match[0]);
    if (!text || !sameParagraph(text, original)) continue;
    const openTag = match[1];
    const nodes = next
      .map((p) => `${openTag}${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
    return html.slice(0, match.index) + nodes + html.slice(match.index + match[0].length);
  }
  return null;
}

/**
 * Apply an approved paragraph rewrite. Prefers the in-place HTML edit (keeps
 * formatting) when the editor text has no unsaved typing on top of `baseHtml`;
 * otherwise edits the plain text, unless the letter is still locked as
 * formatted, in which case it refuses rather than flatten it.
 */
export function applyParagraphRewrite(args: {
  baseHtml: string;
  editorText: string;
  original: string;
  replacement: string;
  allowPlainEdit: boolean;
}):
  | { kind: 'html'; html: string; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'not-found' }
  | { kind: 'locked' } {
  const untouched = args.editorText === contentForEditor(args.baseHtml);
  if (untouched && looksLikeHtml(args.baseHtml)) {
    const html = replaceParagraphInHtml(args.baseHtml, args.original, args.replacement);
    if (html !== null) return { kind: 'html', html, text: contentForEditor(html) };
  }
  if (!args.allowPlainEdit) return { kind: 'locked' };
  const text = replaceParagraphInText(args.editorText, args.original, args.replacement);
  return text === null ? { kind: 'not-found' } : { kind: 'text', text };
}
