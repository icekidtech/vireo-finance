import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSettlementBankCodeLength1700000000012 implements MigrationInterface {
  name = 'FixSettlementBankCodeLength1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // settlementBankCode stores a UUID (36 chars) but was mistakenly set to VARCHAR(16)
    await queryRunner.query(`
      ALTER TABLE "merchants" 
      ALTER COLUMN "settlementBankCode" TYPE character varying(40)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "merchants" 
      ALTER COLUMN "settlementBankCode" TYPE character varying(16)
    `);
  }
}
