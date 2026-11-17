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
import { PinModule } from '../pin/pin.module';
import { DocumentsModule } from '../documents/documents.module';
import { KycModule } from '../kyc/kyc.module';
import { MerchantVerificationService } from './merchant-verification.service';
import { KycIdentity } from '../kyc/kyc-identity.entity';
import { MerchantDepositService } from './merchant-deposit.service';
import { MerchantController } from './merchant.controller';
import { MerchantOrder } from './merchant-order.entity';
import { Merchant } from './merchant.entity';
import { MerchantService } from './merchant.service';
import { TerminalPaymentService } from './terminal-payment.service';
import { Settlement } from './settlement.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Merchant,
      MerchantOrder,
      Settlement,
      Hold,
      Challenge,
      User,
      KycIdentity,
    ]),
    AccountsModule,
    LedgerModule,
    ChallengesModule,
    PagaModule,
    TransfersModule,
    BiometricsModule,
    DocumentsModule,
    KycModule,
    PinModule,
  ],
  controllers: [MerchantController, MerchantOrderController],
  providers: [
    MerchantService,
    TerminalPaymentService,
    MerchantDepositService,
    MerchantVerificationService,
  ],
  exports: [MerchantService],
})
export class MerchantModule {}
