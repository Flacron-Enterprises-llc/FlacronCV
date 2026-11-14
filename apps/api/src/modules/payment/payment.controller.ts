import { Controller, Post, Get, Body, Headers, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { isNativeMobileRequest } from './legacy-mobile-checkout';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionPlan } from '@flacroncv/shared-types';

@ApiTags('payments')
@Controller('payments')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Takes a PLAN, not a price id.
   *
   * The client used to name the Stripe price. That made the browser the
   * authority on what to charge — it read a compiled-in constant, so an account
   * switch left it posting price ids that no longer existed — and it meant the
   * mobile app, which has always sent `{ plan, interval }`, could never check
   * out at all. The server resolves the price from configuration now, so both
   * clients agree by construction and no caller can name a price.
   */
  @Post('create-checkout-session')
  async createCheckout(
    @CurrentUser() user: FirebaseUser,
    @Body()
    body: {
      plan: SubscriptionPlan;
      interval?: string;
      successUrl?: string;
      cancelUrl?: string;
      expectTrial?: boolean;
    },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentService.createCheckoutSession(
      user.uid,
      { plan: body.plan, interval: body.interval },
      body.successUrl,
      body.cancelUrl,
      body.expectTrial === true,
      // The live mobile app may still buy legacy Pro / Enterprise; see legacy-mobile-checkout.ts.
      { nativeMobile: isNativeMobileRequest(headers) },
    );
  }

  /**
   * Billing-page Pro CTA only. Does not create a Stripe customer.
   * Fail-closed: the client must not label a trial until this returns eligible.
   */
  @Get('trial-eligibility')
  async getTrialEligibility(@CurrentUser() user: FirebaseUser) {
    return this.paymentService.getTrialEligibility(user.uid);
  }

  @Post('verify-session')
  async verifySession(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { sessionId: string },
  ) {
    return this.paymentService.verifySession(user.uid, body.sessionId);
  }

  /**
   * Proration preview for an existing subscriber switching to another
   * current plan. Body `{ plan, interval? }`. Returns `prorationAmount` /
   * `amountDue` (smallest currency unit) and a `prorationDate` to send back.
   */
  @Post('change-plan/preview')
  async previewPlanChange(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { plan: SubscriptionPlan; interval?: string },
  ) {
    return this.paymentService.previewPlanChange(user.uid, { plan: body.plan, interval: body.interval });
  }

  /**
   * Switch an existing subscriber's plan (prorated, invoiced now). Body
   * `{ plan, interval?, prorationDate? }`. Legacy plans are never a target.
   */
  @Post('change-plan')
  async changePlan(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { plan: SubscriptionPlan; interval?: string; prorationDate?: number },
  ) {
    return this.paymentService.changePlan(user.uid, {
      plan: body.plan,
      interval: body.interval,
      prorationDate: typeof body.prorationDate === 'number' ? body.prorationDate : undefined,
    });
  }

  @Post('create-portal-session')
  async createPortal(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { returnUrl: string },
  ) {
    return this.paymentService.createPortalSession(user.uid, body.returnUrl);
  }

  @Get('invoices')
  async getInvoices(@CurrentUser() user: FirebaseUser) {
    return this.paymentService.getInvoices(user.uid);
  }
}
