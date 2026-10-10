/**
 * Allowlist for HTML that Puppeteer turns into a PDF.
 *
 * Mobile still calls POST /cover-letters/:id/export/pdf and
 * POST /cvs/:id/export/pdf. Those pages also run with JavaScript disabled
 * and with every subresource aborted except `data:` — the print HTML names
 * font-family only and does not fetch font files. This sanitiser is the
 * first gate, so a style-tag breakout never reaches Chromium.
 */

const ALLOWED = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'span', 'div', 'hr',
]);

/** Elements whose contents are discarded, not just the tag. */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
  'form', 'svg', 'math', 'noscript', 'template', 'textarea', 'title', 'head',
]);

const VOID = new Set(['br', 'hr']);

const FONT_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 .,'-]{0,80}$/;
const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FONT_SIZE = /^(?:small|medium|large|\d{1,3}(?:\.\d+)?(?:px|pt|rem|em))$/i;

function skipTag(src: string, i: number): number {
  let quote: string | null = null;
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '>') return j + 1;
  }
  return src.length;
}

function parseTag(raw: string): { name: string; closing: boolean; selfClosing: boolean; attrs: string } | null {
  const match = /^<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>$/.exec(raw);
  if (!match) return null;
  const attrs = match[3] ?? '';
  return {
    closing: Boolean(match[1]),
    name: match[2].toLowerCase(),
    selfClosing: /\/\s*$/.test(attrs),
    attrs,
  };
}

function textAlign(attrs: string): string | null {
  const quoted = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  const style = quoted?.[1] ?? quoted?.[2] ?? '';
  const align = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?=;|$)/i.exec(style);
  if (!align) return null;
  return `text-align: ${align[1].toLowerCase()}`;
}

/** Keep editor formatting. Drop scripts, images, URLs, and event handlers. */
export function sanitizePrintHtml(input: string): string {
  const src = String(input ?? '');
  let i = 0;
  let out = '';
  const dropping: string[] = [];

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      if (dropping.length === 0) out += src.slice(i);
      break;
    }
    if (dropping.length === 0) out += src.slice(i, lt);

    const next = src[lt + 1];
    if (next && !/[a-zA-Z/!]/.test(next)) {
      if (dropping.length === 0) out += '&lt;';
      i = lt + 1;
      continue;
    }

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }

    const end = skipTag(src, lt);
    const parsed = parseTag(src.slice(lt, end));
    i = end;
    if (!parsed) continue;

    if (parsed.closing) {
      if (dropping.length > 0 && dropping[dropping.length - 1] === parsed.name) dropping.pop();
      else if (dropping.length === 0 && ALLOWED.has(parsed.name) && !VOID.has(parsed.name)) {
        out += `</${parsed.name}>`;
      }
      continue;
    }

    if (DROP_WITH_CONTENT.has(parsed.name)) {
      if (!parsed.selfClosing) dropping.push(parsed.name);
      continue;
    }
    if (dropping.length > 0 || !ALLOWED.has(parsed.name)) continue;

    if (VOID.has(parsed.name)) {
      out += `<${parsed.name}>`;
      continue;
    }
    const align = textAlign(parsed.attrs);
    out += align ? `<${parsed.name} style="${align}">` : `<${parsed.name}>`;
  }

  return out;
}

export function safeFontFamily(value: unknown, fallback = 'Inter'): string {
  const v = String(value ?? '').trim();
  if (!FONT_FAMILY.test(v)) return fallback;
  if (/url\s*\(|expression\s*\(|@import|\/\*|\*\//i.test(v)) return fallback;
  return v;
}

export function safeColor(value: unknown, fallback = '#111827'): string {
  const v = String(value ?? '').trim();
  return COLOR.test(v) ? v : fallback;
}

export function safeFontSize(value: unknown, fallback = '16px'): string {
  const v = String(value ?? '').trim();
  return FONT_SIZE.test(v) ? v : fallback;
}

/**
 * Subresources a print page may load. Remote font files are not referenced
 * by these templates, so a font URL is not an exception.
 */
export function allowPrintSubresource(url: string): boolean {
  return url.startsWith('data:');
}
