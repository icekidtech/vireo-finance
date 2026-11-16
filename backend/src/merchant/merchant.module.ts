import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { Challenge } from '../challenges/challenge.entity';
import { ChallengesModule } from '../challenges/challenges.module';
import { Hold } from '../ledger/hold.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { PagaModule } from '../paga/paga.module';
import { MerchantOrderController } from './merchant-order.controller';
import { MerchantController } from './merchant.controller';
import { MerchantOrder } from './merchant-order.entity';
import { Merchant } from './merchant.entity';
import { MerchantService } from './merchant.service';
import { Settlement } from './settlement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Merchant, MerchantOrder, Settlement, Hold, Challenge]),
    AccountsModule,
    LedgerModule,
    ChallengesModule,
    PagaModule,
  ],
  controllers: [MerchantController, MerchantOrderController],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
