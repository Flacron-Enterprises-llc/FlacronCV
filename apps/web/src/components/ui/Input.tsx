'use client';

import { forwardRef, InputHTMLAttributes, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowBigUp, Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Icon before the label text (auth forms). Decorative. */
  icon?: LucideIcon;
  /** 'lg': taller, softer field used on the sign-in / sign-up pages. */
  inputSize?: 'md' | 'lg';
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, type, icon: Icon, inputSize = 'md', 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
    const large = inputSize === 'lg';
    const t = useTranslations('common');
    const [revealed, setRevealed] = useState(false);
    // Caps Lock is the usual reason a correct password "doesn't work".
    const [capsOn, setCapsOn] = useState(false);
    // Most call sites pass a label but no id, which left <label htmlFor> empty:
    // the label was not linked to its field (clicking it did nothing, and a
    // screen reader announced an unlabelled edit box). A generated id fixes
    // that everywhere; an explicit id still wins, so existing ids, tests and
    // anchors are unchanged.
    const generatedId = useId();
    const inputId = id ?? generatedId;

    // Any password field gets a reveal toggle automatically, so login/register
    // (and anything added later) stay consistent without per-page wiring.
    const isPassword = type === 'password';

    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    // The visible error/hint is announced with the field; a caller's own
    // aria-describedby is kept alongside it.
    const describedBy = [error ? errorId : hint ? hintId : undefined, ariaDescribedBy]
      .filter(Boolean)
      .join(' ') || undefined;

    const field = (
      <input
        ref={ref}
        id={inputId}
        type={isPassword ? (revealed ? 'text' : 'password') : type}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
        onKeyDown={(e) => {
          if (isPassword) setCapsOn(e.getModifierState?.('CapsLock') ?? false);
          props.onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          if (isPassword) setCapsOn(e.getModifierState?.('CapsLock') ?? false);
          props.onKeyUp?.(e);
        }}
        onBlur={(e) => {
          setCapsOn(false);
          props.onBlur?.(e);
        }}
        className={cn(
          'input-field',
          large ? 'h-12 rounded-xl bg-stone-50 px-4 text-[15px] focus:bg-white dark:bg-stone-800/60 dark:focus:bg-stone-900' : 'h-10',
          // Reserve room for the toggle. `pe-` is logical, so it flips in RTL.
          isPassword && (large ? 'pe-12' : 'pe-10'),
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
          className,
        )}
      />
    );

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              large
                ? 'flex items-center gap-2 text-sm font-semibold text-navy dark:text-white'
                : 'block text-sm font-medium text-stone-700 dark:text-stone-300',
            )}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
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
              className={cn('absolute top-1/2', large ? 'end-3' : 'end-2', ' -translate-y-1/2 rounded p-1 text-stone-400 transition-colors hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:hover:text-stone-300')}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          field
        )}

        {isPassword && capsOn ? (
          <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400" role="status">
            <ArrowBigUp className="h-3.5 w-3.5" aria-hidden="true" />
            {t('caps_lock_on')}
          </p>
        ) : null}
        {error && <p id={errorId} className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {hint && !error && <p id={hintId} className="text-xs text-stone-500">{hint}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;
