import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationProvider } from '../notification-provider.interface';
import type { AppConfig } from '../../config/configuration';

@Injectable()
export class PushNotificationProvider implements NotificationProvider {
  readonly name = 'push';
  private readonly logger = new Logger(PushNotificationProvider.name);
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const push = (config.get<AppConfig['notifications']>('notifications') ?? {}) as {
      push?: { enabled?: boolean };
    };
    this.enabled = push.push?.enabled ?? false;
  }

  async send(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`Push disabled, skipping notify user=${userId}`);
      return;
    }
    const deviceToken = data?.pushToken as string | undefined;
    if (!deviceToken) {
      this.logger.warn(`Push skipped for user=${userId}: no push token in data`);
      return;
    }

    try {
      await this.sendPush(deviceToken, title, body, data);
    } catch (error) {
      this.logger.error(`Push failed for user=${userId}: ${String(error)}`);
      throw error;
    }
  }

  private async sendPush(
    deviceToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    // Integrate with FCM/APNs here. Placeholder: log the outbound push.
    this.logger.log(
      `push to=${deviceToken} title="${title}" body="${body}" ${data ? `data=${JSON.stringify(data)}` : ''}`,
    );
  }
}
