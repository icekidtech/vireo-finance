import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { BiometricsModule } from '../biometrics/biometrics.module';
import { Challenge } from '../challenges/challenge.entity';
import { ChallengesModule } from '../challenges/challenges.module';
import { Hold } from '../ledger/hold.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { PagaModule } from '../paga/paga.module';
import { TransfersModule } from '../transfers/transfers.module';
import { MerchantOrderController } from './merchant-order.controller';
import { MerchantController } from './merchant.controller';
import { MerchantOrder } from './merchant-order.entity';
import { Merchant } from './merchant.entity';
import { MerchantService } from './merchant.service';
import { TerminalPaymentService } from './terminal-payment.service';
import { Settlement } from './settlement.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Merchant, MerchantOrder, Settlement, Hold, Challenge, User]),
    AccountsModule,
    LedgerModule,
    ChallengesModule,
    PagaModule,
    TransfersModule,
    BiometricsModule,
  ],
  controllers: [MerchantController, MerchantOrderController],
  providers: [MerchantService, TerminalPaymentService],
  exports: [MerchantService],
})
export class MerchantModule {}
