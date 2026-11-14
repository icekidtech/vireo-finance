import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ReconciliationProcessor } from './reconciliation.processor';
import type { AppConfig } from '../config/configuration';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.get<AppConfig['redis']>('redis')!;
        return {
          connection: {
            host: redis.host,
            port: redis.port,
          },
        };
      },
    }),
    BullModule.registerQueue({
      name: 'reconciliation',
    }),
  ],
  providers: [ReconciliationProcessor],
  exports: [],
})
export class QueueModule {}
