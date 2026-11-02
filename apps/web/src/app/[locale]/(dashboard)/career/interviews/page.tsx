'use client';

import { Suspense } from 'react';
import { CareerInterviewsRoute } from '@/components/career/CareerRoutes';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CareerInterviewsRoute />
    </Suspense>
  );
}
