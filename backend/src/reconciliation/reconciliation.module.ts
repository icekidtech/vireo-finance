import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PagaModule } from '../paga/paga.module';
import { TransfersModule } from '../transfers/transfers.module';
import { Transfer } from '../transfers/transfer.entity';
import { PagaEvent } from '../webhooks/paga-event.entity';
import { RECONCILIATION_QUEUE } from '../queues/queues.constants';
import { InternalController } from './internal.controller';
import { ReconciliationProcessor } from './reconciliation.processor';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transfer, PagaEvent]),
    BullModule.registerQueue({ name: RECONCILIATION_QUEUE }),
    PagaModule,
    TransfersModule,
  ],
  controllers: [InternalController],
  providers: [ReconciliationService, ReconciliationProcessor],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
