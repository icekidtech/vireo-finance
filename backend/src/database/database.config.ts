import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/configuration';
import { resolveDbSsl } from './ssl';

export function buildDataSourceOptions(config: ConfigService): DataSourceOptions {
  const app = config.get<AppConfig['database']>('database')!;

  return {
    type: 'postgres',
    host: app.host,
    port: app.port,
    username: app.username,
    password: app.password,
    database: app.name,
    // process.env is already populated by ConfigModule (dotenv) at this point.
    ssl: app.ssl ? resolveDbSsl(process.env) : false,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsTableName: 'schema_migrations',
    // Some migrations (enum ADD VALUE) must run outside a transaction.
    migrationsTransactionMode: 'each',
    synchronize: false,
    logging: ['error', 'warn', 'migration'],
  };
}
