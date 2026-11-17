-- Phase 3: Biometric Tables Migration
-- Run this if `npm run migration:run` fails

-- Create biometric_consents table
CREATE TABLE IF NOT EXISTS "biometric_consents" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "userId" uuid NOT NULL,
  "status" character varying NOT NULL DEFAULT 'granted',
  "purpose" character varying NOT NULL DEFAULT 'both',
  "consentText" text NOT NULL,
  "consentVersion" character varying(50) NOT NULL,
  "metadata" jsonb,
  "revokedAt" timestamp with time zone,
  "revokedReason" character varying(500),
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "PK_biometric_consents" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_biometric_consents_userId_status" 
ON "biometric_consents" ("userId", "status");

CREATE INDEX IF NOT EXISTS "IDX_biometric_consents_userId" 
ON "biometric_consents" ("userId");

-- Create biometric_enrollments table
CREATE TABLE IF NOT EXISTS "biometric_enrollments" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "userId" uuid NOT NULL,
  "type" character varying NOT NULL,
  "status" character varying NOT NULL DEFAULT 'active',
  "embeddingEncrypted" text NOT NULL,
  "metadata" jsonb,
  "consentId" uuid NOT NULL,
  "modelVersion" character varying(50) NOT NULL DEFAULT 'v1',
  "qualityScore" integer,
  "revokedAt" timestamp with time zone,
  "expiresAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "PK_biometric_enrollments" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_biometric_enrollments_userId_type_status" 
ON "biometric_enrollments" ("userId", "type", "status");

CREATE INDEX IF NOT EXISTS "IDX_biometric_enrollments_userId_status" 
ON "biometric_enrollments" ("userId", "status");

CREATE INDEX IF NOT EXISTS "IDX_biometric_enrollments_userId" 
ON "biometric_enrollments" ("userId");

-- Create biometric_attempts table
CREATE TABLE IF NOT EXISTS "biometric_attempts" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "userId" uuid,
  "type" character varying NOT NULL,
  "result" character varying NOT NULL,
  "context" character varying NOT NULL,
  "matchScore" integer,
  "livenessScore" integer,
  "spoofScore" integer,
  "qualityScore" integer,
  "matchedEnrollmentId" uuid,
  "transferId" uuid,
  "merchantId" uuid,
  "metadata" jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "PK_biometric_attempts" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_biometric_attempts_userId_createdAt" 
ON "biometric_attempts" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "IDX_biometric_attempts_result_createdAt" 
ON "biometric_attempts" ("result", "createdAt");

CREATE INDEX IF NOT EXISTS "IDX_biometric_attempts_context_createdAt" 
ON "biometric_attempts" ("context", "createdAt");

-- Add foreign keys
ALTER TABLE "biometric_consents" 
DROP CONSTRAINT IF EXISTS "FK_biometric_consents_userId";

ALTER TABLE "biometric_consents" 
ADD CONSTRAINT "FK_biometric_consents_userId" 
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "biometric_enrollments" 
DROP CONSTRAINT IF EXISTS "FK_biometric_enrollments_userId";

ALTER TABLE "biometric_enrollments" 
ADD CONSTRAINT "FK_biometric_enrollments_userId" 
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "biometric_attempts" 
DROP CONSTRAINT IF EXISTS "FK_biometric_attempts_userId";

ALTER TABLE "biometric_attempts" 
ADD CONSTRAINT "FK_biometric_attempts_userId" 
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL;

-- Add check constraints for enum values
ALTER TABLE "biometric_consents" 
DROP CONSTRAINT IF EXISTS "CHK_biometric_consents_status";

ALTER TABLE "biometric_consents" 
ADD CONSTRAINT "CHK_biometric_consents_status" 
CHECK ("status" IN ('granted', 'revoked'));

ALTER TABLE "biometric_consents" 
DROP CONSTRAINT IF EXISTS "CHK_biometric_consents_purpose";

ALTER TABLE "biometric_consents" 
ADD CONSTRAINT "CHK_biometric_consents_purpose" 
CHECK ("purpose" IN ('enrollment', 'verification', 'both'));

ALTER TABLE "biometric_enrollments" 
DROP CONSTRAINT IF EXISTS "CHK_biometric_enrollments_type";

ALTER TABLE "biometric_enrollments" 
ADD CONSTRAINT "CHK_biometric_enrollments_type" 
CHECK ("type" IN ('face', 'voice'));

ALTER TABLE "biometric_enrollments" 
DROP CONSTRAINT IF EXISTS "CHK_biometric_enrollments_status";

ALTER TABLE "biometric_enrollments" 
ADD CONSTRAINT "CHK_biometric_enrollments_status" 
CHECK ("status" IN ('active', 'revoked', 'expired'));

ALTER TABLE "biometric_attempts" 
DROP CONSTRAINT IF EXISTS "CHK_biometric_attempts_type";

ALTER TABLE "biometric_attempts" 
ADD CONSTRAINT "CHK_biometric_attempts_type" 
CHECK ("type" IN ('face', 'voice'));

ALTER TABLE "biometric_attempts" 
DROP CONSTRAINT IF EXISTS "CHK_biometric_attempts_result";

ALTER TABLE "biometric_attempts" 
ADD CONSTRAINT "CHK_biometric_attempts_result" 
CHECK ("result" IN ('approved', 'denied', 'step_up', 'error'));

ALTER TABLE "biometric_attempts" 
DROP CONSTRAINT IF EXISTS "CHK_biometric_attempts_context";

ALTER TABLE "biometric_attempts" 
ADD CONSTRAINT "CHK_biometric_attempts_context" 
CHECK ("context" IN ('enrollment', 'payment', 'verification'));

-- Insert migration record
INSERT INTO schema_migrations (timestamp, name) 
VALUES (1700000000003, 'AddBiometricTables1700000000003')
ON CONFLICT DO NOTHING;

-- Success message
SELECT 'Migration completed successfully! Created 3 new tables: biometric_consents, biometric_enrollments, biometric_attempts' AS message;
