import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { Challenge } from '../challenges/challenge.entity';
import { ChallengesModule } from '../challenges/challenges.module';
import { Hold } from '../ledger/hold.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { Merchant } from '../merchant/merchant.entity';
import { MerchantOrder } from '../merchant/merchant-order.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PagaModule } from '../paga/paga.module';
import { RiskModule } from '../risk/risk.module';
import { User } from '../users/user.entity';
import { Transfer } from './transfer.entity';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transfer, User, Merchant, MerchantOrder, Hold, Challenge]),
    AccountsModule,
    LedgerModule,
    ChallengesModule,
    RiskModule,
    PagaModule,
    NotificationsModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
