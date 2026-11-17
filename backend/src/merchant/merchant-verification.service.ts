import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycIdentity } from '../kyc/kyc-identity.entity';
import { User } from '../users/user.entity';
import { formatMinor } from '../database/money';
import {
  BUSINESS_LEVELS,
  BUSINESS_LEVEL_FOR,
  CAC_NUMBER_PATTERN,
  DEFAULT_CASHOUT_LIMITS,
  TIN_PATTERN,
} from '../kyc/tiers';
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
    private readonly config: ConfigService,
  ) {}

  /** Daily cash-out cap for a business level (minor units). Level 0 cannot cash out. */
  cashoutLimit(level: number): bigint {
    const configured = this.config.get<Record<number, bigint>>('merchantLimits.cashoutDailyLimits');
    return (configured ?? DEFAULT_CASHOUT_LIMITS)[level] ?? 0n;
  }

  async getLevels(userId: string) {
    const merchant = await this.merchants.findOne({ where: { ownerUserId: userId } });
    if (!merchant) throw new NotFoundException('Merchant profile not found');
    const current = BUSINESS_LEVEL_FOR(
      merchant.kybStatus === 'verified',
      merchant.registrationStatus === 'verified',
    );
    return {
      currentLevel: current,
      registrationStatus: merchant.registrationStatus,
      cacNumber: merchant.cacNumber,
      tin: merchant.tin,
      levels: BUSINESS_LEVELS.map((def) => ({
        level: def.level,
        name: def.name,
        cashoutDailyLimit: def.level === 0 ? null : formatMinor(this.cashoutLimit(def.level)),
        state: def.level <= current ? 'completed' : def.level === current + 1 ? 'next' : 'locked',
        requirements: def.requirements,
      })),
    };
  }

  /** Level 2: the owner submits the CAC number (and TIN) for a reviewer to confirm against the CAC register. */
  async submitRegistration(userId: string, input: { cacNumber: string; tin?: string }) {
    const merchant = await this.merchants.findOne({ where: { ownerUserId: userId } });
    if (!merchant) throw new NotFoundException('Merchant profile not found');
    if (merchant.kybStatus !== 'verified') {
      throw new BadRequestException('Verify your identity and payout account (level 1) first');
    }
    if (merchant.registrationStatus === 'pending') {
      throw new ConflictException('Your registration is already being reviewed');
    }
    if (merchant.registrationStatus === 'verified') {
      throw new ConflictException('Your business registration is already verified');
    }
    const cacNumber = input.cacNumber.trim().toUpperCase().replace(/\s+/g, '');
    if (!CAC_NUMBER_PATTERN.test(cacNumber)) {
      throw new BadRequestException('Enter a CAC number like RC1234567, BN1234567 or IT1234567');
    }
    const tin = input.tin?.trim() || null;
    if (tin && !TIN_PATTERN.test(tin)) {
      throw new BadRequestException('TIN must be 8 to 14 digits');
    }
    merchant.cacNumber = cacNumber;
    merchant.tin = tin;
    merchant.registrationStatus = 'pending';
    await this.merchants.save(merchant);
    return this.getLevels(userId);
  }

  /** Reviewer decision on a submitted registration (admin only, enforced by the controller). */
  async reviewRegistration(merchantId: string, status: 'verified' | 'rejected') {
    const merchant = await this.merchants.findOne({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    if (merchant.registrationStatus !== 'pending') {
      throw new BadRequestException('There is no registration waiting for review');
    }
    merchant.registrationStatus = status;
    await this.merchants.save(merchant);
    this.logger.log(`Merchant ${merchant.id} registration ${status}`);
    return { id: merchant.id, registrationStatus: merchant.registrationStatus };
  }

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
