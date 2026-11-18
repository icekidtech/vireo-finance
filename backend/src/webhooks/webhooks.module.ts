import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { VirtualAccount } from '../accounts/virtual-account.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { MerchantModule } from '../merchant/merchant.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PagaModule } from '../paga/paga.module';
import { TransfersModule } from '../transfers/transfers.module';
import { WEBHOOK_QUEUE } from '../queues/queues.constants';
import { PagaEvent } from './paga-event.entity';
import { WebhookProcessor } from './webhook.processor';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PagaEvent, VirtualAccount]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    LedgerModule,
    AccountsModule,
    PagaModule,
    NotificationsModule,
    TransfersModule,
    MerchantModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookProcessor],
  exports: [WebhooksService],
})
export class WebhooksModule {}
