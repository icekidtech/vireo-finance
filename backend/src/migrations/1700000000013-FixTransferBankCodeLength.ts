import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTransferBankCodeLength1700000000013 implements MigrationInterface {
  name = 'FixTransferBankCodeLength1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // recipientBankCode now holds a bank id (UUID, 36 chars) as well as short sort codes.
    await queryRunner.query(
      `ALTER TABLE "transfers" ALTER COLUMN "recipientBankCode" TYPE character varying(40)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transfers" ALTER COLUMN "recipientBankCode" TYPE character varying(16)`,
    );
  }
}
