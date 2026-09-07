import { Injectable, Logger } from '@nestjs/common';
import { User } from '@flacroncv/shared-types';
import { UsersService } from './users.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

/**
 * Sends via Expo Push Service. Stage 1 plumbing: no product event calls this.
 * Tests are the only callers until a later stage wires support/billing.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly users: UsersService) {}

  async sendToUser(uid: string, message: PushMessage): Promise<void> {
    const user = await this.users.findById(uid);
    if (!user || !PushService.shouldSend(user)) return;

    const tokens = (user.pushTokens ?? []).filter((t) => typeof t === 'string' && t.length > 0);
    if (tokens.length === 0) return;

    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          tokens.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            sound: 'default',
            data: message.data ?? {},
          })),
        ),
      });
    } catch (err) {
      this.logger.warn(`Push send failed for user ${uid}: ${(err as Error).message}`);
    }
  }

  private static shouldSend(user: User): boolean {
    if (!user.isActive || user.deletedAt) return false;
    return user.preferences?.pushNotifications === true;
  }
}
