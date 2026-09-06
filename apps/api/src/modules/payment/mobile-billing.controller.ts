import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { MobileBillingService } from './mobile-billing.service';
import { VerifyMobilePurchaseDto } from './dto/verify-mobile-purchase.dto';

/**
 * Store receipt verify. Unused by clients until Stage 2 (expo-iap).
 * Stripe checkout/portal/webhooks are unchanged.
 */
@ApiTags('payments')
@Controller('billing/mobile')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class MobileBillingController {
  constructor(private readonly mobileBilling: MobileBillingService) {}

  @Post('verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verify(@CurrentUser() user: FirebaseUser, @Body() body: VerifyMobilePurchaseDto) {
    return this.mobileBilling.verify(user.uid, body);
  }
}
