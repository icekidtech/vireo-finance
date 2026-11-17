import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MoreThan } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { encryptEmbedding, hmacSha256Hex, parseEncryptionKey } from '../common/crypto';
import { KycStatus, UserStatus } from '../common/enums';
import { User } from '../users/user.entity';
import { BVN_VERIFIER, BvnVerifier } from './bvn-verifier';
import { PERSONAL_TIERS } from './tiers';
import { formatMinor } from '../database/money';
import { KycIdentity } from './kyc-identity.entity';
import { KycRecord } from './kyc-record.entity';
import {
  KycRecordResponse,
  SubmitKycDto,
  UserKycResponse,
  VerifyBvnDto,
  VerifyKycDto,
} from './kyc.dto';

const BVN_PROVIDER = 'bvn';
const MAX_FAILED_BVN_ATTEMPTS = 3;
const ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_AGE_YEARS = 18;

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(KycRecord) private readonly kycRecords: Repository<KycRecord>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(KycIdentity) private readonly identities: Repository<KycIdentity>,
    private readonly config: ConfigService,
    @Optional() @Inject(BVN_VERIFIER) private readonly bvnVerifier: BvnVerifier | null,
  ) {}

  /**
   * The ladder of tiers for this user: what each unlocks and what is needed.
   * A requirement is `available` only when we can really verify it today.
   */
  async getTiers(userId: string) {
    const status = await this.getUserKycStatus(userId);
    const limits = this.config.get<Record<number, bigint>>('risk.tierDailyLimits') ?? {};
    const availableNow: Record<string, boolean> = {
      phone: true,
      bvn: status.bvnAvailable,
      nin_id: false, // needs a NIN / ID-document verification vendor
      address: false, // needs an address-verification vendor
    };
    return {
      currentTier: status.kycTier,
      tiers: PERSONAL_TIERS.map((def) => ({
        tier: def.tier,
        name: def.name,
        dailyLimit: formatMinor(limits[def.tier] ?? 0n),
        state:
          def.tier <= status.kycTier
            ? 'completed'
            : def.tier === status.kycTier + 1
              ? 'next'
              : 'locked',
        requirements: def.requirements.map((r) => ({
          key: r.key,
          label: r.label,
          available: availableNow[r.key] ?? false,
        })),
      })),
    };
  }

  private bvnKey(): Buffer | null {
    const raw = this.config.get<string>('kyc.encryptionKey');
    if (!raw) return null;
    try {
      return parseEncryptionKey(raw);
    } catch {
      return null;
    }
  }

  private bvnAvailable(): boolean {
    return !!this.bvnVerifier && !!this.bvnKey();
  }

  /**
   * Tier 1: proves the user's name and date of birth match their BVN record.
   * The BVN is never returned or logged; it is stored encrypted, with a keyed
   * hash so one BVN cannot verify several accounts. Failed attempts are
   * capped per user to stop the endpoint being used to probe BVN records.
   */
  async verifyBvn(userId: string, dto: VerifyBvnDto): Promise<UserKycResponse> {
    const key = this.bvnKey();
    if (!this.bvnVerifier || !key) {
      throw new ServiceUnavailableException('Identity verification is not available yet');
    }
    this.assertAdult(dto.dateOfBirth);

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (await this.identities.findOne({ where: { userId } })) {
      throw new ConflictException('Your identity is already verified');
    }

    const failed = await this.kycRecords.count({
      where: {
        userId,
        provider: BVN_PROVIDER,
        status: KycStatus.REJECTED,
        createdAt: MoreThan(new Date(Date.now() - ATTEMPT_WINDOW_MS)),
      },
    });
    if (failed >= MAX_FAILED_BVN_ATTEMPTS) {
      throw new HttpException(
        'Too many unsuccessful attempts. Please try again tomorrow or contact support.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const last4 = dto.bvn.slice(-4);
    const bvnHash = hmacSha256Hex(key.toString('base64'), `kyc-bvn:${dto.bvn}`);

    // Same message for "no match" and "already used", so this cannot be used
    // to learn whether a BVN is registered with us.
    const rejectMessage =
      'We could not verify these details. Check that they match your BVN record and try again.';
    const reject = async (reason: string): Promise<never> => {
      await this.kycRecords.save(
        this.kycRecords.create({
          userId,
          tier: 0,
          provider: BVN_PROVIDER,
          status: KycStatus.REJECTED,
          payload: { reason, bvnLast4: last4 },
        }),
      );
      throw new BadRequestException(rejectMessage);
    };

    const usedBy = await this.identities.findOne({ where: { bvnHash } });
    if (usedBy) {
      this.logger.warn(
        `BVN ending ${last4} is already verified on another account (user ${userId})`,
      );
      return reject('bvn_in_use');
    }

    const matched = await this.bvnVerifier.verify({
      bvn: dto.bvn,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      dateOfBirth: dto.dateOfBirth,
    });
    if (!matched) return reject('no_match');

    try {
      await this.kycRecords.manager.transaction(async (manager) => {
        await manager.getRepository(KycIdentity).save(
          manager.getRepository(KycIdentity).create({
            userId,
            bvnHash,
            bvnEncrypted: encryptEmbedding(dto.bvn, key, userId),
            bvnLast4: last4,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            dateOfBirth: dto.dateOfBirth,
          }),
        );
        await manager.getRepository(KycRecord).save(
          manager.getRepository(KycRecord).create({
            userId,
            tier: 1,
            provider: BVN_PROVIDER,
            status: KycStatus.VERIFIED,
            payload: { bvnLast4: last4, method: this.bvnVerifier!.name },
            verifiedAt: new Date(),
          }),
        );
        await manager
          .getRepository(User)
          .update({ id: userId }, { kycTier: Math.max(user.kycTier, 1) });
      });
    } catch (error) {
      // Unique-index race: the same BVN or user verified concurrently.
      if ((error as { code?: string }).code === '23505') {
        return reject('bvn_in_use');
      }
      throw error;
    }

    return this.getUserKycStatus(userId);
  }

  private assertAdult(dateOfBirth: string): void {
    const dob = new Date(`${dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== dateOfBirth) {
      throw new BadRequestException('dateOfBirth is not a valid date');
    }
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - MIN_AGE_YEARS);
    if (dob > cutoff) {
      throw new BadRequestException(
        `You must be at least ${MIN_AGE_YEARS} to verify your identity`,
      );
    }
  }

  async submitKyc(userId: string, dto: SubmitKycDto): Promise<KycRecordResponse> {
    const existing = await this.kycRecords.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (existing && existing.status === KycStatus.PENDING) {
      throw new BadRequestException('A KYC application is already pending review');
    }

    const record = await this.kycRecords.save(
      this.kycRecords.create({
        userId,
        tier: 0,
        provider: dto.provider,
        status: KycStatus.PENDING,
        payload: dto.payload ? { raw: dto.payload } : null,
      }),
    );

    return this.toResponse(record);
  }

  async getKycForUser(userId: string): Promise<KycRecordResponse | null> {
    const record = await this.kycRecords.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!record) {
      return null;
    }
    return this.toResponse(record);
  }

  async getUserKycStatus(userId: string): Promise<UserKycResponse> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const record = await this.kycRecords.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const identity = await this.identities.findOne({ where: { userId } });
    let status: UserKycResponse['status'];
    if (identity || record?.status === KycStatus.VERIFIED) {
      status = KycStatus.VERIFIED;
    } else if (!record) {
      status = 'not_started';
    } else if (record.status === KycStatus.REJECTED && record.provider === BVN_PROVIDER) {
      // A BVN check that did not match: started but not complete, and can be retried.
      status = KycStatus.PENDING;
    } else {
      status = record.status;
    }
    return {
      userId,
      kycTier: user.kycTier,
      status,
      bvnAvailable: this.bvnAvailable(),
      bvnLast4: identity?.bvnLast4 ?? null,
    };
  }

  async verifyKyc(kycRecordId: string, dto: VerifyKycDto): Promise<KycRecordResponse> {
    const record = await this.kycRecords.findOne({ where: { id: kycRecordId } });
    if (!record) {
      throw new NotFoundException('KYC record not found');
    }
    if (record.status !== KycStatus.PENDING) {
      throw new BadRequestException(`KYC record is already ${record.status}`);
    }

    const tier = dto.tier ? Number.parseInt(dto.tier, 10) : 0;
    if (!Number.isFinite(tier) || tier < 0 || tier > 3) {
      throw new BadRequestException('tier must be 0, 1, 2, or 3');
    }

    const user = await this.users.findOne({ where: { id: record.userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    record.status = dto.status;
    record.tier = tier;
    record.verifiedAt = new Date();
    await this.kycRecords.save(record);

    if (dto.status === KycStatus.VERIFIED) {
      user.kycTier = tier;
      user.status = UserStatus.ACTIVE;
      await this.users.save(user);
    } else if (dto.status === KycStatus.REJECTED) {
      user.status = UserStatus.SUSPENDED;
      await this.users.save(user);
    }

    return this.toResponse(record);
  }

  async listPendingKyc(): Promise<KycRecordResponse[]> {
    const records = await this.kycRecords.find({
      where: { status: KycStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
    return records.map((r) => this.toResponse(r));
  }

  private toResponse(record: KycRecord): KycRecordResponse {
    return {
      id: record.id,
      userId: record.userId,
      tier: record.tier,
      provider: record.provider,
      status: record.status,
      payload: record.payload,
      verifiedAt: record.verifiedAt,
      createdAt: record.createdAt,
    };
  }
}
