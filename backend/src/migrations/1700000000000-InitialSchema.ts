import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "users_status_enum" AS ENUM ('active', 'suspended', 'closed');
      CREATE TYPE "devices_platform_enum" AS ENUM ('ios', 'android');
      CREATE TYPE "devices_algorithm_enum" AS ENUM ('ed25519', 'es256');
      CREATE TYPE "devices_status_enum" AS ENUM ('active', 'revoked');
      CREATE TYPE "kyc_records_status_enum" AS ENUM ('pending', 'verified', 'rejected');
      CREATE TYPE "accounts_ownertype_enum" AS ENUM ('user', 'merchant', 'system');
      CREATE TYPE "accounts_accounttype_enum" AS ENUM ('wallet', 'merchant_balance', 'paga_pool', 'fee_income');
      CREATE TYPE "accounts_status_enum" AS ENUM ('active', 'frozen', 'closed');
      CREATE TYPE "ledger_transactions_type_enum" AS ENUM (
        'internal_transfer', 'bank_transfer', 'merchant_payment', 'inbound_credit',
        'settlement', 'fee', 'refund', 'reversal'
      );
      CREATE TYPE "ledger_entries_direction_enum" AS ENUM ('debit', 'credit');
      CREATE TYPE "holds_status_enum" AS ENUM ('active', 'released', 'captured');
      CREATE TYPE "challenges_type_enum" AS ENUM ('transfer', 'merchant_payment', 'settlement');
      CREATE TYPE "challenges_status_enum" AS ENUM ('pending', 'used', 'expired');
      CREATE TYPE "transfers_type_enum" AS ENUM ('internal', 'bank', 'merchant', 'paga_wallet');
      CREATE TYPE "transfers_status_enum" AS ENUM ('draft', 'pending', 'completed', 'failed', 'reversed');
      CREATE TYPE "merchant_orders_status_enum" AS ENUM ('open', 'paid', 'expired', 'cancelled');
      CREATE TYPE "settlements_status_enum" AS ENUM ('pending', 'processing', 'completed', 'failed');
      CREATE TYPE "paga_events_status_enum" AS ENUM ('received', 'processed', 'failed', 'ignored');
      CREATE TYPE "agent_tool_calls_status_enum" AS ENUM ('success', 'error');
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "phone" varchar(32) NOT NULL,
        "handle" varchar(32),
        "name" varchar(120) NOT NULL,
        "kycTier" smallint NOT NULL DEFAULT 0,
        "status" "users_status_enum" NOT NULL DEFAULT 'active',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "IDX_users_phone" ON "users" ("phone");
      CREATE UNIQUE INDEX "IDX_users_handle" ON "users" ("handle") WHERE "handle" IS NOT NULL;

      CREATE TABLE "phone_otps" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "phone" varchar(32) NOT NULL,
        "codeHash" varchar(128) NOT NULL,
        "attempts" smallint NOT NULL DEFAULT 0,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_phone_otps_phone" ON "phone_otps" ("phone");

      CREATE TABLE "devices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "publicKey" text NOT NULL,
        "platform" "devices_platform_enum" NOT NULL,
        "algorithm" "devices_algorithm_enum" NOT NULL DEFAULT 'ed25519',
        "attestationState" varchar(32) NOT NULL DEFAULT 'unknown',
        "status" "devices_status_enum" NOT NULL DEFAULT 'active',
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_devices_userId" ON "devices" ("userId");

      CREATE TABLE "kyc_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "tier" smallint NOT NULL,
        "provider" varchar(40) NOT NULL,
        "status" "kyc_records_status_enum" NOT NULL DEFAULT 'pending',
        "payload" jsonb,
        "verifiedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_kyc_records_userId" ON "kyc_records" ("userId");

      CREATE TABLE "accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ownerType" "accounts_ownertype_enum" NOT NULL,
        "ownerId" uuid,
        "accountType" "accounts_accounttype_enum" NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'NGN',
        "status" "accounts_status_enum" NOT NULL DEFAULT 'active',
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_accounts_owner" ON "accounts" ("ownerType", "ownerId");

      CREATE TABLE "virtual_accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "accountId" uuid NOT NULL REFERENCES "accounts"("id"),
        "accountNumber" varchar(20) NOT NULL,
        "bankName" varchar(80) NOT NULL,
        "providerReference" varchar(120) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_virtual_accounts_userId" ON "virtual_accounts" ("userId");
      CREATE UNIQUE INDEX "IDX_virtual_accounts_accountNumber" ON "virtual_accounts" ("accountNumber");

      CREATE TABLE "ledger_transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "idempotencyKey" varchar(120) NOT NULL,
        "type" "ledger_transactions_type_enum" NOT NULL,
        "reference" varchar(120) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'posted',
        "metadata" jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "IDX_ledger_transactions_idempotencyKey" ON "ledger_transactions" ("idempotencyKey");

      CREATE TABLE "ledger_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "transactionId" uuid NOT NULL REFERENCES "ledger_transactions"("id"),
        "accountId" uuid NOT NULL REFERENCES "accounts"("id"),
        "direction" "ledger_entries_direction_enum" NOT NULL,
        "amount" bigint NOT NULL,
        "currency" varchar(3) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_ledger_entries_amount_positive" CHECK ("amount" > 0)
      );
      CREATE INDEX "IDX_ledger_entries_transactionId" ON "ledger_entries" ("transactionId");
      CREATE INDEX "IDX_ledger_entries_account_created" ON "ledger_entries" ("accountId", "createdAt");

      CREATE TABLE "holds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "accountId" uuid NOT NULL REFERENCES "accounts"("id"),
        "amount" bigint NOT NULL,
        "reference" varchar(120) NOT NULL,
        "status" "holds_status_enum" NOT NULL DEFAULT 'active',
        "expiresAt" timestamptz,
        "settledAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_holds_amount_positive" CHECK ("amount" > 0)
      );
      CREATE INDEX "IDX_holds_account_status" ON "holds" ("accountId", "status");
      CREATE INDEX "IDX_holds_reference" ON "holds" ("reference");

      CREATE TABLE "challenges" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "deviceId" uuid NOT NULL,
        "type" "challenges_type_enum" NOT NULL,
        "nonce" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "payloadHash" varchar(64) NOT NULL,
        "status" "challenges_status_enum" NOT NULL DEFAULT 'pending',
        "expiresAt" timestamptz NOT NULL,
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "IDX_challenges_nonce" ON "challenges" ("nonce");
      CREATE INDEX "IDX_challenges_userId" ON "challenges" ("userId");

      CREATE TABLE "transfers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "idempotencyKey" varchar(120) NOT NULL,
        "type" "transfers_type_enum" NOT NULL,
        "status" "transfers_status_enum" NOT NULL DEFAULT 'draft',
        "sourceAccountId" uuid,
        "destinationAccountId" uuid,
        "challengeId" uuid,
        "initiatedByUserId" uuid,
        "recipientPhone" varchar(32),
        "recipientBankCode" varchar(16),
        "recipientAccountNumber" varchar(32),
        "recipientName" varchar(120),
        "amount" bigint NOT NULL,
        "fee" bigint NOT NULL DEFAULT 0,
        "currency" varchar(3) NOT NULL DEFAULT 'NGN',
        "pagaReference" varchar(120),
        "failureReason" varchar(255),
        "metadata" jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_transfers_amount_positive" CHECK ("amount" > 0)
      );
      CREATE UNIQUE INDEX "IDX_transfers_idempotencyKey" ON "transfers" ("idempotencyKey");
      CREATE INDEX "IDX_transfers_sourceAccountId" ON "transfers" ("sourceAccountId");
      CREATE INDEX "IDX_transfers_pagaReference" ON "transfers" ("pagaReference");

      CREATE TABLE "merchants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ownerUserId" uuid,
        "handle" varchar(60) NOT NULL,
        "businessName" varchar(160) NOT NULL,
        "kybStatus" varchar(40) NOT NULL DEFAULT 'pending',
        "settlementAccountId" uuid,
        "settlementBankCode" varchar(16),
        "settlementAccountNumber" varchar(32),
        "settlementAccountName" varchar(120),
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "IDX_merchants_handle" ON "merchants" ("handle");
      CREATE INDEX "IDX_merchants_ownerUserId" ON "merchants" ("ownerUserId");

      CREATE TABLE "merchant_orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "merchantId" uuid NOT NULL REFERENCES "merchants"("id"),
        "reference" varchar(60) NOT NULL,
        "amount" bigint NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'NGN',
        "status" "merchant_orders_status_enum" NOT NULL DEFAULT 'open',
        "paidByUserId" uuid,
        "transferId" uuid,
        "note" varchar(255),
        "expiresAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_merchant_orders_amount_positive" CHECK ("amount" > 0)
      );
      CREATE UNIQUE INDEX "IDX_merchant_orders_reference" ON "merchant_orders" ("reference");
      CREATE INDEX "IDX_merchant_orders_merchantId" ON "merchant_orders" ("merchantId");

      CREATE TABLE "settlements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "merchantId" uuid NOT NULL REFERENCES "merchants"("id"),
        "amount" bigint NOT NULL,
        "status" "settlements_status_enum" NOT NULL DEFAULT 'pending',
        "pagaReference" varchar(120),
        "failureReason" varchar(255),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_settlements_amount_positive" CHECK ("amount" > 0)
      );
      CREATE INDEX "IDX_settlements_merchantId" ON "settlements" ("merchantId");

      CREATE TABLE "paga_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "providerEventId" varchar(120) NOT NULL,
        "type" varchar(80) NOT NULL,
        "payload" jsonb NOT NULL,
        "signature" varchar(255),
        "status" "paga_events_status_enum" NOT NULL DEFAULT 'received',
        "error" varchar(255),
        "processedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "IDX_paga_events_providerEventId" ON "paga_events" ("providerEventId");

      CREATE TABLE "agent_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_agent_sessions_userId" ON "agent_sessions" ("userId");

      CREATE TABLE "agent_tool_calls" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "toolName" varchar(60) NOT NULL,
        "input" jsonb NOT NULL,
        "output" jsonb,
        "status" "agent_tool_calls_status_enum" NOT NULL,
        "error" varchar(255),
        "draftTransferId" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_agent_tool_calls_sessionId" ON "agent_tool_calls" ("sessionId");
      CREATE INDEX "IDX_agent_tool_calls_userId" ON "agent_tool_calls" ("userId");
    `);

    await queryRunner.query(`
      INSERT INTO "accounts" ("id", "ownerType", "ownerId", "accountType", "currency")
      VALUES
        ('00000000-0000-0000-0000-000000000001', 'system', NULL, 'paga_pool', 'NGN'),
        ('00000000-0000-0000-0000-000000000002', 'system', NULL, 'fee_income', 'NGN');
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "agent_tool_calls";
      DROP TABLE IF EXISTS "agent_sessions";
      DROP TABLE IF EXISTS "paga_events";
      DROP TABLE IF EXISTS "settlements";
      DROP TABLE IF EXISTS "merchant_orders";
      DROP TABLE IF EXISTS "merchants";
      DROP TABLE IF EXISTS "transfers";
      DROP TABLE IF EXISTS "challenges";
      DROP TABLE IF EXISTS "holds";
      DROP TABLE IF EXISTS "ledger_entries";
      DROP TABLE IF EXISTS "ledger_transactions";
      DROP TABLE IF EXISTS "virtual_accounts";
      DROP TABLE IF EXISTS "accounts";
      DROP TABLE IF EXISTS "kyc_records";
      DROP TABLE IF EXISTS "devices";
      DROP TABLE IF EXISTS "phone_otps";
      DROP TABLE IF EXISTS "users";

      DROP TYPE IF EXISTS "agent_tool_calls_status_enum";
      DROP TYPE IF EXISTS "paga_events_status_enum";
      DROP TYPE IF EXISTS "settlements_status_enum";
      DROP TYPE IF EXISTS "merchant_orders_status_enum";
      DROP TYPE IF EXISTS "transfers_status_enum";
      DROP TYPE IF EXISTS "transfers_type_enum";
      DROP TYPE IF EXISTS "challenges_status_enum";
      DROP TYPE IF EXISTS "challenges_type_enum";
      DROP TYPE IF EXISTS "holds_status_enum";
      DROP TYPE IF EXISTS "ledger_entries_direction_enum";
      DROP TYPE IF EXISTS "ledger_transactions_type_enum";
      DROP TYPE IF EXISTS "accounts_status_enum";
      DROP TYPE IF EXISTS "accounts_accounttype_enum";
      DROP TYPE IF EXISTS "accounts_ownertype_enum";
      DROP TYPE IF EXISTS "kyc_records_status_enum";
      DROP TYPE IF EXISTS "devices_status_enum";
      DROP TYPE IF EXISTS "devices_algorithm_enum";
      DROP TYPE IF EXISTS "devices_platform_enum";
      DROP TYPE IF EXISTS "users_status_enum";
    `);
  }
}
