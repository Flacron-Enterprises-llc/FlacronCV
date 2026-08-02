import { Controller, Post, Req, Headers, HttpCode, HttpStatus, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { PaymentService } from './payment.service';
import { Request } from 'express';

@ApiTags('webhooks')
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Everything needed to tell the three causes of a signature failure apart,
   * with nothing sensitive in it.
   *
   * Signature verification has exactly three inputs — the bytes, the secret and
   * the header — and Stripe's error names none of them. This reports the shape
   * of all three so the failure can be attributed without guessing:
   *
   *   • bytes/type — proves whether rawBody survived as a Buffer. A `string`,
   *     or a length that differs from Content-Length, means something
   *     re-encoded the body and no secret would ever match.
   *   • secretLen/secretFp — proves WHICH secret is loaded without printing it.
   *     A `stripe listen` secret and a Dashboard endpoint secret are both 38
   *     chars, so length alone cannot distinguish them; the fingerprint can.
   *     Compare it against the same hash of the secret you expect.
   *   • skewSeconds — Stripe rejects anything outside a 5-minute window, which
   *     produces a *different* error but is worth seeing on the same line
   *     (a replayed or clock-skewed request looks like a bad signature to most
   *     people).
   */
  private diagnostics(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = this.configService.get<string>('stripe.webhookSecret')?.trim() ?? '';
    // First 8 hex chars of a SHA-256 — enough to compare two secrets for
    // equality, useless for recovering either. Never log the secret itself.
    const secretFp = secret ? createHash('sha256').update(secret).digest('hex').slice(0, 8) : 'NONE';

    // `t=1700000000,v1=abc...` — the timestamp Stripe signed with.
    const ts = Number(/(?:^|,)t=(\d+)/.exec(signature ?? '')?.[1]);
    const skewSeconds = Number.isFinite(ts) ? Math.round(Date.now() / 1000 - ts) : null;

    return {
      rawBodyPresent: !!rawBody,
      rawBodyType: rawBody === undefined ? 'undefined' : rawBody.constructor?.name ?? typeof rawBody,
      isBuffer: Buffer.isBuffer(rawBody),
      bytes: rawBody?.length ?? 0,
      signaturePresent: !!signature,
      signatureScheme: /v1=/.test(signature ?? '') ? 'v1' : 'MISSING-v1',
      signatureLen: signature?.length ?? 0,
      secretLen: secret.length,
      secretPrefix: secret.slice(0, 6) || 'NONE', // "whsec_" or wrong-looking
      secretFp,
      skewSeconds,
    };
  }

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string,
  ) {
    if (!request.rawBody) {
      this.logger.error(
        `Raw body not available for webhook ${JSON.stringify(this.diagnostics(request.rawBody, signature))}`,
      );
      throw new BadRequestException('Missing raw body');
    }

    let event: ReturnType<PaymentService['constructEvent']>;
    try {
      event = this.paymentService.constructEvent(request.rawBody, signature);
    } catch (error) {
      const stripeError = error as Error;

      // Log the COMPLETE error — name, message and stack — alongside the shape
      // of all three verification inputs. Stripe's message says the signature
      // did not match; it cannot say whether that is because the bytes changed,
      // the wrong secret is loaded, or the request is stale.
      this.logger.error(
        `Webhook signature verification failed: ${stripeError.name}: ${stripeError.message} ` +
          `| ${JSON.stringify(this.diagnostics(request.rawBody, signature))}`,
        stripeError.stack,
      );

      // Return Stripe's message VERBATIM — no prefix, no substitution.
      //
      // Stripe distinguishes several causes: no signature header, a payload
      // that does not match, a timestamp outside the tolerance window. Each
      // points at a different fix, and each is worded to say which. Replacing
      // them with "Invalid webhook signature" left that information only in a
      // server log, while the Stripe Dashboard's "Response" tab — where anyone
      // debugging a webhook actually looks — showed nothing diagnostic.
      //
      // Safe to return: these messages describe the failure mode only. They
      // never contain the signing secret, the payload, or the expected digest.
      throw new BadRequestException(stripeError.message);
    }

    try {
      await this.paymentService.handleWebhookEvent(event);
      return { received: true };
    } catch (error) {
      this.logger.error(`Webhook processing error: ${(error as Error).message}`, (error as Error).stack);
      throw new BadRequestException('Webhook processing failed');
    }
  }
}
