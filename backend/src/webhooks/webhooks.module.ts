import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VirtualAccount } from '../accounts/virtual-account.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { MerchantModule } from '../merchant/merchant.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PagaModule } from '../paga/paga.module';
import { TransfersModule } from '../transfers/transfers.module';
import { PagaEvent } from './paga-event.entity';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PagaEvent, VirtualAccount]),
    LedgerModule,
    PagaModule,
    NotificationsModule,
    TransfersModule,
    MerchantModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
