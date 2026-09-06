import { Module, forwardRef } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { MobileBillingController } from './mobile-billing.controller';
import { StoreWebhookController } from './store-webhook.controller';
import { PaymentService } from './payment.service';
import { CancelAtPeriodEndReconcileService } from './cancel-at-period-end-reconcile.service';
import { MobileBillingService } from './mobile-billing.service';
import { StoreReceiptVerifier } from './store-receipt-verifier';
import { StoreWebhookService } from './store-webhook.service';
import { GoogleRtdnAuth } from './google-rtdn-auth';
import { UsersModule } from '../users/users.module';

// forwardRef both ways — see the note in UsersModule.
@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [
    PaymentController,
    StripeWebhookController,
    MobileBillingController,
    StoreWebhookController,
  ],
  providers: [
    PaymentService,
    CancelAtPeriodEndReconcileService,
    MobileBillingService,
    StoreReceiptVerifier,
    StoreWebhookService,
    GoogleRtdnAuth,
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
