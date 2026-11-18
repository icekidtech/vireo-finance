import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { resolveDbSsl } from './ssl';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'vireo',
  ssl: resolveDbSsl(process.env),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  migrationsTableName: 'schema_migrations',
  // Some migrations (enum ADD VALUE) must run outside a transaction.
  migrationsTransactionMode: 'each',
  synchronize: false,
  logging: ['error', 'warn', 'migration'],
});
