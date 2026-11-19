import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateEmailOtps1700000000015 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'email_otps',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'code_hash',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'attempts',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'consumed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'email_otps',
      new TableIndex({
        name: 'idx_email_otps_email',
        columnNames: ['email'],
      }),
    );

    await queryRunner.createIndex(
      'email_otps',
      new TableIndex({
        name: 'idx_email_otps_email_consumed',
        columnNames: ['email', 'consumed_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('email_otps');
  }
}
