import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ServerErrorFilter } from './common/filters/server-error.filter';
import { httpLogger } from './common/logging/http-logger.middleware';

/** States plainly whether identity/face checks run against Didit's sandbox or a live key. */
function logVerificationMode(config: ConfigService) {
  const log = new Logger('Verification');
  const usesDidit =
    config.get<string>('biometrics.provider') === 'didit' ||
    config.get<string>('kyc.provider') === 'didit';
  if (!usesDidit) {
    log.log('Didit verification: not enabled (BIOMETRIC_PROVIDER / KYC_PROVIDER are not didit)');
    return;
  }
  const mode = config.get<string>('biometrics.didit.keyType');
  if (mode === 'sandbox') {
    log.warn(
      'Didit mode: SANDBOX. Face, BVN, NIN and document checks are approved without real verification. Switch DIDIT_API_KEY and DIDIT_KEY_TYPE=live for real checks.',
    );
  } else {
    log.log('Didit mode: LIVE. Identity and face checks are real.');
  }
}

/** Warns about every switch that writes personal data or secrets into the logs. */
function logSensitiveLogging() {
  const on = (v?: string) => v === 'true' || v === '1';
  const log = new Logger('Logging');
  if (on(process.env.OTP_LOG_CODE)) {
    log.warn('OTP_LOG_CODE is ON: one-time login codes are written to the server logs.');
  }
  if (on(process.env.LOG_HTTP_BODIES)) {
    log.warn(
      'LOG_HTTP_BODIES is ON: request/response bodies are logged (sensitive fields are redacted).',
    );
  }
  if (on(process.env.LOG_LLM_PAYLOADS)) {
    log.warn('LOG_LLM_PAYLOADS is ON: assistant prompts and replies are written to the logs.');
  }
}

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
  app.useGlobalFilters(new ServerErrorFilter(app.get(HttpAdapterHost).httpAdapter));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');
  logVerificationMode(config);
  logSensitiveLogging();
  Logger.log(`Vireo API listening on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
