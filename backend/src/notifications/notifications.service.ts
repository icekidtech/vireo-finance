import { Injectable, Logger } from '@nestjs/common';
import { LoggerNotificationProvider } from './providers/logger.provider';
import { SmsNotificationProvider } from './providers/sms.provider';
import { PushNotificationProvider } from './providers/push.provider';
import { NotificationProvider, NotificationChannel } from './notification-provider.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly providers: NotificationProvider[];

  constructor(
    loggerProvider: LoggerNotificationProvider,
    smsProvider: SmsNotificationProvider,
    pushProvider: PushNotificationProvider,
  ) {
    this.providers = [loggerProvider];
    if (smsProvider.constructor.name === 'SmsNotificationProvider') {
      this.providers.push(smsProvider);
    }
    if (pushProvider.constructor.name === 'PushNotificationProvider') {
      this.providers.push(pushProvider);
    }
  }

  async send(
    userId: string,
    title: string,
    body: string,
    channels: NotificationChannel[] = [{ type: 'in_app', enabled: true }],
    data?: Record<string, unknown>,
  ): Promise<void> {
    const results = await Promise.allSettled(
      this.providers.map((provider) => {
        const channel = channels.find((c) => c.type === provider.name);
        if (channel && !channel.enabled) {
          return Promise.resolve();
        }
        return provider.send(userId, title, body, data);
      }),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Notification provider ${this.providers[index].name} failed for user=${userId}: ${String(result.reason)}`,
        );
      }
    });
  }

  async creditReceived(
    userId: string,
    amountMinor: bigint,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.send(
      userId,
      'Credit received',
      `You received NGN ${this.formatMinor(amountMinor)}.`,
      [
        { type: 'sms', enabled: true },
        { type: 'push', enabled: true },
        { type: 'in_app', enabled: true },
      ],
      data,
    );
  }

  private formatMinor(minor: bigint): string {
    const sign = minor < 0n ? '-' : '';
    const absolute = minor < 0n ? -minor : minor;
    const whole = absolute / 100n;
    const fraction = (absolute % 100n).toString().padStart(2, '0');
    return `${sign}${whole}.${fraction}`;
  }
}
