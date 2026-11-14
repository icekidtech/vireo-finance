import { Injectable, Logger } from '@nestjs/common';
import { formatMinor } from '../database/money';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async creditReceived(userId: string, amountMinor: bigint): Promise<void> {
    await this.send(userId, 'Credit received', `You received NGN ${formatMinor(amountMinor)}.`);
  }

  async send(userId: string, title: string, body: string): Promise<void> {
    this.logger.log(`notify user=${userId} title="${title}" body="${body}"`);
  }
}
