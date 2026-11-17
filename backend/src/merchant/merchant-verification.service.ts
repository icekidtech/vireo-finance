import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycIdentity } from '../kyc/kyc-identity.entity';
import { User } from '../users/user.entity';
import { Merchant } from './merchant.entity';

export type VerificationReason =
  'verified' | 'rejected' | 'identity_required' | 'bank_required' | 'name_mismatch';

export interface VerificationOutcome {
  kybStatus: string;
  reason: VerificationReason;
  kycTier: number;
}

/**
 * Automatic verification for individual / sole-proprietor merchants: the owner
 * has proved their identity (BVN) and the payout bank account is in their own
 * name. Anything else (e.g. a company account) stays pending for a person to
 * review. A rejection by an admin is never overridden here.
 */
@Injectable()
export class MerchantVerificationService {
  private readonly logger = new Logger(MerchantVerificationService.name);

  constructor(
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(KycIdentity) private readonly identities: Repository<KycIdentity>,
  ) {}

  async check(userId: string): Promise<VerificationOutcome> {
    const merchant = await this.merchants.findOne({ where: { ownerUserId: userId } });
    const user = await this.users.findOne({ where: { id: userId } });
    if (!merchant || !user) throw new NotFoundException('Merchant profile not found');

    const outcome = (reason: VerificationReason): VerificationOutcome => ({
      kybStatus: merchant.kybStatus,
      reason,
      kycTier: user.kycTier,
    });

    if (merchant.kybStatus === 'verified') return outcome('verified');
    if (merchant.kybStatus === 'rejected') return outcome('rejected');

    const identity = await this.identities.findOne({ where: { userId } });
    if (!identity || user.kycTier < 1) return outcome('identity_required');
    if (!merchant.settlementAccountName) return outcome('bank_required');

    if (!nameMatches(merchant.settlementAccountName, identity.firstName, identity.lastName)) {
      return outcome('name_mismatch');
    }

    merchant.kybStatus = 'verified';
    await this.merchants.save(merchant);
    this.logger.log(
      `Merchant ${merchant.id} verified automatically (owner BVN + matching payout name)`,
    );
    return { kybStatus: 'verified', reason: 'verified', kycTier: user.kycTier };
  }
}

function tokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Both the first and the last name from the BVN record must appear in the account name, in any order. */
export function nameMatches(accountName: string, firstName: string, lastName: string): boolean {
  const account = new Set(tokens(accountName));
  const first = tokens(firstName);
  const last = tokens(lastName);
  return (
    first.length > 0 &&
    last.length > 0 &&
    first.every((t) => account.has(t)) &&
    last.every((t) => account.has(t))
  );
}
