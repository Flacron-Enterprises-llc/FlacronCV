import {
  allowPrintSubresource,
  safeColor,
  safeFontFamily,
  safeFontSize,
  sanitizePrintHtml,
} from './print-html';

describe('sanitizePrintHtml', () => {
  it('keeps editor formatting and text-align', () => {
    const html = '<p style="text-align: center">Dear Amara,</p><ul><li><strong>Cut</strong> latency</li></ul><br>';
    expect(sanitizePrintHtml(html)).toBe(
      '<p style="text-align: center">Dear Amara,</p><ul><li><strong>Cut</strong> latency</li></ul><br>',
    );
  });

  it('drops scripts, images, and event handlers', () => {
    const html =
      '<p>Hi</p><script>fetch("http://169.254.169.254/")</script>' +
      '<img src="http://169.254.169.254/latest/">' +
      '<p onclick="alert(1)" style="background:url(http://169.254.169.254/)">Ok</p>';
    const out = sanitizePrintHtml(html);
    expect(out).toBe('<p>Hi</p><p>Ok</p>');
    expect(out).not.toContain('169.254');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
  });

  it('drops a script that is never closed', () => {
    expect(sanitizePrintHtml('<p>Hi</p><script>fetch("http://10.0.0.1/")')).toBe('<p>Hi</p>');
  });

  it('does not treat a less-than in prose as a tag', () => {
    expect(sanitizePrintHtml('<p>latency < 5ms</p>')).toBe('<p>latency &lt; 5ms</p>');
  });
});

describe('print CSS allowlist', () => {
  it('rejects a font-family that breaks out of the style tag', () => {
    expect(safeFontFamily('Inter</style><img src=http://169.254.169.254/>')).toBe('Inter');
    expect(safeFontFamily('Playfair Display')).toBe('Playfair Display');
  });

  it('rejects a color or size that is not a plain value', () => {
    expect(safeColor('#2563eb')).toBe('#2563eb');
    expect(safeColor('red;}</style>')).toBe('#111827');
    expect(safeFontSize('16px')).toBe('16px');
    expect(safeFontSize('medium')).toBe('medium');
    expect(safeFontSize('16px;}</style>')).toBe('16px');
  });
});

describe('allowPrintSubresource', () => {
  it('allows data URLs only', () => {
    expect(allowPrintSubresource('data:image/png;base64,xx')).toBe(true);
    expect(allowPrintSubresource('http://169.254.169.254/')).toBe(false);
    expect(allowPrintSubresource('file:///etc/passwd')).toBe(false);
    expect(allowPrintSubresource('https://fonts.gstatic.com/s/inter.woff2')).toBe(false);
  });
});
