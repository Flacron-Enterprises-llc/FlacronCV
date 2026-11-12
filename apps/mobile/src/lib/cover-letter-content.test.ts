import { describe, expect, it } from 'vitest';
import {
  applyParagraphRewrite,
  contentToSave,
  hasRichFormatting,
  replaceParagraphInHtml,
  replaceParagraphInText,
  splitParagraphs,
} from './cover-letter-content';
import { contentForEditor, htmlToPlainText, toLetterHtml } from './letter-html';

const PLAIN_HTML = '<p>Dear Ms Smith,</p><p>I am applying for the role.<br>Thanks.</p><p>Kind regards,</p>';
const RICH_HTML =
  '<p>Dear Ms Smith,</p><p>I <strong>led</strong> the team.</p><ul><li><p>Shipped A</p></li><li><p>Shipped B</p></li></ul><p style="text-align: center">Kind regards,</p>';

describe('letter-html (plain view)', () => {
  it('keeps paragraphs and line breaks', () => {
    expect(contentForEditor(PLAIN_HTML)).toBe(
      'Dear Ms Smith,\n\nI am applying for the role.\nThanks.\n\nKind regards,',
    );
  });

  it('keeps list items on their own bullet lines', () => {
    expect(htmlToPlainText('<ul><li>One</li><li>Two</li></ul><p>After</p>')).toBe('• One\n\n• Two\n\nAfter');
    expect(contentForEditor(RICH_HTML)).toContain('• Shipped A');
    expect(contentForEditor(RICH_HTML)).toContain('• Shipped B');
  });

  it('decodes &amp; last so escaped entities are not double-decoded', () => {
    expect(htmlToPlainText('<p>A &amp;lt; B &amp; C &lt;5ms &#39;x&#39; &#8212;</p>')).toBe("A &lt; B & C <5ms 'x' —");
  });

  it('round-trips plain prose through toLetterHtml', () => {
    const text = 'First para.\n\nSecond "quoted" & <5ms.';
    expect(contentForEditor(toLetterHtml(text))).toBe(text);
  });

  it('leaves non-HTML content alone', () => {
    expect(contentForEditor('throughput <5ms\n\nok')).toBe('throughput <5ms\n\nok');
  });
});

describe('hasRichFormatting', () => {
  it('is false for plain text, bare paragraphs and breaks', () => {
    expect(hasRichFormatting('')).toBe(false);
    expect(hasRichFormatting(null)).toBe(false);
    expect(hasRichFormatting('plain <b>not html</b> text')).toBe(false);
    expect(hasRichFormatting(PLAIN_HTML)).toBe(false);
    expect(hasRichFormatting('<p>a<br />b</p><p></p>')).toBe(false);
  });

  it('is true for marks, lists, headings and aligned paragraphs', () => {
    expect(hasRichFormatting('<p>I <strong>led</strong></p>')).toBe(true);
    expect(hasRichFormatting('<p><em>x</em></p>')).toBe(true);
    expect(hasRichFormatting('<ul><li>x</li></ul>')).toBe(true);
    expect(hasRichFormatting('<h2>x</h2>')).toBe(true);
    expect(hasRichFormatting('<p style="text-align: center">x</p>')).toBe(true);
    expect(hasRichFormatting(RICH_HTML)).toBe(true);
  });
});

describe('contentToSave', () => {
  it('sends nothing when the text is untouched (formatting preserved)', () => {
    const editorText = contentForEditor(RICH_HTML);
    expect(contentToSave({ savedHtml: RICH_HTML, baseHtml: RICH_HTML, editorText })).toBeUndefined();
  });

  it('sends the in-place edited HTML after a paragraph rewrite', () => {
    const edited = replaceParagraphInHtml(RICH_HTML, 'Dear Ms Smith,', 'Dear Hiring Team,')!;
    const editorText = contentForEditor(edited);
    expect(contentToSave({ savedHtml: RICH_HTML, baseHtml: edited, editorText })).toBe(edited);
  });

  it('converts typed edits to <p> HTML', () => {
    const editorText = `${contentForEditor(PLAIN_HTML)}\n\nP.S. More.`;
    const out = contentToSave({ savedHtml: PLAIN_HTML, baseHtml: PLAIN_HTML, editorText });
    expect(out).toBe(toLetterHtml(editorText));
    expect(out).toContain('<p>P.S. More.</p>');
  });

  it('treats plain stored text the same way', () => {
    expect(contentToSave({ savedHtml: 'Hello', baseHtml: 'Hello', editorText: 'Hello' })).toBeUndefined();
    expect(contentToSave({ savedHtml: 'Hello', baseHtml: 'Hello', editorText: 'Hello there' })).toBe('<p>Hello there</p>');
  });

  it('sends an empty string when the user cleared the letter', () => {
    expect(contentToSave({ savedHtml: PLAIN_HTML, baseHtml: PLAIN_HTML, editorText: '' })).toBe('');
  });
});

describe('paragraph helpers', () => {
  it('splits on blank lines', () => {
    expect(splitParagraphs(' a \n\n\n b\nc \n \n')).toEqual(['a', 'b\nc']);
    expect(splitParagraphs(undefined)).toEqual([]);
  });

  it('replaces one paragraph in plain text', () => {
    expect(replaceParagraphInText('A\n\nB\n\nC', 'B', 'B1\n\nB2')).toBe('A\n\nB1\n\nB2\n\nC');
    expect(replaceParagraphInText('A\n\nB', 'Z', 'x')).toBeNull();
    expect(replaceParagraphInText('A\n\nB', 'B', '   ')).toBeNull();
  });

  it('replaces one <p> in HTML, escaping the new text and keeping everything else', () => {
    const out = replaceParagraphInHtml(RICH_HTML, 'Kind regards,', 'Best <wishes> & thanks,')!;
    expect(out).toContain('<p style="text-align: center">Best &lt;wishes&gt; &amp; thanks,</p>');
    expect(out).toContain('<strong>led</strong>');
    expect(out).toContain('<ul><li><p>Shipped A</p></li>');
    expect(out.startsWith('<p>Dear Ms Smith,</p>')).toBe(true);
  });

  it('matches a paragraph containing marks and list items shown with bullets', () => {
    expect(replaceParagraphInHtml(RICH_HTML, 'I led the team.', 'I ran the team.')).toBe(
      RICH_HTML.replace('<p>I <strong>led</strong> the team.</p>', '<p>I ran the team.</p>'),
    );
    expect(replaceParagraphInHtml(RICH_HTML, '• Shipped B', 'Shipped C')).toContain('<li><p>Shipped C</p></li>');
  });

  it('returns null when nothing matches', () => {
    expect(replaceParagraphInHtml(RICH_HTML, 'Not there', 'x')).toBeNull();
    expect(replaceParagraphInHtml('plain text', 'plain text', 'x')).toBeNull();
  });
});

describe('applyParagraphRewrite', () => {
  it('edits the HTML in place when there is no unsaved typing', () => {
    const editorText = contentForEditor(RICH_HTML);
    const result = applyParagraphRewrite({
      baseHtml: RICH_HTML,
      editorText,
      original: 'Dear Ms Smith,',
      replacement: 'Dear Hiring Team,',
      allowPlainEdit: false,
    });
    expect(result.kind).toBe('html');
    if (result.kind === 'html') {
      expect(result.html).toContain('<strong>led</strong>');
      expect(result.text.startsWith('Dear Hiring Team,')).toBe(true);
    }
  });

  it('falls back to the plain text when typing is unsaved and plain editing is allowed', () => {
    const editorText = 'Dear Ms Smith,\n\nTyped here.';
    const result = applyParagraphRewrite({
      baseHtml: PLAIN_HTML,
      editorText,
      original: 'Typed here.',
      replacement: 'Rewritten.',
      allowPlainEdit: true,
    });
    expect(result).toEqual({ kind: 'text', text: 'Dear Ms Smith,\n\nRewritten.' });
  });

  it('refuses to flatten a locked formatted letter', () => {
    const result = applyParagraphRewrite({
      baseHtml: '<ul><li>Only a list item</li></ul>',
      editorText: contentForEditor('<ul><li>Only a list item</li></ul>'),
      original: '• Only a list item',
      replacement: 'x',
      allowPlainEdit: false,
    });
    expect(result.kind).toBe('locked');
  });

  it('reports not-found when the paragraph is gone', () => {
    const result = applyParagraphRewrite({
      baseHtml: PLAIN_HTML,
      editorText: 'Something else entirely',
      original: 'Dear Ms Smith,',
      replacement: 'x',
      allowPlainEdit: true,
    });
    expect(result.kind).toBe('not-found');
  });
});
