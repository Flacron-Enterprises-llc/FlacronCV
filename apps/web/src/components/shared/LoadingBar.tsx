'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/** Fake-progress steps after a route change: [delay ms, width %]. */
const STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 20],
  [100, 60],
  [200, 80],
  [500, 100],
];
/** When the full bar is removed. */
const HIDE_AFTER_MS = 700;

export default function LoadingBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState<number | null>(null);
  // Every timer lives here so a cleanup always cancels the whole sequence.
  // The previous version left its hide timer untracked, so a render that was
  // thrown away and redone mid-sequence (which is what happens on a not-found
  // page, where React re-renders the tree after the server's error shell)
  // could cancel the 100% step without restarting it, leaving the bar frozen
  // part-way across the top of the page.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    clear();
    for (const [delay, width] of STEPS) {
      timers.current.push(setTimeout(() => setProgress(width), delay));
    }
    timers.current.push(setTimeout(() => setProgress(null), HIDE_AFTER_MS));
    return () => {
      clear();
      // Never leave a half-filled bar behind if the sequence is cut short.
      setProgress(null);
    };
  }, [pathname]);

  if (progress === null) return null;

  return (
    <div
      aria-hidden="true"
      // start-0, not left-0: the bar grows by width, so in Arabic and Urdu it
      // has to be anchored to the reading start or it fills away from the edge
      // the reader's eye is on.
      className="pointer-events-none fixed start-0 top-0 z-50 h-1 bg-brand-600 transition-all duration-300 ease-out"
      style={{ width: `${progress}%` }}
    />
  );
}
