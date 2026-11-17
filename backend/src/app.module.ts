import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { AccountsModule } from './accounts/accounts.module';
import { AgentModule } from './agent/agent.module';
import { AuthModule } from './auth/auth.module';
import { BiometricsModule } from './biometrics/biometrics.module';
import { ChallengesModule } from './challenges/challenges.module';
import { HealthModule } from './health/health.module';
import { KycModule } from './kyc/kyc.module';
import { LedgerModule } from './ledger/ledger.module';
import { MerchantModule } from './merchant/merchant.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { QueueModule } from './queue/queue.module';
import { RiskModule } from './risk/risk.module';
import { TransfersModule } from './transfers/transfers.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    KycModule,
    AuthModule,
    AccountsModule,
    LedgerModule,
    ChallengesModule,
    RiskModule,
    TransfersModule,
    MerchantModule,
    AgentModule,
    BiometricsModule,
    WebhooksModule,
    ReconciliationModule,
    QueueModule,
    NotificationsModule,
  ],
})
export class AppModule {}
