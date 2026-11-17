import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Early biometric enrollments stored "embeddings" that were only base64-encoded
 * mock vectors (not encrypted, not from any real matcher). They cannot be
 * trusted for verification, so revoke and clear them. Templates written by the
 * current code are AES-256-GCM and carry the "v1:" prefix.
 */
export class RevokeLegacyBiometricTemplates1700000000004 implements MigrationInterface {
  name = 'RevokeLegacyBiometricTemplates1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "biometric_enrollments"
      SET "status" = 'revoked', "revokedAt" = now(), "embeddingEncrypted" = ''
      WHERE "embeddingEncrypted" NOT LIKE 'v1:%'
    `);
  }

  public async down(): Promise<void> {
    // Irreversible by design: the cleared templates were not real biometric data.
  }
}
