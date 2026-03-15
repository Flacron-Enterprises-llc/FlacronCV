import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';

@ApiTags('payments')
@Controller('payments')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-checkout-session')
  async createCheckout(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { priceId: string; successUrl: string; cancelUrl: string },
  ) {
    return this.paymentService.createCheckoutSession(
      user.uid,
      body.priceId,
      body.successUrl,
      body.cancelUrl,
    );
  }

  @Post('verify-session')
  async verifySession(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { sessionId: string },
  ) {
    return this.paymentService.verifySession(user.uid, body.sessionId);
  }

  @Post('create-portal-session')
  async createPortal(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { returnUrl: string },
  ) {
    return this.paymentService.createPortalSession(user.uid, body.returnUrl);
  }
}
