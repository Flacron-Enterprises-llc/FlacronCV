import { Controller, Get, Inject } from '@nestjs/common';
import { CATALOG_VERSION, FEATURE_PHASE } from '@flacroncv/career-shared';
import type { FeatureId } from '@flacroncv/career-shared';
import { BillingPageService, isFeatureEnabled } from '@flacroncv/career-server';
import type { CareerAccess, CatalogSnapshot, Principal } from '@flacroncv/career-server';
import { AccessOnly, CurrentCareerAccess, CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

/**
 * What the V1 web app needs to decide whether to show the career area.
 * Navigation is convenience only: every career route checks access again.
 */
@Controller()
export class AccessController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** Creates no career rows. `features` lists the operator switches (feature_flags, else catalog phase). */
  @AccessOnly()
  @Get('access')
  async access(@CurrentCareerAccess() access: CareerAccess) {
    const features: Partial<Record<FeatureId, boolean>> = {};
    if (access.enabled) {
      const snapshot = await this.snapshot();
      for (const feature of Object.keys(FEATURE_PHASE) as FeatureId[]) {
        features[feature] = await isFeatureEnabled(this.database.connectionPool, snapshot, feature);
      }
    }
    return access.enabled
      ? { enabled: true, v1Plan: access.v1Plan, careerPlan: access.careerPlan, features }
      : { enabled: false, v1Plan: access.v1Plan, reason: access.reason, features };
  }

  private async snapshot(): Promise<CatalogSnapshot> {
    const res = await this.database.connectionPool.query<{ snapshot: CatalogSnapshot }>(
      `SELECT snapshot FROM catalog_versions WHERE version = $1`,
      [CATALOG_VERSION],
    );
    if (!res.rows[0]) throw new Error('Catalog version is not published; run the career migrations');
    return res.rows[0].snapshot;
  }
}

/**
 * Career allowance balances only. V2's prices, checkout, packs, spending caps
 * and store webhooks are not served: V1's billing is unchanged and remains
 * the only place a customer pays.
 */
@Controller()
export class UsageController {
  constructor(@Inject(BillingPageService) private readonly billing: BillingPageService) {}

  @Get('usage')
  usage(@CurrentPrincipal() principal: Principal) {
    return this.billing.usage(principal);
  }
}
