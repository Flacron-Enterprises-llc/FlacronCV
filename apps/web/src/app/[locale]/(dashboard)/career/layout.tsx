import { Suspense } from 'react';
import { CareerPageTabs } from '@/components/career/CareerNav';

/**
 * The career pages (former V2 features) inside V1's dashboard shell, which
 * already handles sign-in and email verification redirects. Navigation lives
 * in the dashboard sidebar; only text/voice practice and list/map view add
 * tabs here.
 */
export default function CareerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Suspense fallback={null}>
        <CareerPageTabs />
      </Suspense>
      {children}
    </div>
  );
}
