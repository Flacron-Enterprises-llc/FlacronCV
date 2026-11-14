'use client';

import { useId, useRef, type InputHTMLAttributes } from 'react';
import { cn } from '../cn';

/**
 * A styled file picker: the native input stays in the page (keyboard, screen
 * readers, form reset) but is visually hidden behind a button and the chosen
 * file's name, so the browser's unstyled "Choose File" control never shows.
 */
export function FilePicker({
  label,
  buttonLabel,
  emptyLabel,
  fileName,
  hint,
  disabled,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  buttonLabel: string;
  emptyLabel: string;
  fileName?: string | null;
  hint?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-career-ink">
        {label}
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <input ref={input} id={id} type="file" className="peer sr-only" disabled={disabled} {...props} />
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="inline-flex min-h-career-touch items-center rounded-md border border-career-line bg-career-surface px-4 text-sm font-semibold text-career-ink transition-colors hover:bg-career-wash disabled:cursor-not-allowed disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-career-orange-text"
          aria-hidden="true"
          tabIndex={-1}
        >
          {buttonLabel}
        </button>
        <span className="min-w-0 break-all text-sm text-career-muted">{fileName || emptyLabel}</span>
      </div>
      {hint ? <p className="text-sm text-career-muted">{hint}</p> : null}
    </div>
  );
}
