import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BVN_VERIFIER, BvnVerifier } from './bvn-verifier';
import { DiditBvnVerifier } from './didit-bvn.verifier';
import { KycIdentity } from './kyc-identity.entity';
import { KycRecord } from './kyc-record.entity';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KycRecord, KycIdentity, User])],
  controllers: [KycController],
  providers: [
    KycService,
    {
      provide: BVN_VERIFIER,
      inject: [ConfigService],
      // KYC_PROVIDER unset disables automatic BVN checks (the endpoint answers
      // 503); an unknown name stops the app at startup instead of faking a result.
      useFactory: (config: ConfigService): BvnVerifier | null => {
        const name = config.get<string>('kyc.provider');
        if (!name) return null;
        if (name === 'didit') {
          return new DiditBvnVerifier(
            config.getOrThrow<{ apiKey: string; baseUrl: string; timeoutMs: number }>(
              'biometrics.didit',
            ),
          );
        }
        throw new Error(`KYC_PROVIDER "${name}" has no adapter in this build`);
      },
    },
  ],
  exports: [KycService],
})
export class KycModule {}
