import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import type { PublicPlanCatalog } from './plan-prices';

/**
 * Public, unauthenticated catalog for the pricing page: the five current plans
 * (never a legacy one) with prices, limits, trial, and whether each billing
 * interval can be bought right now (`configured`). An unconfigured plan is
 * shown as "Coming soon" + Contact us; its checkout answers PLAN_NOT_CONFIGURED.
 */
@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly payments: PaymentService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Public plan catalog (prices, limits, purchase availability)' })
  getCatalog(): PublicPlanCatalog {
    return this.payments.getPublicCatalog();
  }
}
