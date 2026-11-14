import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PagaModule } from '../paga/paga.module';
import { TransfersModule } from '../transfers/transfers.module';
import { Transfer } from '../transfers/transfer.entity';
import { PagaEvent } from '../webhooks/paga-event.entity';
import { InternalController } from './internal.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transfer, PagaEvent]), PagaModule, TransfersModule],
  controllers: [InternalController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
