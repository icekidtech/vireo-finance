import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerService } from './ledger.service';
import { LedgerTransaction } from './ledger-transaction.entity';
import { LedgerEntry } from './ledger-entry.entity';
import { Hold } from './hold.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerTransaction, LedgerEntry, Hold])],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
