import { Body, Controller, Headers, HttpCode, Logger, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BillingError, PaymentsService } from '@flacroncv/career-server';
import type { DeliveryOutcome } from '@flacroncv/career-server';
import { Public } from '../auth/auth.guard';

/**
 * API_CONTRACT "Webhooks". No user token: each route checks the
 * provider's signature first. A bad signature is `unauthenticated`. A
 * replayed, ignored, or rejected delivery still answers `{ ok: true }` so
 * the provider stops retrying; the outcome is in `billing_events`.
 */
@Public()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger('Webhooks');

  constructor(private readonly payments: PaymentsService) {}

  @Post('stripe')
  @HttpCode(200)
  async stripe(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    const rawBody = req.rawBody?.toString('utf8');
    if (!rawBody) throw new BillingError('validation_error', { reason: 'no_body' });
    this.log('stripe', await this.payments.stripeWebhook(rawBody, signature));
    return { ok: true };
  }

  @Post('apple')
  @HttpCode(200)
  async apple(@Body() body: unknown) {
    this.log('apple', await this.payments.appleWebhook(body));
    return { ok: true };
  }

  @Post('google')
  @HttpCode(200)
  async google(@Body() body: unknown, @Headers('authorization') authorization?: string) {
    this.log('google', await this.payments.googleWebhook(body, authorization));
    return { ok: true };
  }

  private log(provider: string, result: DeliveryOutcome) {
    const line = `${provider} ${result.outcome}${result.detail ? ` ${result.detail}` : ''}`;
    if (result.outcome === 'rejected') this.logger.warn(line);
    else this.logger.log(line);
  }
}
