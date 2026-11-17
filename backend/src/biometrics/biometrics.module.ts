import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiometricsController } from './biometrics.controller';
import { BiometricsService } from './biometrics.service';
import { BiometricEnrollment } from './biometric-enrollment.entity';
import { BiometricConsent } from './biometric-consent.entity';
import { BiometricAttempt } from './biometric-attempt.entity';
import { User } from '../users/user.entity';
import { BIOMETRIC_PROVIDER, BiometricProvider } from './biometric-provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([BiometricEnrollment, BiometricConsent, BiometricAttempt, User]),
  ],
  controllers: [BiometricsController],
  providers: [
    BiometricsService,
    {
      provide: BIOMETRIC_PROVIDER,
      inject: [ConfigService],
      // No vendor adapter ships in this build. Leaving BIOMETRIC_PROVIDER unset
      // disables biometrics (every operation fails closed); naming one without
      // an adapter stops the app at startup instead of silently faking results.
      useFactory: (config: ConfigService): BiometricProvider | null => {
        const name = config.get<string>('biometrics.provider');
        if (!name) {
          return null;
        }
        throw new Error(`BIOMETRIC_PROVIDER "${name}" has no adapter in this build`);
      },
    },
  ],
  exports: [BiometricsService],
})
export class BiometricsModule {}
