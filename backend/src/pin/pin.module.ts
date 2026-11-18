import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PinController } from './pin.controller';
import { PinService } from './pin.service';
import { UserPin } from './user-pin.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserPin]), AuthModule],
  controllers: [PinController],
  providers: [PinService],
  exports: [PinService],
})
export class PinModule {}
