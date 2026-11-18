import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerModule } from '../ledger/ledger.module';
import { PagaModule } from '../paga/paga.module';
import { User } from '../users/user.entity';
import { Account } from './account.entity';
import { VirtualAccount } from './virtual-account.entity';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { UserDepositService } from './user-deposit.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account, VirtualAccount, User]), LedgerModule, PagaModule],
  controllers: [AccountsController],
  providers: [AccountsService, UserDepositService],
  exports: [AccountsService, UserDepositService, TypeOrmModule],
})
export class AccountsModule {}
