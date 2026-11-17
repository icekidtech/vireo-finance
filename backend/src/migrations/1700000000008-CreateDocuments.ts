import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocuments1700000000008 implements MigrationInterface {
  name = 'CreateDocuments1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id" uuid NOT NULL,
        "ownerUserId" uuid NOT NULL,
        "kind" character varying(30) NOT NULL,
        "mime" character varying(40) NOT NULL,
        "size" integer NOT NULL,
        "sha256" character varying(64) NOT NULL,
        "objectKey" character varying(120) NOT NULL,
        "storageFileId" character varying(120) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_documents" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_documents_ownerUserId" ON "documents" ("ownerUserId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "documents"`);
  }
}
