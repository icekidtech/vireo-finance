import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  AccountStatus,
  AccountType,
  HoldStatus,
  LedgerDirection,
  LedgerTransactionType,
} from '../common/enums';
import { DEFAULT_CURRENCY } from '../common/constants';
import { assertPositive, formatMinor } from '../database/money';
import { Hold } from './hold.entity';
import { LedgerEntry } from './ledger-entry.entity';
import { LedgerTransaction } from './ledger-transaction.entity';

export interface LedgerLegInput {
  accountId: string;
  direction: LedgerDirection;
  amount: bigint;
}

export interface PostLedgerInput {
  idempotencyKey: string;
  type: LedgerTransactionType;
  reference: string;
  currency?: string;
  metadata?: Record<string, unknown> | null;
  legs: LedgerLegInput[];
}

export interface CreateHoldInput {
  accountId: string;
  amount: bigint;
  reference: string;
  expiresAt?: Date;
}

export interface BalanceSummary {
  accountId: string;
  currency: string;
  balance: bigint;
  held: bigint;
  available: bigint;
}

interface LockedAccountRow {
  id: string;
  accountType: AccountType;
  currency: string;
  status: AccountStatus;
  net: string;
  held: string;
}

function isDebitNormal(accountType: AccountType): boolean {
  return accountType === AccountType.PAGA_POOL;
}

function normalDirection(accountType: AccountType): LedgerDirection {
  return isDebitNormal(accountType) ? LedgerDirection.DEBIT : LedgerDirection.CREDIT;
}

function balanceFromNet(accountType: AccountType, netCreditMinusDebit: bigint): bigint {
  return isDebitNormal(accountType) ? -netCreditMinusDebit : netCreditMinusDebit;
}

/**
 * Balance-space delta: an entry in the account's normal direction increases
 * its balance. `net` itself stays credit-minus-debit in the stored entries;
 * balanceFromNet applies the debit-normal flip when reading it back.
 */
function signedDelta(accountType: AccountType, direction: LedgerDirection, amount: bigint): bigint {
  return direction === normalDirection(accountType) ? amount : -amount;
}

@Injectable()
export class LedgerService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  runInTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }

  /**
   * Posts a balanced double-entry transaction and returns the stored entries.
   * Balances are never persisted: they are derived from the entries, so the
   * account row lock is what makes the derived balance authoritative for the
   * duration of the transaction.
   */
  async post(manager: EntityManager, input: PostLedgerInput): Promise<LedgerTransaction> {
    if (input.legs.length < 2) {
      throw new BadRequestException('A ledger transaction requires at least two legs');
    }

    let totalDebit = 0n;
    let totalCredit = 0n;
    const accountIds = new Set<string>();
    for (const leg of input.legs) {
      assertPositive(leg.amount);
      accountIds.add(leg.accountId);
      if (leg.direction === LedgerDirection.DEBIT) totalDebit += leg.amount;
      else totalCredit += leg.amount;
    }
    if (totalDebit !== totalCredit) {
      throw new BadRequestException('Unbalanced ledger transaction');
    }
    if (totalDebit === 0n) {
      throw new BadRequestException('Ledger transaction amount must be greater than zero');
    }

    const sortedAccountIds = [...accountIds].sort();
    const rows = await this.lockAccounts(manager, sortedAccountIds);
    const byId = new Map(rows.map((row) => [row.id, row]));

    const deltas = new Map<string, bigint>();
    for (const leg of input.legs) {
      const row = byId.get(leg.accountId);
      if (!row) {
        throw new NotFoundException(`Account ${leg.accountId} not found`);
      }
      const delta = signedDelta(row.accountType, leg.direction, leg.amount);
      deltas.set(leg.accountId, (deltas.get(leg.accountId) ?? 0n) + delta);
    }

    for (const accountId of sortedAccountIds) {
      const row = byId.get(accountId)!;
      if (row.status !== AccountStatus.ACTIVE) {
        throw new BadRequestException(`Account ${accountId} is not active`);
      }
      const currentBalance = balanceFromNet(row.accountType, BigInt(row.net));
      const held = BigInt(row.held);
      const nextBalance = currentBalance + (deltas.get(accountId) ?? 0n);
      if (nextBalance < 0n) {
        throw new BadRequestException('Insufficient balance for this transaction');
      }
      if (nextBalance < held) {
        throw new BadRequestException(
          `Insufficient available balance: ${formatMinor(nextBalance)} is below ${formatMinor(
            held,
          )} held`,
        );
      }
    }

    const inserted = await manager.query(
      `INSERT INTO "ledger_transactions" ("idempotencyKey", "type", "reference", "status", "metadata")
       VALUES ($1, $2, $3, 'posted', $4)
       ON CONFLICT ("idempotencyKey") DO NOTHING
       RETURNING "id", "idempotencyKey", "type", "reference", "status", "metadata", "createdAt"`,
      [
        input.idempotencyKey,
        input.type,
        input.reference,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );

    if (inserted.length === 0) {
      const existing = await manager
        .getRepository(LedgerTransaction)
        .findOne({ where: { idempotencyKey: input.idempotencyKey } });
      if (!existing) {
        throw new BadRequestException('Idempotent ledger transaction could not be resolved');
      }
      return existing;
    }

    const transactionId: string = inserted[0].id;
    const entryRepository = manager.getRepository(LedgerEntry);
    const entries = input.legs.map((leg) =>
      entryRepository.create({
        transactionId,
        accountId: leg.accountId,
        direction: leg.direction,
        amount: leg.amount.toString(),
        currency: input.currency ?? DEFAULT_CURRENCY,
      }),
    );
    await entryRepository.save(entries);

    return manager.getRepository(LedgerTransaction).findOneOrFail({ where: { id: transactionId } });
  }

  async getBalance(accountId: string): Promise<BalanceSummary> {
    const rows = await this.dataSource.query(
      `SELECT a."id", a."accountType", a."currency",
              COALESCE((
                SELECT SUM(CASE WHEN e."direction" = 'credit' THEN e."amount" ELSE -e."amount" END)
                FROM "ledger_entries" e WHERE e."accountId" = a."id"
              ), 0)::text AS "net",
              COALESCE((
                SELECT SUM(h."amount") FROM "holds" h
                WHERE h."accountId" = a."id" AND h."status" = 'active'
              ), 0)::text AS "held"
       FROM "accounts" a
       WHERE a."id" = $1`,
      [accountId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
    const balance = balanceFromNet(row.accountType, BigInt(row.net));
    const held = BigInt(row.held);
    return {
      accountId,
      currency: row.currency,
      balance,
      held,
      available: balance - held,
    };
  }

  async getAccountEntries(
    accountId: string,
    limit = 50,
  ): Promise<
    Array<{
      id: string;
      direction: string;
      amount: string;
      currency: string;
      createdAt: Date;
    }>
  > {
    const rows = await this.dataSource.query(
      `SELECT "id", "direction", "amount", "currency", "createdAt"
       FROM "ledger_entries"
       WHERE "accountId" = $1
       ORDER BY "createdAt" DESC
       LIMIT $2`,
      [accountId, Math.min(Math.max(limit, 1), 100)],
    );
    return rows;
  }

  /**
   * Human-readable feed of every settled movement on one account, in or out, with
   * the counterparty resolved. Used for wallets and for a business's balance.
   */
  async getActivityFeed(accountId: string, limit = 50) {
    const parsed = Math.min(Math.max(Number.isFinite(limit) ? limit : 50, 1), 100);
    const rows: Array<Record<string, string | null>> = await this.dataSource.query(
      `SELECT e."id", e."direction", e."amount"::text AS "amount", e."currency", e."createdAt",
              t."type", t."reference",
              tr."id" AS "transferId", tr."recipientName", tr."fee"::text AS "fee",
              u."name" AS "initiatorName", m."businessName" AS "merchantName"
       FROM "ledger_entries" e
       JOIN "ledger_transactions" t ON t."id" = e."transactionId"
       LEFT JOIN "transfers" tr
         ON t."type" IN ('internal_transfer', 'merchant_payment', 'bank_transfer')
        AND tr."id"::text = t."reference"
       LEFT JOIN "users" u ON u."id" = tr."initiatedByUserId"
       LEFT JOIN "accounts" da
         ON da."id" = tr."destinationAccountId" AND da."ownerType" = 'merchant'
       LEFT JOIN "merchants" m ON m."id"::text = da."ownerId"::text
       WHERE e."accountId" = $1
       ORDER BY e."createdAt" DESC
       LIMIT $2`,
      [accountId, parsed],
    );
    return rows.map((row) => presentActivityRow(row));
  }

  async createHold(manager: EntityManager, input: CreateHoldInput): Promise<Hold> {
    assertPositive(input.amount);
    const [row] = await this.lockAccounts(manager, [input.accountId]);
    if (!row) {
      throw new NotFoundException(`Account ${input.accountId} not found`);
    }
    if (row.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(`Account ${input.accountId} is not active`);
    }

    const balance = balanceFromNet(row.accountType, BigInt(row.net));
    const held = BigInt(row.held);
    if (balance - held < input.amount) {
      throw new BadRequestException('Insufficient available balance');
    }

    return manager.getRepository(Hold).save(
      manager.getRepository(Hold).create({
        accountId: input.accountId,
        amount: input.amount.toString(),
        reference: input.reference,
        status: HoldStatus.ACTIVE,
        expiresAt: input.expiresAt ?? null,
      }),
    );
  }

  async releaseHold(manager: EntityManager, holdId: string): Promise<Hold> {
    const hold = await this.lockHold(manager, holdId);
    if (hold.status !== HoldStatus.ACTIVE) return hold;
    hold.status = HoldStatus.RELEASED;
    hold.settledAt = new Date();
    return manager.getRepository(Hold).save(hold);
  }

  /**
   * Captures a hold (releases the reservation). The matching balance movement
   * must be posted by the caller with the same EntityManager.
   */
  async captureHold(manager: EntityManager, holdId: string): Promise<Hold> {
    const hold = await this.lockHold(manager, holdId);
    if (hold.status !== HoldStatus.ACTIVE) {
      throw new BadRequestException(`Hold ${holdId} is not active`);
    }
    hold.status = HoldStatus.CAPTURED;
    hold.settledAt = new Date();
    return manager.getRepository(Hold).save(hold);
  }

  private async lockHold(manager: EntityManager, holdId: string): Promise<Hold> {
    const preview = await manager.getRepository(Hold).findOne({ where: { id: holdId } });
    if (!preview) {
      throw new NotFoundException(`Hold ${holdId} not found`);
    }
    await this.lockAccounts(manager, [preview.accountId]);
    return manager.getRepository(Hold).findOneOrFail({
      where: { id: holdId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async lockAccounts(
    manager: EntityManager,
    accountIds: string[],
  ): Promise<LockedAccountRow[]> {
    if (accountIds.length === 0) return [];

    const accounts: Array<{
      id: string;
      accountType: AccountType;
      currency: string;
      status: AccountStatus;
    }> = await manager.query(
      `SELECT "id", "accountType", "currency", "status"
       FROM "accounts"
       WHERE "id" = ANY($1::uuid[])
       ORDER BY "id"
       FOR UPDATE`,
      [accountIds],
    );
    if (accounts.length === 0) return [];

    const nets: Array<{ accountId: string; net: string }> = await manager.query(
      `SELECT "accountId",
              COALESCE(SUM(CASE WHEN "direction" = 'credit' THEN "amount" ELSE -"amount" END), 0)::text AS "net"
       FROM "ledger_entries"
       WHERE "accountId" = ANY($1::uuid[])
       GROUP BY "accountId"`,
      [accountIds],
    );
    const helds: Array<{ accountId: string; held: string }> = await manager.query(
      `SELECT "accountId", COALESCE(SUM("amount"), 0)::text AS "held"
       FROM "holds"
       WHERE "accountId" = ANY($1::uuid[]) AND "status" = 'active'
       GROUP BY "accountId"`,
      [accountIds],
    );

    const netByAccount = new Map(nets.map((row) => [row.accountId, row.net]));
    const heldByAccount = new Map(helds.map((row) => [row.accountId, row.held]));

    return accounts.map((account) => ({
      ...account,
      net: netByAccount.get(account.id) ?? '0',
      held: heldByAccount.get(account.id) ?? '0',
    }));
  }
}

/** Turns one ledger row into what an app shows: direction, who it was with, and a readable label. */
export function presentActivityRow(row: Record<string, string | null>) {
  const outgoing = row.direction === LedgerDirection.DEBIT;
  let counterparty: string;
  if (outgoing) {
    counterparty =
      row.type === 'settlement'
        ? 'Cash out to bank'
        : row.type === 'fee'
          ? 'Fee'
          : (row.merchantName ??
            row.recipientName ??
            (row.type === 'bank_transfer' ? 'Bank transfer' : 'Transfer'));
  } else if (row.type === 'inbound_credit') {
    counterparty = 'Bank deposit';
  } else if (row.type === 'settlement' || row.type === 'reversal' || row.type === 'refund') {
    counterparty = row.type === 'settlement' ? 'Cash out returned' : 'Refund';
  } else {
    counterparty = row.initiatorName ?? 'Received';
  }
  return {
    id: row.id,
    type: row.type,
    direction: outgoing ? 'out' : 'in',
    amount: formatMinor(BigInt(row.amount ?? '0')),
    currency: row.currency,
    counterparty,
    transferId: row.transferId,
    reference: row.reference,
    createdAt: row.createdAt,
  };
}
