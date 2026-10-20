'use client';

import { useEffect, useRef } from 'react';

interface AppTourCardProps {
  title: string;
  body: string;
  progress: string;
  backLabel: string;
  skipLabel: string;
  nextLabel: string;
  finishLabel: string;
  dialogLabel: string;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
}

/**
 * The tooltip itself. Positioning and the spotlight live in the overlay so
 * this card can be tested without a route or a target element.
 */
export default function AppTourCard({
  title,
  body,
  progress,
  backLabel,
  skipLabel,
  nextLabel,
  finishLabel,
  dialogLabel,
  isFirst,
  isLast,
  busy,
  onBack,
  onSkip,
  onNext,
}: AppTourCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [title, body]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onSkip();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...node.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [busy, onSkip]);

  const buttonClass =
    'rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-stone-900';

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
      aria-labelledby="app-tour-title"
      aria-describedby="app-tour-body"
      className="w-[min(22rem,calc(100vw-1rem))] max-h-[min(70vh,24rem)] overflow-y-auto rounded-xl border border-stone-200 bg-white p-4 text-stone-900 shadow-xl motion-reduce:transition-none dark:border-stone-700 dark:bg-stone-900 dark:text-white"
    >
      <p className="text-xs font-medium text-stone-500 dark:text-stone-400">{progress}</p>
      <h2
        id="app-tour-title"
        ref={titleRef}
        tabIndex={-1}
        className="mt-1 text-base font-semibold outline-none"
      >
        {title}
      </h2>
      <p id="app-tour-body" className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
        {body}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${buttonClass} text-stone-600 hover:bg-stone-100 disabled:hover:bg-transparent dark:text-stone-300 dark:hover:bg-stone-800`}
          onClick={onBack}
          disabled={isFirst || busy}
        >
          {backLabel}
        </button>
        <button
          type="button"
          className={`${buttonClass} ms-auto text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800`}
          onClick={onSkip}
          disabled={busy}
        >
          {skipLabel}
        </button>
        <button
          type="button"
          className={`${buttonClass} bg-brand-600 text-white hover:bg-brand-700`}
          onClick={onNext}
          disabled={busy}
        >
          {isLast ? finishLabel : nextLabel}
        </button>
      </div>
    </div>
  );
}
