import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../auth/device.entity';
import { Challenge } from './challenge.entity';
import { ChallengesService } from './challenges.service';

@Module({
  imports: [TypeOrmModule.forFeature([Challenge, Device])],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}
