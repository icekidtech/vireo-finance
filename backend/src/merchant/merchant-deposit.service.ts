import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { PagaService } from '../paga/paga.service';
import { User } from '../users/user.entity';
import { Merchant } from './merchant.entity';

export interface DepositAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

/**
 * The bank account a merchant gives customers to pay into. Transfers to it are
 * credited by the Paga callback straight to the merchant balance (not the
 * owner's personal wallet). It is created on first request and then reused.
 */
@Injectable()
export class MerchantDepositService {
  private readonly logger = new Logger(MerchantDepositService.name);
  /** One in-flight provisioning per merchant, so a double tap cannot create two accounts. */
  private readonly inflight = new Map<string, Promise<DepositAccount>>();

  constructor(
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly accounts: AccountsService,
    private readonly paga: PagaService,
  ) {}

  async getDepositAccount(userId: string): Promise<DepositAccount> {
    const merchant = await this.merchants.findOne({ where: { ownerUserId: userId } });
    if (!merchant || !merchant.settlementAccountId) {
      throw new NotFoundException('Merchant profile not found');
    }

    // A bank account number is only issued once the owner's identity (BVN) is verified.
    const owner = await this.users.findOne({ where: { id: userId } });
    if (!owner) throw new NotFoundException('User not found');
    if (owner.kycTier < 1) {
      throw new ForbiddenException('Verify your identity to get a bank account number');
    }

    const existing = await this.accounts.getVirtualAccountForAccount(merchant.settlementAccountId);
    if (existing) return this.present(existing, merchant);

    let pending = this.inflight.get(merchant.id);
    if (!pending) {
      pending = this.provision(merchant, owner).finally(() => this.inflight.delete(merchant.id));
      this.inflight.set(merchant.id, pending);
    }
    return pending;
  }

  private async provision(merchant: Merchant, owner: User): Promise<DepositAccount> {
    const userId = owner.id;

    // A BadGatewayException from Paga propagates; the global filter shows a generic message.
    // Use the owner's name (not business name) for Paga's registerPersistentPaymentAccount API
    // which requires real person names for firstName/lastName fields.
    const created = await this.paga.createVirtualAccount({
      userId,
      referenceId: merchant.id,
      name: owner.name,
      phone: owner.phone,
    });
    const saved = await this.accounts.createVirtualAccount(
      userId,
      merchant.settlementAccountId!,
      created,
    );
    this.logger.log(`Provisioned deposit account for merchant ${merchant.id}`);
    return this.present(saved, merchant);
  }

  private present(
    va: { accountNumber: string; bankName: string },
    merchant: Merchant,
  ): DepositAccount {
    return {
      bankName: va.bankName,
      accountNumber: va.accountNumber,
      accountName: merchant.businessName,
    };
  }
}
