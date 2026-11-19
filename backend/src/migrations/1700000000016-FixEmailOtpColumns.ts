import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CreateEmailOtps1700000000015 created email_otps with snake_case columns (code_hash, expires_at,
 * consumed_at, created_at), timestamps without a time zone and a 255-character hash. The EmailOtp
 * entity, like every other table here, uses camelCase columns with time zones, so every query
 * failed with `column "codeHash" does not exist`.
 *
 * This brings the table to the entity's shape. It is safe to run more than once: each step only
 * acts on a column that still has the old name or type. Migration 15 is left as it was because it
 * has already run in deployed databases.
 */
export class FixEmailOtpColumns1700000000016 implements MigrationInterface {
  name = 'FixEmailOtpColumns1700000000016';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = current_schema() AND table_name = 'email_otps' AND column_name = 'code_hash') THEN
          ALTER TABLE "email_otps" RENAME COLUMN "code_hash" TO "codeHash";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = current_schema() AND table_name = 'email_otps' AND column_name = 'expires_at') THEN
          ALTER TABLE "email_otps" RENAME COLUMN "expires_at" TO "expiresAt";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = current_schema() AND table_name = 'email_otps' AND column_name = 'consumed_at') THEN
          ALTER TABLE "email_otps" RENAME COLUMN "consumed_at" TO "consumedAt";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = current_schema() AND table_name = 'email_otps' AND column_name = 'created_at') THEN
          ALTER TABLE "email_otps" RENAME COLUMN "created_at" TO "createdAt";
        END IF;
      END $$;
    `);

    // Types: time zones on the timestamps (existing values were written in UTC), a 128-character
    // hash and a small integer for the attempt counter, as the entity declares them.
    await queryRunner.query(`
      ALTER TABLE "email_otps"
        ALTER COLUMN "codeHash" TYPE character varying(128),
        ALTER COLUMN "attempts" TYPE smallint,
        ALTER COLUMN "expiresAt" TYPE timestamptz USING "expiresAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "consumedAt" TYPE timestamptz USING "consumedAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "createdAt" SET DEFAULT now()
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_otps"
        ALTER COLUMN "createdAt" TYPE timestamp USING "createdAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "consumedAt" TYPE timestamp USING "consumedAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "expiresAt" TYPE timestamp USING "expiresAt" AT TIME ZONE 'UTC',
        ALTER COLUMN "attempts" TYPE integer,
        ALTER COLUMN "codeHash" TYPE character varying(255)
    `);
    await queryRunner.query(`ALTER TABLE "email_otps" RENAME COLUMN "codeHash" TO "code_hash"`);
    await queryRunner.query(`ALTER TABLE "email_otps" RENAME COLUMN "expiresAt" TO "expires_at"`);
    await queryRunner.query(`ALTER TABLE "email_otps" RENAME COLUMN "consumedAt" TO "consumed_at"`);
    await queryRunner.query(`ALTER TABLE "email_otps" RENAME COLUMN "createdAt" TO "created_at"`);
  }
}
