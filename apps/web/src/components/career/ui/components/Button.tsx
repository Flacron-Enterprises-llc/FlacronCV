'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../cn';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: string;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-career-navy text-white dark:text-stone-950 hover:bg-career-navy-hover',
  accent: 'bg-career-orange-text text-white hover:opacity-90',
  secondary: 'border border-career-line bg-career-surface text-career-ink hover:bg-career-wash',
  ghost: 'text-career-ink hover:bg-career-wash',
  danger: 'bg-career-danger text-white hover:opacity-90 dark:text-stone-950',
  // A text-only destructive action. Its own variant: a className colour cannot
  // override the ghost variant's text colour (cn does not merge classes).
  'danger-ghost': 'text-career-danger hover:bg-career-danger/10',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', loading = false, loadingLabel, disabled, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex min-h-career-touch cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-career-orange-text focus-visible:ring-offset-2 focus-visible:ring-offset-career-canvas',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="fc-spinner" aria-hidden="true" /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
});
