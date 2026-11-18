import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email + password accounts can be created without a phone number (stored as ''). The
 * unique index on phone must only apply to real numbers, or a second such user would fail.
 */
export class AllowEmailOnlyUsers1700000000014 implements MigrationInterface {
  name = 'AllowEmailOnlyUsers1700000000014';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_phone"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_phone" ON "users" ("phone") WHERE "phone" <> ''`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_phone"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_phone" ON "users" ("phone")`);
  }
}
