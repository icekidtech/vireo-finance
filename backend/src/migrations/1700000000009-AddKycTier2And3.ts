import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKycTier2And31700000000009 implements MigrationInterface {
  name = 'AddKycTier2And31700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kyc_identities" ADD "ninHash" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "kyc_identities" ADD "ninEncrypted" text`);
    await queryRunner.query(`ALTER TABLE "kyc_identities" ADD "ninLast4" character varying(4)`);
    await queryRunner.query(`ALTER TABLE "kyc_identities" ADD "addressEncrypted" text`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_kyc_identities_ninHash" ON "kyc_identities" ("ninHash") WHERE "ninHash" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_kyc_identities_ninHash"`);
    await queryRunner.query(`ALTER TABLE "kyc_identities" DROP COLUMN "addressEncrypted"`);
    await queryRunner.query(`ALTER TABLE "kyc_identities" DROP COLUMN "ninLast4"`);
    await queryRunner.query(`ALTER TABLE "kyc_identities" DROP COLUMN "ninEncrypted"`);
    await queryRunner.query(`ALTER TABLE "kyc_identities" DROP COLUMN "ninHash"`);
  }
}
