import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin role for staff-only operations (KYC review, merchant KYB review).
 * Bootstrap: phones listed in ADMIN_PHONES are granted the role at registration.
 */
export class AdminRoles1700000000002 implements MigrationInterface {
  name = 'AdminRoles1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(20) NOT NULL DEFAULT 'user';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
    `);
  }
}
