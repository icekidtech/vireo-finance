import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycRecord } from './kyc-record.entity';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KycRecord, User])],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
