'use client';

import { CareerScopeRoute } from '@/components/career/CareerRoutes';

/** Where a Business invitation link lands: sign in, then accept. */
export default function Page() {
  return <CareerScopeRoute mode="join" />;
}
