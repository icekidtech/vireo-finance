import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Settlement signing: settlements gain a DRAFT state (created with a hold and a
 * device challenge, before any Paga call) and a challengeId binding the draft to
 * the signed approval that authorizes the payout.
 *
 * Runs outside a transaction because ALTER TYPE ... ADD VALUE cannot be rolled
 * back and, on older Postgres, cannot run inside a transaction block at all.
 */
export class SettlementSigning1700000000001 implements MigrationInterface {
  name = 'SettlementSigning1700000000001';
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "settlements_status_enum" ADD VALUE IF NOT EXISTS 'draft';
    `);
    await queryRunner.query(`
      ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "challengeId" uuid;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot drop a value from an enum; the unused 'draft' value is
    // harmless, so the rollback only removes the column.
    await queryRunner.query(`
      ALTER TABLE "settlements" DROP COLUMN IF EXISTS "challengeId";
    `);
  }
}