import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationProvider } from '../notification-provider.interface';
import type { AppConfig } from '../../config/configuration';

@Injectable()
export class SmsNotificationProvider implements NotificationProvider {
  readonly name = 'sms';
  private readonly logger = new Logger(SmsNotificationProvider.name);
  private readonly enabled: boolean;
  private readonly gatewayUrl: string | null;
  private readonly apiKey: string | null;
  private readonly senderId: string | null;

  constructor(private readonly config: ConfigService) {
    const sms = (config.get<AppConfig['notifications']>('notifications') ?? {}) as {
      sms?: { enabled?: boolean; gatewayUrl?: string; apiKey?: string; senderId?: string };
    };
    this.enabled = sms.sms?.enabled ?? false;
    this.gatewayUrl = sms.sms?.gatewayUrl ?? null;
    this.apiKey = sms.sms?.apiKey ?? null;
    this.senderId = sms.sms?.senderId ?? null;
  }

  async send(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`SMS disabled, skipping notify user=${userId}`);
      return;
    }
    const phone = data?.phone as string | undefined;
    if (!phone) {
      this.logger.warn(`SMS skipped for user=${userId}: no phone number in data`);
      return;
    }

    try {
      await this.sendSms(phone, `${title}\n${body}`);
    } catch (error) {
      this.logger.error(`SMS failed for user=${userId}: ${String(error)}`);
      throw error;
    }
  }

  private async sendSms(phone: string, message: string): Promise<void> {
    if (!this.gatewayUrl || !this.apiKey) {
      throw new Error('SMS gateway not configured');
    }
    // Integrate with a real SMS gateway here (e.g. Africa's Talking, Twilio).
    // Placeholder: log the outbound message.
    this.logger.log(`sms to=${phone} from=${this.senderId ?? 'Vireo'} body="${message}"`);
  }
}
