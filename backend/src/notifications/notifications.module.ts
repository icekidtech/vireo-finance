import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { LoggerNotificationProvider } from './providers/logger.provider';
import { SmsNotificationProvider } from './providers/sms.provider';
import { PushNotificationProvider } from './providers/push.provider';

@Module({
  providers: [
    NotificationsService,
    LoggerNotificationProvider,
    SmsNotificationProvider,
    PushNotificationProvider,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
