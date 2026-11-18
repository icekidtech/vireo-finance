import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AccountOwnerType, AccountStatus, AccountType } from '../common/enums';
import { DEFAULT_CURRENCY } from '../common/constants';
import { Account } from './account.entity';
import { VirtualAccount } from './virtual-account.entity';

@Injectable()
export class AccountsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(VirtualAccount) private readonly virtualAccounts: Repository<VirtualAccount>,
  ) {}

  async createWallet(userId: string, manager?: EntityManager): Promise<Account> {
    const work = async (tx: EntityManager): Promise<Account> =>
      tx.getRepository(Account).save(
        tx.getRepository(Account).create({
          ownerType: AccountOwnerType.USER,
          ownerId: userId,
          accountType: AccountType.WALLET,
          currency: DEFAULT_CURRENCY,
          status: AccountStatus.ACTIVE,
        }),
      );
    return manager ? work(manager) : this.dataSource.transaction(work);
  }

  async createMerchantBalance(merchantId: string, manager?: EntityManager): Promise<Account> {
    const work = async (tx: EntityManager): Promise<Account> =>
      tx.getRepository(Account).save(
        tx.getRepository(Account).create({
          ownerType: AccountOwnerType.MERCHANT,
          ownerId: merchantId,
          accountType: AccountType.MERCHANT_BALANCE,
          currency: DEFAULT_CURRENCY,
          status: AccountStatus.ACTIVE,
        }),
      );
    return manager ? work(manager) : this.dataSource.transaction(work);
  }

  /** One of OUR deposit account numbers (a wallet's or a business's), or null for any outside number. */
  async findOwnDepositAccount(
    accountNumber: string,
  ): Promise<{ accountId: string; userId: string } | null> {
    const va = await this.virtualAccounts.findOne({ where: { accountNumber, status: 'active' } });
    return va ? { accountId: va.accountId, userId: va.userId } : null;
  }

  /** The user who owns a personal wallet account, or null for any other account. */
  async walletOwner(accountId: string): Promise<string | null> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    return account && account.ownerType === AccountOwnerType.USER ? account.ownerId : null;
  }

  /** Money held back by the tier balance cap (see BalanceCapService). */
  async restrictedFor(walletId: string): Promise<bigint> {
    const rows = await this.dataSource.query(
      `SELECT COALESCE(SUM("amount"), 0)::text AS "restricted"
       FROM "holds"
       WHERE "accountId" = $1 AND "status" = 'active' AND "reference" LIKE 'kyc-cap:%'`,
      [walletId],
    );
    return BigInt(rows[0]?.restricted ?? '0');
  }

  async getWallet(userId: string): Promise<Account> {
    const account = await this.accounts.findOne({
      where: {
        ownerType: AccountOwnerType.USER,
        ownerId: userId,
        accountType: AccountType.WALLET,
        status: AccountStatus.ACTIVE,
      },
    });
    if (!account) {
      throw new NotFoundException('Wallet not found for user');
    }
    return account;
  }

  async getAccount(accountId: string): Promise<Account> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  async getMerchantAccount(merchantId: string): Promise<Account> {
    const account = await this.accounts.findOne({
      where: {
        ownerType: AccountOwnerType.MERCHANT,
        ownerId: merchantId,
        accountType: AccountType.MERCHANT_BALANCE,
        status: AccountStatus.ACTIVE,
      },
    });
    if (!account) {
      throw new NotFoundException('Merchant balance account not found');
    }
    return account;
  }

  async createVirtualAccount(
    userId: string,
    accountId: string,
    data: { accountNumber: string; bankName: string; providerReference: string },
  ): Promise<VirtualAccount> {
    return this.virtualAccounts.save(
      this.virtualAccounts.create({
        userId,
        accountId,
        accountNumber: data.accountNumber,
        bankName: data.bankName,
        providerReference: data.providerReference,
        status: 'active',
      }),
    );
  }

  /** The deposit account that credits one specific ledger account (a wallet or a merchant balance). */
  async getVirtualAccountForAccount(accountId: string): Promise<VirtualAccount | null> {
    return this.virtualAccounts.findOne({ where: { accountId, status: 'active' } });
  }
}
