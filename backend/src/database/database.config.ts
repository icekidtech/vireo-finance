import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/configuration';

export function buildDataSourceOptions(config: ConfigService): DataSourceOptions {
  const app = config.get<AppConfig['database']>('database')!;

  return {
    type: 'postgres',
    host: app.host,
    port: app.port,
    username: app.username,
    password: app.password,
    database: app.name,
    ssl: app.ssl ? { rejectUnauthorized: false } : false,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsTableName: 'schema_migrations',
    synchronize: false,
    logging: ['error', 'warn', 'migration'],
  };
}
