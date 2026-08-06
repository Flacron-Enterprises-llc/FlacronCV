'use client';

import { cn } from '@/lib/utils';
import { KeyboardEvent, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  /**
   * ARIA role for cards used as live status or alert regions (e.g. an
   * in-progress panel or an error banner). Ignored when `onClick` is set,
   * which already applies role="button".
   */
  role?: 'status' | 'alert' | 'region';
  'aria-live'?: 'polite' | 'assertive' | 'off';
  'aria-label'?: string;
}

export default function Card({
  children,
  className,
  hover = false,
  padding = 'md',
  onClick,
  role,
  'aria-live': ariaLive,
  'aria-label': ariaLabel,
}: CardProps) {
  const paddings = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' };

  // A clickable card must be reachable and operable from the keyboard.
  const interactiveProps = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};

  return (
    <div
      className={cn(
        'rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900',
        hover &&
          // The lift affordance mirrors on keyboard focus: the card's own
          // focus (role=button) and a focused wrapping <Link className="group">.
          'transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus-visible:shadow-md focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 group-focus-visible:shadow-md group-focus-visible:-translate-y-0.5',
        onClick && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        paddings[padding],
        className,
      )}
      onClick={onClick}
      // A clickable card's role="button" must win over a decorative role.
      role={onClick ? undefined : role}
      aria-live={ariaLive}
      aria-label={ariaLabel}
      {...interactiveProps}
    >
      {children}
    </div>
  );
}
