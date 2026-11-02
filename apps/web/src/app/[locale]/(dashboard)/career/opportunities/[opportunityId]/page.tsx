'use client';

import { CareerOpportunityDetailRoute } from '@/components/career/CareerRoutes';

export default function Page({ params }: { params: { opportunityId: string } }) {
  return <CareerOpportunityDetailRoute opportunityId={params.opportunityId} />;
}
