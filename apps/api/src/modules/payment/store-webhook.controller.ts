import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StoreWebhookService } from './store-webhook.service';
import { AppleNotificationDto } from './dto/apple-notification.dto';

/**
 * Apple App Store Server Notifications V2 and Google Play RTDN.
 * Unsigned / unauthenticated callers cannot change Stripe state.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class StoreWebhookController {
  constructor(private readonly storeWebhooks: StoreWebhookService) {}

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  async apple(@Body() body: AppleNotificationDto) {
    return this.storeWebhooks.handleAppleNotification(body.signedPayload);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async google(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.storeWebhooks.handleGoogleRtdn(authorization, body);
  }
}
