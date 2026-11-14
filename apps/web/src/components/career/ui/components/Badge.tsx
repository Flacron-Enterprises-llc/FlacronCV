import { HTMLAttributes } from 'react';
import { cn } from '../cn';
import type { RecordState } from '../tokens';

export type BadgeTone = 'neutral' | 'recommended' | 'later' | RecordState;

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-career-wash text-career-ink',
  recommended: 'bg-career-navy text-white dark:text-stone-950',
  later: 'bg-career-wash text-career-muted',
  draft: 'bg-career-wash text-career-ink',
  confirmed: 'bg-career-orange-tint text-career-navy',
  submitted: 'bg-career-navy text-white dark:text-stone-950',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function RecordStatus({ state, label }: { state: RecordState; label: string }) {
  return <Badge tone={state}>{label}</Badge>;
}
