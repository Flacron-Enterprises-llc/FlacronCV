'use client';

import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';
import type { FeatureState } from './plan-catalog';

/** "Coming soon" / "Needs a connected provider" marker. Nothing for available features. */
export function FeatureStateBadge({ state, className }: { state: FeatureState; className?: string }) {
  const t = useTranslations('plan_catalog.state');
  if (state === 'available') return null;
  return (
    <Badge variant={state === 'coming_soon' ? 'warning' : 'default'} className={className ?? 'ms-1.5 whitespace-normal align-middle'}>
      {t(state)}
    </Badge>
  );
}
