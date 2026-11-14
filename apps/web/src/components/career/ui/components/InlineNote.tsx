import type { ReactNode } from 'react';
import { cn } from '../cn';

const tones = {
  success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300',
  error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
  info: 'border-career-line bg-career-wash text-career-ink',
} as const;

/**
 * A result message placed next to the action that caused it (not at the top
 * of the page, where it is off-screen on a phone). `dir="auto"` keeps
 * server text and mixed scripts readable in Arabic and Urdu.
 */
export function InlineNote({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} dir="auto" className={cn('rounded-md border px-3 py-2 text-sm', tones[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
    </div>
  );
}
