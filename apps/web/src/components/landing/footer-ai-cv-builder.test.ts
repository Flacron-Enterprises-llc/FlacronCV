import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('footer AI CV Builder link', () => {
  const src = readFileSync(join(__dirname, 'Footer.tsx'), 'utf8');

  it('forces the English locale so a /es visitor is not sent to mixed copy', () => {
    // next-intl Link prefixes the current locale onto href. Putting /en/ in
    // href would become /es/en/ai-cv-builder. locale="en" is the supported
    // switch and is what this assertion pins.
    expect(src).toMatch(/href="\/ai-cv-builder"/);
    expect(src).toMatch(/locale="en"/);
    expect(src).not.toMatch(/href="\/en\/ai-cv-builder"/);
  });
});
