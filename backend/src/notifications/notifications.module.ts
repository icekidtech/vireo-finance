import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { InAppNotificationProvider } from './providers/in-app.provider';
import { LoggerNotificationProvider } from './providers/logger.provider';
import { SmsNotificationProvider } from './providers/sms.provider';
import { PushNotificationProvider } from './providers/push.provider';
import { EmailNotificationProvider } from './providers/email.provider';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    LoggerNotificationProvider,
    SmsNotificationProvider,
    PushNotificationProvider,
    InAppNotificationProvider,
    EmailNotificationProvider,
  ],
  exports: [NotificationsService, EmailNotificationProvider],
})
export class NotificationsModule {}
