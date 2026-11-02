import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Equals, IsIn, IsInt, Max, Min } from 'class-validator';
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

/**
 * Career plans through V1 billing. Purchase is disabled unless
 * CAREER_BILLING_MODE allows it (local fixture only until the commercial
 * model is decided). The success/cancel URLs are server-chosen.
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
}
