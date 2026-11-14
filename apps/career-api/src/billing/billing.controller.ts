import { Body, Controller, Get, Inject, Patch, Post, Provider } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { BillingError, BillingPageService, PaymentsService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import type { EstimateInput, PlanId, UsageUnit } from '@flacroncv/career-shared';
import { CurrentPrincipal, OwnBillingAccount, Public } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

const PAID_PLANS = ['starter', 'professional', 'career_pro', 'business'] as const;

class DesiredDto {
  @IsString()
  unit!: string;

  @IsInt()
  @Min(0)
  @Max(10000)
  units!: number;
}

class AddonQtyDto {
  @IsString()
  addonId!: string;

  @IsInt()
  @Min(0)
  @Max(10000)
  quantity!: number;
}

class EstimateDto {
  @IsIn(['free', 'starter', 'professional', 'career_pro', 'business'])
  planId!: PlanId;

  @IsIn(['monthly', 'annual'])
  interval!: 'monthly' | 'annual';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DesiredDto)
  desired?: DesiredDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddonQtyDto)
  recurring?: AddonQtyDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddonQtyDto)
  oneTime?: AddonQtyDto[];
}

class CheckoutDto {
  @IsIn(PAID_PLANS)
  planId!: PlanId;

  @IsIn(['monthly', 'annual'])
  interval!: 'monthly' | 'annual';

  @IsIn(['stripe', 'apple', 'google'])
  provider!: 'stripe' | 'apple' | 'google';

  @IsUUID()
  estimateId!: string;
}

class UpgradeDto {
  @IsIn(PAID_PLANS)
  planId!: PlanId;
}

class PortalDto {
  @IsIn(['stripe'])
  provider!: 'stripe';
}

class CapDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000000)
  spendingCapCents!: number | null;
}

export const billingPageProviders: Provider[] = [
  {
    provide: BillingPageService,
    inject: [DatabaseService, PaymentsService],
    useFactory: (database: DatabaseService, payments: PaymentsService) => new BillingPageService(database.connectionPool, payments),
  },
];

@OwnBillingAccount()
@Controller()
export class BillingController {
  constructor(
    @Inject(BillingPageService) private readonly billing: BillingPageService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Public()
  @Get('catalog')
  catalog() {
    return this.billing.catalog();
  }

  @Get('billing')
  account(@CurrentPrincipal() principal: Principal) {
    return this.billing.billing(principal);
  }

  @Get('usage')
  usage(@CurrentPrincipal() principal: Principal) {
    return this.billing.usage(principal);
  }

  @Patch('billing/spending-cap')
  spendingCap(@CurrentPrincipal() principal: Principal, @Body() body: CapDto) {
    return this.billing.setSpendingCap(principal, body.spendingCapCents);
  }

  @Post('estimates')
  estimate(@CurrentPrincipal() principal: Principal, @Body() body: EstimateDto) {
    return this.billing.createEstimate(principal, estimateInput(body));
  }

  @Post('checkout')
  checkout(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CheckoutDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.billing.checkout(principal, body, idempotencyKey);
  }

  @Post('billing/upgrade-preview')
  upgrade(@CurrentPrincipal() principal: Principal, @Body() body: UpgradeDto) {
    return this.payments.upgradePreview(principal.billingAccountId, body.planId);
  }

  @Post('billing/portal')
  portal(@CurrentPrincipal() principal: Principal, @Body() body: PortalDto) {
    return this.billing.portal(principal, body.provider);
  }
}

function estimateInput(body: EstimateDto): EstimateInput {
  return {
    planId: body.planId,
    interval: body.interval,
    desired: body.desired?.map((row) => ({ unit: usageUnit(row.unit), units: row.units })),
    recurring: body.recurring?.map((row) => ({ addonId: row.addonId, quantity: row.quantity })),
    oneTime: body.oneTime?.map((row) => ({ addonId: row.addonId, quantity: row.quantity })),
  };
}

function usageUnit(value: string): UsageUnit {
  if (
    value === 'document_credit' ||
    value === 'resume_analysis' ||
    value === 'action_pack' ||
    value === 'alert_item' ||
    value === 'text_interview' ||
    value === 'voice_minute' ||
    value === 'skill_report' ||
    value === 'scenario_report' ||
    value === 'coaching_response' ||
    value === 'assisted_form' ||
    value === 'map_session' ||
    value === 'messaging_balance'
  ) {
    return value;
  }
  throw new BillingError('validation_error', { field: 'desired', reason: 'invalid' });
}
