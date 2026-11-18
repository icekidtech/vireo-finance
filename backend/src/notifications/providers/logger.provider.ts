import { Injectable, Logger } from '@nestjs/common';
import { NotificationProvider } from '../notification-provider.interface';

@Injectable()
export class LoggerNotificationProvider implements NotificationProvider {
  readonly name = 'logger';
  private readonly logger = new Logger(LoggerNotificationProvider.name);

  async send(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(
      `notify user=${userId} channel=logger title="${title}" body="${body}" ${data ? `data=${JSON.stringify(data)}` : ''}`,
    );
  }
}
