import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('nativewind', () => ({ vars: (v: Record<string, string>) => v, useColorScheme: () => ({ colorScheme: 'light' }) }));
const { LIGHT_VALUES, TOKENS, paletteFor } = await import('./palette');

const root = join(__dirname, '..', '..');

function rgb(value: string): [number, number, number] {
  const [r, g, b] = value.split(' ').map(Number);
  return [r!, g!, b!];
}
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(fg: string, bg: string): number {
  const a = luminance(rgb(fg)); const b = luminance(rgb(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('theme palette', () => {
  it('keeps tailwind.config.js :root light defaults equal to the palette (light theme unchanged)', () => {
    const config = readFileSync(join(root, 'tailwind.config.js'), 'utf8');
    for (const [name, value] of Object.entries(LIGHT_VALUES)) {
      expect(config, name).toContain(`'${name}': '${value}'`);
    }
  });

  it('has no fixed white surfaces left in screens (bg-surface follows the theme)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) { if (entry !== 'node_modules') walk(path); continue; }
        if (/\.tsx?$/.test(entry) && /\bbg-white\b/.test(readFileSync(path, 'utf8'))) offenders.push(path);
      }
    };
    walk(join(root, 'app'));
    walk(join(root, 'src'));
    expect(offenders).toEqual([]);
  });

  it.each(['light', 'dark'] as const)('keeps the text/background pairs screens use readable in %s', (scheme) => {
    const t = (name: string) => TOKENS[name]![scheme];
    const pairs: Array<[string, string, number]> = [
      ['--stone-900', '--surface', 4.5], ['--stone-900', '--stone-50', 4.5], ['--stone-700', '--surface', 4.5],
      ['--stone-700', '--stone-50', 4.5], ['--stone-600', '--surface', 4.5], ['--stone-500', '--surface', 3],
      ['--stone-500', '--stone-50', 3], ['--brand-700', '--surface', 4.5], ['--brand-700', '--brand-50', 4.5],
      ['--success', '--success-bg', 4.5], ['--error', '--error-bg', 4.5], ['--warning', '--warning-bg', 4.5],
      ['--success', '--surface', 3], ['--error', '--surface', 4.5], ['--warning', '--surface', 3],
    ];
    for (const [fg, bg, min] of pairs) {
      expect(contrast(t(fg), t(bg)), `${fg} on ${bg} (${scheme})`).toBeGreaterThanOrEqual(min);
    }
  });

  it('gives native props a page, surface and border that differ, per scheme', () => {
    const light = paletteFor('light');
    const dark = paletteFor('dark');
    expect(light).toMatchObject({ surface: '#ffffff', page: '#fafaf9' });
    expect(dark.surface).not.toBe(light.surface);
    expect(new Set([dark.page, dark.surface, dark.border]).size).toBe(3);
  });
});
