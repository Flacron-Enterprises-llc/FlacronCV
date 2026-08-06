import { Module, forwardRef } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsageResetService } from './usage-reset.service';
import { PaymentModule } from '../payment/payment.module';

/**
 * `forwardRef` because PaymentModule already imports this one: PaymentService
 * needs UsersService to read and write subscription state, and account deletion
 * needs PaymentService to stop the billing. Nest resolves the cycle as long as
 * both sides declare it.
 */
@Module({
  imports: [forwardRef(() => PaymentModule)],
  controllers: [UsersController],
  providers: [UsersService, UsageResetService],
  exports: [UsersService],
})
export class UsersModule {}
