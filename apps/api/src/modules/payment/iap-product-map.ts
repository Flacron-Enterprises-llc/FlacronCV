import { SubscriptionPlan } from '@flacroncv/shared-types';

export type IapProductMap = {
  proMonthly?: string;
  proYearly?: string;
  enterpriseMonthly?: string;
  enterpriseYearly?: string;
};

/** Client cannot name a plan. Only env-configured store product ids grant. */
export function mapIapProductId(
  products: IapProductMap | undefined,
  productId: string,
): SubscriptionPlan | null {
  if (!products || !productId) return null;
  const pairs: Array<[SubscriptionPlan, string | undefined]> = [
    [SubscriptionPlan.PRO, products.proMonthly],
    [SubscriptionPlan.PRO, products.proYearly],
    [SubscriptionPlan.ENTERPRISE, products.enterpriseMonthly],
    [SubscriptionPlan.ENTERPRISE, products.enterpriseYearly],
  ];
  const hit = pairs.find(([, id]) => id && id === productId);
  return hit ? hit[0] : null;
}
