import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { httpLogger } from './common/logging/http-logger.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
    rawBody: true,
  });
  const config = app.get(ConfigService);
  // First, so requests rejected by the body parser (e.g. 413) are logged too.
  app.use(httpLogger({ logBodies: config.get<boolean>('logging.httpBodies') }));
  // Base64 face/voice samples are far larger than Nest's 100kb default.
  app.useBodyParser('json', { limit: '8mb' });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(`Vireo API listening on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
