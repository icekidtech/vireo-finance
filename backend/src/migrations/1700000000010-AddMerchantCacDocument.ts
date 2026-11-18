import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMerchantCacDocument1700000000010 implements MigrationInterface {
  name = 'AddMerchantCacDocument1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "merchants" ADD "cacDocumentId" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "merchants" DROP COLUMN "cacDocumentId"`);
  }
}
