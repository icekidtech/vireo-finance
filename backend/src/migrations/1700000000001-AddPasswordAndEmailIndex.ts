import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordAndEmailIndex1700000000001 implements MigrationInterface {
  name = 'AddPasswordAndEmailIndex1700000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns that were not in the initial schema
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dateOfBirth" varchar(32)`,
    );

    // Unique partial index on email (where not null)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email") WHERE "email" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "dateOfBirth"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordHash"`);
  }
}
