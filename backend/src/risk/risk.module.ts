import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { Hold } from '../ledger/hold.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { User } from '../users/user.entity';
import { BalanceCapService } from './balance-cap.service';
import { RiskService } from './risk.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Hold]), AccountsModule, LedgerModule],
  providers: [RiskService, BalanceCapService],
  exports: [RiskService, BalanceCapService],
})
export class RiskModule {}
