'use client';

import { Suspense } from 'react';
import { CareerCoachRoute } from '@/components/career/CareerRoutes';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CareerCoachRoute />
    </Suspense>
  );
}
