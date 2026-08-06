import { toLetterHtml, looksLikeHtml, escapeHtml } from './letter-html';

describe('escapeHtml', () => {
  it('escapes the five characters that matter in an HTML body', () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;',
    );
  });

  it('escapes the ampersand before the entities it introduces', () => {
    // Getting the order wrong turns "&" into "&amp;lt;" for any later escape.
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });
});

describe('looksLikeHtml', () => {
  it('recognises the editor’s own output', () => {
    expect(looksLikeHtml('<p>Dear Sir</p>')).toBe(true);
    expect(looksLikeHtml('<ul><li><p>One</p></li></ul>')).toBe(true);
    expect(looksLikeHtml('line one<br>line two')).toBe(true);
  });

  it('does not mistake prose containing an angle bracket for HTML', () => {
    // A letter can legitimately say "held p95 <5ms". Treating that as HTML
    // would skip normalisation and leave the whole letter as one block.
    expect(looksLikeHtml('We held p95 <5ms under peak load.')).toBe(false);
    expect(looksLikeHtml('Revenue grew 3 -> 12 M and headcount <20.')).toBe(false);
  });
});

describe('toLetterHtml', () => {
  it('turns blank-line-separated prose into one paragraph per block', () => {
    expect(toLetterHtml('First para.\n\nSecond para.\n\nThird para.')).toBe(
      '<p>First para.</p><p>Second para.</p><p>Third para.</p>',
    );
  });

  // The actual regression: the model returns exactly this shape, it was stored
  // verbatim, and every template renders `content` as HTML — where newlines are
  // whitespace. A four-paragraph letter reached the reader as one slab.
  it('does not collapse a multi-paragraph letter into a single block', () => {
    const html = toLetterHtml('Para one.\n\nPara two.\n\nPara three.\n\nPara four.');
    expect(html.match(/<p>/g)).toHaveLength(4);
  });

  it('tolerates ragged blank lines and trailing whitespace', () => {
    expect(toLetterHtml('  One.  \n   \n\n  Two.  \n\n\n')).toBe('<p>One.</p><p>Two.</p>');
  });

  it('keeps a single newline inside a paragraph as a line break', () => {
    expect(toLetterHtml('Sincerely,\nShah Nawal')).toBe('<p>Sincerely,<br>Shah Nawal</p>');
  });

  it('escapes prose so model output cannot become markup', () => {
    expect(toLetterHtml('I scaled it <b>fast</b> & well.')).toBe(
      '<p>I scaled it &lt;b&gt;fast&lt;/b&gt; &amp; well.</p>',
    );
    expect(toLetterHtml('<img src=x onerror=alert(1)>')).not.toContain('<img');
  });

  it('passes editor HTML through untouched rather than double-escaping it', () => {
    const editorHtml = '<p>Dear Amara,</p><ul><li><p>Cut latency 40%</p></li></ul>';
    expect(toLetterHtml(editorHtml)).toBe(editorHtml);
  });

  it('is empty for empty input', () => {
    expect(toLetterHtml('')).toBe('');
    expect(toLetterHtml('   \n  ')).toBe('');
    expect(toLetterHtml(null)).toBe('');
    expect(toLetterHtml(undefined)).toBe('');
  });
});
