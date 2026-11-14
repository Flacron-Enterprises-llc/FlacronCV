import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Provider } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { BillingPageService, UsageService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

class SeenDto {
  /** Without ids, every unseen warning of the current month. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids?: string[];
}

class CapDto {
  /** Monthly ceiling for automatic top-ups, in cents. `null` removes it (and turns top-ups off). */
  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  spendingCapCents!: number | null;
}

class TopUpDto {
  @IsBoolean()
  enabled!: boolean;

  /** Must be `true` to turn top-ups on: the customer ticked the consent box themselves. */
  @IsOptional()
  @IsBoolean()
  consent?: boolean;

  /** Preferred pack per unit, e.g. `{ "document_credit": "document_m" }`. */
  @IsOptional()
  @IsObject()
  addons?: Record<string, string>;
}

export const usageProviders: Provider[] = [
  {
    provide: UsageService,
    inject: [DatabaseService],
    useFactory: (database: DatabaseService) => new UsageService(database.connectionPool),
  },
];

/**
 * The usage page (spec section 11): balances, renewal date, packs, the
 * 80/95/100 percent warnings, storage grace and the top-up opt-in. Prices
 * and payments stay in V1; nothing here charges.
 */
@Controller()
export class UsageController {
  constructor(
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(BillingPageService) private readonly billing: BillingPageService,
  ) {}

  @Get('usage')
  summary(@CurrentPrincipal() principal: Principal) {
    return this.usage.summary(principal);
  }

  @Post('usage/warnings/seen')
  @HttpCode(200)
  seen(@CurrentPrincipal() principal: Principal, @Body() body: SeenDto) {
    return this.usage.markWarningsSeen(principal, body.ids);
  }

  /** Off by default. A cap alone buys nothing; top-ups also need `PATCH billing/top-up` with consent. */
  @Patch('billing/spending-cap')
  async spendingCap(@CurrentPrincipal() principal: Principal, @Body() body: CapDto) {
    await this.billing.setSpendingCap(principal, body.spendingCapCents);
    return (await this.usage.summary(principal)).topUp;
  }

  @Patch('billing/top-up')
  topUp(@CurrentPrincipal() principal: Principal, @Body() body: TopUpDto) {
    return this.usage.setTopUp(principal, { enabled: body.enabled, consent: body.consent, addons: body.addons });
  }
}
