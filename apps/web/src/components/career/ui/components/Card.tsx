import { HTMLAttributes } from 'react';
import { cn } from '../cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  accent?: boolean;
}

export function Card({ accent = false, className, children, ...props }: CardProps) {
  return (
    <article
      className={cn(
        'relative rounded-lg border border-career-line bg-career-surface p-4 shadow-sm sm:p-6',
        accent && 'border-career-orange shadow-md',
        className,
      )}
      {...props}
    >
      {accent ? <span className="absolute inset-x-0 top-0 h-1 rounded-t-lg bg-career-orange" aria-hidden="true" /> : null}
      {children}
    </article>
  );
}
