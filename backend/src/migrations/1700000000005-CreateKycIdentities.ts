import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKycIdentities1700000000005 implements MigrationInterface {
  name = 'CreateKycIdentities1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "kyc_identities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "bvnHash" character varying(64) NOT NULL,
        "bvnEncrypted" text NOT NULL,
        "bvnLast4" character varying(4) NOT NULL,
        "firstName" character varying(60) NOT NULL,
        "lastName" character varying(60) NOT NULL,
        "dateOfBirth" date NOT NULL,
        "verifiedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_identities" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_kyc_identities_userId" ON "kyc_identities" ("userId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_kyc_identities_bvnHash" ON "kyc_identities" ("bvnHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "kyc_identities"`);
  }
}
