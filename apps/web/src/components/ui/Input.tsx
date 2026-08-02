'use client';

import { forwardRef, InputHTMLAttributes, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, type, ...props }, ref) => {
    const t = useTranslations('common');
    const [revealed, setRevealed] = useState(false);

    // Any password field gets a reveal toggle automatically, so login/register
    // (and anything added later) stay consistent without per-page wiring.
    const isPassword = type === 'password';

    const errorId = id ? `${id}-error` : undefined;
    const hintId = id ? `${id}-hint` : undefined;
    const describedBy = error ? errorId : hint ? hintId : undefined;

    const field = (
      <input
        ref={ref}
        id={id}
        type={isPassword ? (revealed ? 'text' : 'password') : type}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'input-field h-10',
          // Reserve room for the toggle. `pe-` is logical, so it flips in RTL.
          isPassword && 'pe-10',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
          className,
        )}
        {...props}
      />
    );

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            {label}
          </label>
        )}

        {isPassword ? (
          <div className="relative">
            {field}
            <button
              // type="button" is essential — inside a <form> the default would
              // be "submit", so toggling would submit the login form.
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? t('hide_password') : t('show_password')}
              aria-pressed={revealed}
              title={revealed ? t('hide_password') : t('show_password')}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 transition-colors hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:hover:text-stone-300"
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          field
        )}

        {error && <p id={errorId} className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p id={hintId} className="text-xs text-stone-500">{hint}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;
