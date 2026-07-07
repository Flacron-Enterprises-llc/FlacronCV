import { IsEnum, IsOptional } from 'class-validator';
import { SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';

export class UpdateUserPlanDto {
  @IsEnum(SubscriptionPlan, { message: `plan must be one of: ${Object.values(SubscriptionPlan).join(', ')}` })
  plan!: SubscriptionPlan;

  @IsOptional()
  @IsEnum(SubscriptionStatus, { message: `status must be one of: ${Object.values(SubscriptionStatus).join(', ')}` })
  status?: SubscriptionStatus;
}
