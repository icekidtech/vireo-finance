import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PagaService } from '../paga/paga.service';
import { User } from '../users/user.entity';
import { AccountsService } from './accounts.service';

export interface UserDepositAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

/**
 * The bank account number a person pays into to add money to their wallet.
 * It is normally created at signup; if that attempt failed (e.g. the payment
 * provider was down) it is created on first request here and then reused.
 */
@Injectable()
export class UserDepositService {
  private readonly logger = new Logger(UserDepositService.name);
  /** One in-flight provisioning per user, so a double tap cannot create two accounts. */
  private readonly inflight = new Map<string, Promise<UserDepositAccount>>();

  constructor(
    private readonly accounts: AccountsService,
    private readonly paga: PagaService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async getOrCreate(userId: string): Promise<UserDepositAccount> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const wallet = await this.accounts.getWallet(userId);

    const existing = await this.accounts.getVirtualAccountForAccount(wallet.id);
    if (existing)
      return {
        bankName: existing.bankName,
        accountNumber: existing.accountNumber,
        accountName: user.name,
      };

    let pending = this.inflight.get(userId);
    if (!pending) {
      pending = this.provision(user, wallet.id).finally(() => this.inflight.delete(userId));
      this.inflight.set(userId, pending);
    }
    return pending;
  }

  private async provision(user: User, walletId: string): Promise<UserDepositAccount> {
    // A BadGatewayException from the provider propagates; the global filter shows a generic message.
    const created = await this.paga.createVirtualAccount({
      userId: user.id,
      name: user.name,
      phone: user.phone,
    });
    const saved = await this.accounts.createVirtualAccount(user.id, walletId, created);
    this.logger.log(`Provisioned deposit account for user ${user.id}`);
    return { bankName: saved.bankName, accountNumber: saved.accountNumber, accountName: user.name };
  }
}
