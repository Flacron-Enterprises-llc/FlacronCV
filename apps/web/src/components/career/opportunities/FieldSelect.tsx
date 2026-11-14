'use client';

import { useId, type SelectHTMLAttributes } from 'react';

/** A labelled native select sized like the career `Input` (touch target, theme tokens). */
export function FieldSelect({
  label,
  options,
  hint,
  id,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label: string;
  options: Array<{ value: string; label: string }>;
  hint?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-semibold text-career-ink">
        {label}
      </label>
      <select
        id={fieldId}
        aria-describedby={hint ? `${fieldId}-hint` : undefined}
        className="block min-h-career-touch w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-career-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A labelled checkbox row with a touch-sized hit area. */
export function FieldCheck({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex min-h-career-touch items-center gap-2 text-sm text-career-ink">
      <input type="checkbox" {...props} />
      {label}
    </label>
  );
}
