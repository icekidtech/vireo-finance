import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsModule } from '../documents/documents.module';
import { RiskModule } from '../risk/risk.module';
import { User } from '../users/user.entity';
import { DiditIdentityVerifier } from './didit-identity.verifier';
import { IDENTITY_VERIFIER, IdentityVerifier } from './identity-verifier';
import { KycIdentity } from './kyc-identity.entity';
import { KycRecord } from './kyc-record.entity';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
  imports: [TypeOrmModule.forFeature([KycRecord, KycIdentity, User]), DocumentsModule, RiskModule],
  controllers: [KycController],
  providers: [
    KycService,
    {
      provide: IDENTITY_VERIFIER,
      inject: [ConfigService],
      // KYC_PROVIDER unset disables automatic verification (the endpoints answer 503);
      // an unknown name stops the app at startup instead of faking a result.
      useFactory: (config: ConfigService): IdentityVerifier | null => {
        const name = config.get<string>('kyc.provider');
        if (!name) return null;
        if (name === 'didit') {
          return new DiditIdentityVerifier(
            config.getOrThrow<{ apiKey: string; baseUrl: string; timeoutMs: number }>(
              'biometrics.didit',
            ),
          );
        }
        throw new Error(`KYC_PROVIDER "${name}" has no adapter in this build`);
      },
    },
  ],
  exports: [KycService, IDENTITY_VERIFIER],
})
export class KycModule {}
