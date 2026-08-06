import { Module, forwardRef } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PaymentService } from './payment.service';
import { UsersModule } from '../users/users.module';

// forwardRef both ways — see the note in UsersModule.
@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [PaymentController, StripeWebhookController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
