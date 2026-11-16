import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantModule } from '../merchant/merchant.module';
import { Settlement } from '../merchant/settlement.entity';
import { PagaModule } from '../paga/paga.module';
import { TransfersModule } from '../transfers/transfers.module';
import { Transfer } from '../transfers/transfer.entity';
import { PagaEvent } from '../webhooks/paga-event.entity';
import { InternalController } from './internal.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transfer, PagaEvent, Settlement]),
    PagaModule,
    TransfersModule,
    MerchantModule,
  ],
  controllers: [InternalController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
