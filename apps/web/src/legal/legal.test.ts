import { describe, it, expect } from 'vitest';
import { COOKIES } from './cookies';
import { DISCLAIMER } from './disclaimer';
import { REFUND } from './refund';
import { TERMS } from './terms';
import { LEGAL_VERSION, LEGAL_VERSION_MAP } from './index';

function flattenText(doc: { preamble: { type: string; text?: string; items?: string[] }[]; sections: { id: string; title: string; blocks: { type: string; text?: string; items?: string[] }[] }[] }): string {
  const bits: string[] = [];
  for (const block of [...doc.preamble, ...doc.sections.flatMap((s) => s.blocks)]) {
    if (block.text) bits.push(block.text);
    if (block.items) bits.push(...block.items);
  }
  return bits.join('\n');
}

describe('legal document versions', () => {
  it('records 2026-08-16 on every published English document', () => {
    expect(TERMS.version).toBe(LEGAL_VERSION);
    expect(DISCLAIMER.version).toBe(LEGAL_VERSION);
    expect(REFUND.version).toBe(LEGAL_VERSION);
    expect(COOKIES.version).toBe(LEGAL_VERSION);
    expect(LEGAL_VERSION).toBe('2026-08-16');
  });

  it('keeps privacy pending until the client names AWS SES and OpenAI', () => {
    expect(LEGAL_VERSION_MAP.privacy.status).toBe('pending-client-subprocessors');
    expect(LEGAL_VERSION_MAP.privacy.liveSource).toBe('locale-json');
  });
});

describe('cookie policy holds', () => {
  const text = flattenText(COOKIES);
  const ids = COOKIES.sections.map((s) => s.id);

  it('omits §6 Marketing and does not skip to a rewritten numbering', () => {
    expect(ids).not.toContain('6');
    expect(ids).toEqual(['1', '2', '3', '4', '5', '7', '8', '9', '10', '11', '12', '13', '14']);
    expect(text).not.toMatch(/Marketing Technologies/);
    expect(text).not.toMatch(/Remarketing/);
  });

  it('holds the §2 marketing bullet pending the client', () => {
    expect(text).not.toMatch(/Support marketing where permitted/);
  });

  it('does not list Marketing among third-party technologies or preference toggles', () => {
    const thirdParty = COOKIES.sections.find((s) => s.id === '7')!;
    const items = thirdParty.blocks.flatMap((b) => b.items ?? []);
    expect(items).not.toContain('Marketing');
    const prefs = flattenText({ preamble: [], sections: COOKIES.sections.filter((s) => s.id === '9') });
    expect(prefs).not.toMatch(/Marketing/);
  });
});

describe('terms of service', () => {
  it('ships all 30 numbered sections', () => {
    expect(TERMS.sections.filter((s) => /^\d+$/.test(s.id))).toHaveLength(30);
  });
});
