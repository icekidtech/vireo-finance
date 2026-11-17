import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiometricsController } from './biometrics.controller';
import { BiometricsService } from './biometrics.service';
import { BiometricEnrollment } from './biometric-enrollment.entity';
import { BiometricConsent } from './biometric-consent.entity';
import { BiometricAttempt } from './biometric-attempt.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BiometricEnrollment, BiometricConsent, BiometricAttempt, User]),
  ],
  controllers: [BiometricsController],
  providers: [BiometricsService],
  exports: [BiometricsService],
})
export class BiometricsModule {}
