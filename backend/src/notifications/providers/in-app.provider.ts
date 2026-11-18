import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationProvider } from '../notification-provider.interface';
import { Notification } from '../notification.entity';

/** Stores the message so the apps can show it (SMS and push are separate channels). */
@Injectable()
export class InAppNotificationProvider implements NotificationProvider {
  readonly name = 'in_app';

  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
  ) {}

  async send(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.notifications.save(
      this.notifications.create({
        userId,
        title: title.slice(0, 120),
        body: body.slice(0, 500),
        data: data ?? null,
        readAt: null,
      }),
    );
  }
}
