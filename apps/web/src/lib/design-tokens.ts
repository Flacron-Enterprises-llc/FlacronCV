/**
 * Design tokens shared by every document this app renders — the five CV
 * layouts, the six cover-letter templates, and the picker thumbnails for both.
 *
 * No React import, deliberately: a picker needs the same colour maths as the
 * document it advertises, but not the document's component tree. A thumbnail
 * that derives its colours differently from the layout it previews is a picker
 * that lies about what you are choosing.
 *
 * Everything here is pure and total — malformed input falls back rather than
 * throwing, because these run on a colour the user typed into a picker.
 */

function parseHex(hex: string): [number, number, number] {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#2563eb';
  return [
    parseInt(safe.slice(1, 3), 16),
    parseInt(safe.slice(3, 5), 16),
    parseInt(safe.slice(5, 7), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const safe = hex.startsWith('#') ? hex : '#2563eb';
  const r = parseInt(safe.slice(1, 3), 16) || 0;
  const g = parseInt(safe.slice(3, 5), 16) || 0;
  const b = parseInt(safe.slice(5, 7), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function darken(hex: string, amount = 0.15): string {
  const safe = hex.startsWith('#') ? hex : '#2563eb';
  const r = Math.max(0, Math.round(parseInt(safe.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(safe.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(safe.slice(5, 7), 16) * (1 - amount)));
  return `rgb(${r},${g},${b})`;
}

/** Mix `hex` toward white — the inverse of `darken`, returned as hex. */
export function lighten(hex: string, amount = 0.15): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

// ─── Contrast ────────────────────────────────────────────────────────────────
// A template that paints the user's accent onto a *fixed* panel — the Slate &
// Gold sidebar, say — cannot assume that accent is light. Someone who picks a
// deep navy gets navy-on-slate: rendered, but unreadable. These let a template
// ask for "this accent, but legible here" rather than hard-coding an assumption
// about the user's palette.

/** WCAG 2.1 relative luminance, 0 (black) … 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1 (identical) … 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * `accent`, nudged just far enough to stay legible on `bg`.
 *
 * Mixes toward whichever of white/black is further from `bg`, in 5% steps, and
 * stops at the first value clearing `min` — so an accent that already passes is
 * returned untouched, and one that fails moves the minimum distance rather than
 * being swapped out. The user's hue survives either way, which matters: this
 * runs on someone's brand colour, not on a theme we chose.
 */
export function readableOn(accent: string, bg: string, min = 4.5): string {
  if (contrastRatio(accent, bg) >= min) return accent;
  const target = luminance(bg) < 0.5 ? 255 : 0;
  const [r, g, b] = parseHex(accent);
  for (let i = 1; i <= 20; i++) {
    const k = i * 0.05;
    const out = toHex(r + (target - r) * k, g + (target - g) * k, b + (target - b) * k);
    if (contrastRatio(out, bg) >= min) return out;
  }
  return target === 255 ? '#ffffff' : '#000000';
}

/**
 * `hex`, darkened until white text sits on it legibly.
 *
 * For the templates whose entire identity is white-on-colour — the Corporate
 * sidebar, the Creative header band. Those are drawn with white headings, white
 * name, white contact lines and white-outline tags, so the one thing the panel
 * colour must guarantee is that white reads on it. A user picking a pale gold
 * or a pastel from the swatch row otherwise gets a panel with nothing visible
 * on it at all. Deepening their hue keeps the choice recognisable; ignoring it
 * or substituting a default would not.
 */
export function ensureDarkSurface(hex: string, min = 5): string {
  const [r, g, b] = parseHex(hex);
  let out = toHex(r, g, b);
  for (let i = 0; i <= 20; i++) {
    const k = 1 - i * 0.05;
    out = toHex(r * k, g * k, b * k);
    if (contrastRatio('#ffffff', out) >= min) return out;
  }
  return out;
}

// ─── Neutral ink ramp ────────────────────────────────────────────────────────
// One ramp, shared by every layout. Before this each template invented its own
// greys (#333, #444, #555, #666, #888, #999, #aaa, #4b5563, #5a6a7a), so two
// templates rendering the same CV disagreed about how dark "secondary" was and
// the lightest of them fell below the threshold where laser print holds detail.
// Everything here is ≥ 4.5:1 on white except `hair`, which is a rule, not text.
export const INK = {
  heading: '#111827',  // item titles — the strongest ink on the page
  title:   '#1f2937',
  body:    '#374151',  // paragraph copy
  subtle:  '#4b5563',  // company / institution lines
  meta:    '#6b7280',  // dates, links — quiet but still legible in print
  hair:    '#e2e5ea',  // hairline rules and card borders
} as const;
