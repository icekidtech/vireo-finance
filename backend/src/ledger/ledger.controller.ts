import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Account } from '../accounts/account.entity';
import { AccountOwnerType, AccountStatus, AccountType, LedgerDirection } from '../common/enums';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { formatMinor } from '../database/money';
import { LedgerService } from './ledger.service';

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get('balance')
  async balance(@CurrentUser() user: AuthenticatedUser, @Query('accountId') accountId?: string) {
    return this.ledger.getBalance(await this.resolveAccountId(user.userId, accountId));
  }

  @Get('entries')
  async entries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
  ) {
    const id = await this.resolveAccountId(user.userId, accountId);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
    return this.ledger.getAccountEntries(id, parsedLimit);
  }

  /**
   * Human-readable wallet feed: every settled movement on the caller's wallet,
   * in or out, with the counterparty resolved. Unlike GET /transfers this also
   * includes money received (peer transfers and bank deposits).
   */
  @Get('activity')
  async activity(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const accountId = await this.resolveAccountId(user.userId);
    const parsed = limit ? Number.parseInt(limit, 10) : 50;
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
      [accountId, Math.min(Math.max(Number.isFinite(parsed) ? parsed : 50, 1), 100)],
    );

    return rows.map((row) => {
      const outgoing = row.direction === LedgerDirection.DEBIT;
      const counterparty = outgoing
        ? (row.merchantName ??
          row.recipientName ??
          (row.type === 'bank_transfer' ? 'Bank transfer' : 'Transfer'))
        : row.type === 'inbound_credit'
          ? 'Bank deposit'
          : (row.initiatorName ?? 'Received');
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
    });
  }

  /**
   * Ledger reads are scoped to accounts the caller owns. Omitting accountId
   * resolves to the caller's wallet, so clients never need to know their id.
   */
  private async resolveAccountId(userId: string, accountId?: string): Promise<string> {
    if (!accountId) {
      const wallet = await this.accounts.findOne({
        where: {
          ownerType: AccountOwnerType.USER,
          ownerId: userId,
          accountType: AccountType.WALLET,
          status: AccountStatus.ACTIVE,
        },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found for user');
      }
      return wallet.id;
    }

    const owned = await this.accounts.findOne({
      where: { id: accountId, ownerType: AccountOwnerType.USER, ownerId: userId },
    });
    if (!owned) {
      throw new NotFoundException('Account not found');
    }
    return owned.id;
  }
}
