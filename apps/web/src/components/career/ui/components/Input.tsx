'use client';

import { InputHTMLAttributes, useId, useState } from 'react';
import { cn } from '../cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  showLabel?: string;
  hideLabel?: string;
}

export function Input({
  label,
  hint,
  error,
  id,
  type,
  className,
  showLabel,
  hideLabel,
  ...props
}: InputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [error ? errorId : undefined, hint ? hintId : undefined].filter(Boolean).join(' ') || undefined;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const fieldType = isPassword ? (revealed ? 'text' : 'password') : type;

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-semibold text-career-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          type={fieldType}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink',
            'placeholder:text-career-muted focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40',
            error && 'border-career-danger focus:border-career-danger focus:ring-career-danger/30',
            isPassword && 'pe-16',
            className,
          )}
          {...props}
        />
        {isPassword && showLabel && hideLabel ? (
          <button
            type="button"
            className="absolute inset-y-0 end-1 my-1 rounded-md px-2 text-sm font-semibold text-career-orange-text"
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? hideLabel : showLabel}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-career-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm text-career-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
