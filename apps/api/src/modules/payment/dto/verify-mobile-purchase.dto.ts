import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BillingProvider } from '@flacroncv/shared-types';

/** Store-billed verify only. Stripe stays on /payments/*. */
export const MOBILE_BILLING_PROVIDERS = [BillingProvider.APPLE, BillingProvider.GOOGLE] as const;

export class VerifyMobilePurchaseDto {
  @IsIn(MOBILE_BILLING_PROVIDERS, { message: 'provider must be apple or google' })
  provider!: (typeof MOBILE_BILLING_PROVIDERS)[number];

  /** StoreKit 2 signed transaction JWS. */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  signedTransactionInfo?: string;

  /** Apple transaction id when the JWS is not sent. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  transactionId?: string;

  /** Google Play purchase token. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  purchaseToken?: string;
}
