import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { HoldStatus } from '../common/enums';
import { Hold } from '../ledger/hold.entity';
import { LedgerService } from '../ledger/ledger.service';
import { User } from '../users/user.entity';

const CAP_HOLD_PREFIX = 'kyc-cap:';

/**
 * Balance caps per KYC tier. A bank transfer cannot be refused after it has
 * arrived, so money above the cap is accepted but RESTRICTED: held back from
 * spending and transfers until the user verifies more of their identity (which
 * raises the cap and releases it). The restriction is a ledger hold, so every
 * spending path already respects it. A cap of 0 means unlimited.
 */
@Injectable()
export class BalanceCapService {
  private readonly logger = new Logger(BalanceCapService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Hold) private readonly holds: Repository<Hold>,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly config: ConfigService,
  ) {}

  /** The wallet balance cap for a tier in minor units; 0n means no cap. */
  capFor(tier: number): bigint {
    const caps = this.config.get<Record<number, bigint>>('risk.tierMaxBalance') ?? {};
    return caps[tier] ?? 0n;
  }

  /**
   * Recomputes the restriction from scratch, so it is correct after a credit,
   * a spend or a tier change. Returns the amount now restricted.
   */
  async reconcile(userId: string): Promise<bigint> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) return 0n;
    const wallet = await this.accounts.getWallet(userId);
    const cap = this.capFor(user.kycTier);

    return this.ledger.runInTransaction(async (manager) => {
      const existing = await manager.getRepository(Hold).find({
        where: {
          accountId: wallet.id,
          status: HoldStatus.ACTIVE,
          reference: Like(`${CAP_HOLD_PREFIX}%`),
        },
      });
      let released = 0n;
      for (const hold of existing) {
        await this.ledger.releaseHold(manager, hold.id);
        released += BigInt(hold.amount);
      }
      if (cap === 0n) return 0n;

      const summary = await this.ledger.getBalance(wallet.id);
      // `held` still counts the cap holds released above (not yet committed).
      const available = summary.available + released;
      const excess = summary.balance > cap ? summary.balance - cap : 0n;
      const restrict = excess < available ? excess : available;
      if (restrict > 0n) {
        await this.ledger.createHold(manager, {
          accountId: wallet.id,
          amount: restrict,
          reference: `${CAP_HOLD_PREFIX}${randomUUID()}`,
        });
        this.logger.log(
          `Restricted ${restrict} minor units above the tier ${user.kycTier} cap for user ${userId}`,
        );
      }
      return restrict;
    });
  }

  /** What is currently restricted on a wallet. */
  restrictedFor(walletId: string): Promise<bigint> {
    return this.accounts.restrictedFor(walletId);
  }
}
