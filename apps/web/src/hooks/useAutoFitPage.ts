'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/** A4 height at 96dpi — the same constant the templates use for `minHeight`. */
const A4_HEIGHT = 1122;

/** Never distort the design beyond these bounds, even if it can't fully fill. */
const MIN_FACTOR = 0.75;
const MAX_FACTOR = 2.2;

/**
 * Only pull a CV back onto one page when it *barely* overflows. Past this the
 * document genuinely needs a second page and squeezing it would hurt legibility.
 */
const MAX_COMPRESS_RATIO = 1.3;

/** Stop once we're within this fraction of the target, or after MAX_PASSES. */
const TOLERANCE = 0.015;
const MAX_PASSES = 4;
/** Damping keeps the multiplicative correction from oscillating. */
const DAMPING = 0.7;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface AutoFitResult {
  /** Vertical-rhythm multiplier applied to the rendered CV. */
  factor: number;
  /**
   * A4 pages the content occupies after fitting. 1 means it fits on one page.
   * Surfaced so the editor can warn before the user discovers the overflow in
   * an exported PDF — the client asked for exactly that.
   */
  pageCount: number;
}

/**
 * Computes a vertical-rhythm multiplier so a CV visually fills its A4 page:
 * a short CV expands its section/item spacing to remove dead space, and a CV
 * that only slightly overflows compresses back onto a single page.
 *
 * It measures the page's *natural* height by momentarily neutralising the
 * `minHeight: 1122px` the templates set (otherwise a short CV always measures
 * exactly one page and we could never detect the gap). This happens inside
 * `useLayoutEffect`, i.e. synchronously before paint, so nothing flickers.
 *
 * The returned factor is fed back into the render, so it converges over a few
 * passes; `signature` resets that loop whenever the CV content actually changes.
 * Any measurement failure falls back to `1` — i.e. exactly today's layout.
 *
 * @param containerRef wrapper holding the template root as its first child
 * @param signature    changes whenever the CV content/styling changes
 */
export function useAutoFitPage(
  containerRef: React.RefObject<HTMLElement | null>,
  signature: string,
): AutoFitResult {
  const [factor, setFactor] = useState(1);
  // Pages the content actually occupies, from the same measurement the fit loop
  // already performs — so warning the user costs no extra layout work.
  const [pageCount, setPageCount] = useState(1);
  const passRef = useRef(0);
  const sigRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    // Content changed → restart from the untouched layout.
    if (sigRef.current !== signature) {
      sigRef.current = signature;
      passRef.current = 0;
      setFactor((prev) => (prev === 1 ? prev : 1));
      return;
    }

    if (passRef.current >= MAX_PASSES) return;

    const page = containerRef.current?.firstElementChild as HTMLElement | null;
    if (!page) return;

    // Measure the true content height with the A4 floor lifted.
    const prevMinHeight = page.style.minHeight;
    page.style.minHeight = '0px';
    const natural = page.scrollHeight;
    page.style.minHeight = prevMinHeight;

    if (!natural || !Number.isFinite(natural)) return;

    // Report how many A4 pages the content occupies as measured. A small
    // tolerance stops a one-pixel rounding difference from claiming a 2nd page.
    const measuredPages = Math.max(1, Math.ceil(natural / (A4_HEIGHT * (1 + TOLERANCE))));
    setPageCount((prev) => (prev === measuredPages ? prev : measuredPages));

    // Genuinely multi-page content: leave it alone and let it paginate.
    if (natural > A4_HEIGHT * MAX_COMPRESS_RATIO && factor === 1) return;

    const ratio = A4_HEIGHT / natural;
    if (Math.abs(ratio - 1) <= TOLERANCE) return; // close enough

    // Only part of the height is spacing, so a raw multiply overshoots — damp it.
    const next = clamp(factor * (1 + (ratio - 1) * DAMPING), MIN_FACTOR, MAX_FACTOR);
    if (Math.abs(next - factor) < 0.01) return; // converged / clamped out

    passRef.current += 1;
    setFactor(next);
  }, [containerRef, signature, factor]);

  return { factor, pageCount };
}
