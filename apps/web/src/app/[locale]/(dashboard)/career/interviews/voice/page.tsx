'use client';

import { Suspense } from 'react';
import { CareerVoiceRoute } from '@/components/career/CareerRoutes';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CareerVoiceRoute />
    </Suspense>
  );
}
