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
