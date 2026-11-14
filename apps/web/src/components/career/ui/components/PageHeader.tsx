import type { ReactNode } from 'react';
import { cn } from '../cn';

/**
 * The one page header every career screen uses, matching the V1 dashboard
 * pages (Jobs, Cover letters): a 2xl bold title, a short muted description,
 * and actions that wrap under the title on a phone.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-balance text-2xl font-bold text-stone-900 dark:text-white">{title}</h1>
        {description ? <p className="mt-1 text-pretty text-sm text-stone-500 dark:text-stone-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Vertical rhythm shared by every career screen; the career layout sets the width. */
export function ScreenStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-w-0 flex-col gap-6', className)}>{children}</div>;
}
