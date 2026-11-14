import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PagaModule } from '../paga/paga.module';
import { User } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppleAttestService } from './attestation/apple-attest.service';
import { GooglePlayIntegrityService } from './attestation/google-play-integrity.service';
import { Device } from './device.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Device]),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: (config.get<string>('jwt.expiresIn') ?? '7d') as unknown as number,
        },
      }),
    }),
    AccountsModule,
    PagaModule,
    NotificationsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AppleAttestService, GooglePlayIntegrityService],
  exports: [AuthService],
})
export class AuthModule {}
