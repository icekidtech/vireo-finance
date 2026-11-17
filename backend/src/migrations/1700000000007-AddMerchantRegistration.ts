import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMerchantRegistration1700000000007 implements MigrationInterface {
  name = 'AddMerchantRegistration1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "merchants" ADD "cacNumber" character varying(20)`);
    await queryRunner.query(`ALTER TABLE "merchants" ADD "tin" character varying(20)`);
    await queryRunner.query(
      `ALTER TABLE "merchants" ADD "registrationStatus" character varying(20) NOT NULL DEFAULT 'none'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "merchants" DROP COLUMN "registrationStatus"`);
    await queryRunner.query(`ALTER TABLE "merchants" DROP COLUMN "tin"`);
    await queryRunner.query(`ALTER TABLE "merchants" DROP COLUMN "cacNumber"`);
  }
}
