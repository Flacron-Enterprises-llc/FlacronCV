import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Equals, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { CAREER_PLANS, CareerBillingService } from './career-billing.service';

class CareerCheckoutDto {
  @IsIn(CAREER_PLANS as unknown as string[])
  plan!: string;

  @IsIn(['month', 'year'])
  interval!: string;

  /** The amount the person saw and confirmed, in cents; must equal Stripe's price. */
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  expectedAmountCents!: number;

  /** An explicit confirmation from the review step; a feature click never sends it. */
  @Equals(true)
  confirmed!: boolean;
}

/** The web app's locales (apps/web routing); Stripe returns the person to the page in their language. */
export const BILLING_RETURN_LOCALES = ['en', 'fr', 'de', 'es', 'ar', 'ur'] as const;

/**
 * Server-chosen Stripe return URLs for a pack/add-on checkout:
 * `/{locale}/settings/billing?{param}=success|canceled`. An unknown or missing
 * locale is `en` (the DTO already refuses anything outside the list).
 */
export function billingReturnUrls(frontend: string, locale: string | undefined, param: 'pack' | 'addon'): { success: string; cancel: string } {
  const lang = (BILLING_RETURN_LOCALES as readonly string[]).includes(locale ?? '') ? locale : 'en';
  const base = `${frontend}/${lang}/settings/billing`;
  return {
    success: `${base}?${param}=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel: `${base}?${param}=canceled`,
  };
}

/** One-time pack: the amount shown and an explicit confirmation. */
class PackCheckoutDto {
  @IsString()
  @Matches(/^[a-z0-9_]{1,40}$/)
  addonId!: string;

  @IsOptional()
  @IsIn(BILLING_RETURN_LOCALES as unknown as string[])
  locale?: string;

  @IsInt()
  @Min(1)
  @Max(10_000_000)
  expectedAmountCents!: number;

  @Equals(true)
  confirmed!: boolean;
}

/** Recurring capacity add-on: quantity, the total shown, and an explicit confirmation. */
class CapacityCheckoutDto extends PackCheckoutDto {
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

/**
 * Career billing inside V1's Stripe. The career add-on subscription is
 * retired (five-plan model: every plan includes the career tools), so
 * `POST checkout` answers 410 CAREER_ADDON_RETIRED. Packs and capacity
 * add-ons are sold when their Stripe price is configured. The success/cancel
 * URLs are server-chosen.
 */
@ApiTags('career-billing')
@Controller('career-billing')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class CareerBillingController {
  constructor(
    private readonly careerBilling: CareerBillingService,
    private readonly configService: ConfigService,
  ) {}

  @Get('status')
  status(@CurrentUser() user: FirebaseUser) {
    return this.careerBilling.status(user.uid);
  }

  @Post('checkout')
  checkout(
    @CurrentUser() user: FirebaseUser,
    @Body() body: CareerCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const frontend = this.configService.get<string>('frontendUrl') ?? '';
    return this.careerBilling.createCheckout(
      user.uid,
      { plan: body.plan, interval: body.interval, expectedAmountCents: body.expectedAmountCents, idempotencyKey },
      {
        success: `${frontend}/career/plans?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel: `${frontend}/career/plans?checkout=canceled`,
      },
    );
  }

  /** Packs and capacity add-ons: unset Stripe price → 503 ADDON_NOT_ON_SALE; Free → 403 UPGRADE_REQUIRED. */
  @Post('packs/checkout')
  packCheckout(
    @CurrentUser() user: FirebaseUser,
    @Body() body: PackCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const frontend = this.configService.get<string>('frontendUrl') ?? '';
    return this.careerBilling.createPackCheckout(
      user.uid,
      { addonId: body.addonId, expectedAmountCents: body.expectedAmountCents, idempotencyKey },
      billingReturnUrls(frontend, body.locale, 'pack'),
    );
  }

  @Post('capacity/checkout')
  capacityCheckout(
    @CurrentUser() user: FirebaseUser,
    @Body() body: CapacityCheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const frontend = this.configService.get<string>('frontendUrl') ?? '';
    return this.careerBilling.createCapacityCheckout(
      user.uid,
      { addonId: body.addonId, quantity: body.quantity, expectedAmountCents: body.expectedAmountCents, idempotencyKey },
      billingReturnUrls(frontend, body.locale, 'addon'),
    );
  }
}
