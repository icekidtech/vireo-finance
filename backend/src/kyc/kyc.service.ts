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
import { DocumentsService } from '../documents/documents.service';
import { sniffMime } from '../documents/documents.service';
import { IDENTITY_VERIFIER, IdentityVerifier } from './identity-verifier';
import { nameMatches } from './names';
import { BalanceCapService } from '../risk/balance-cap.service';
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
  VerifyTier2Dto,
  VerifyTier3Dto,
} from './kyc.dto';

const BVN_PROVIDER = 'bvn';
const NIN_PROVIDER = 'nin_id';
const ADDRESS_PROVIDER = 'address';
const MAX_FAILED_ATTEMPTS = 3;
const MAX_SELFIE_BYTES = 4 * 1024 * 1024;
const REJECT_MESSAGE =
  'We could not verify these details. Check that they match your records and try again.';
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
    @Optional() @Inject(IDENTITY_VERIFIER) private readonly verifier: IdentityVerifier | null,
    private readonly documents: DocumentsService,
    @Optional() private readonly balanceCaps?: BalanceCapService,
  ) {}

  /**
   * The ladder of tiers for this user: what each unlocks and what is needed.
   * A requirement is `available` only when we can really verify it today.
   */
  async getTiers(userId: string) {
    const status = await this.getUserKycStatus(userId);
    const limits = this.config.get<Record<number, bigint>>('risk.tierDailyLimits') ?? {};
    const maxBalances = this.config.get<Record<number, bigint>>('risk.tierMaxBalance') ?? {};
    const canVerify = this.available();
    const withDocuments = canVerify && this.documents.isAvailable();
    const availableNow: Record<string, boolean> = {
      phone: true,
      bvn: canVerify,
      nin_id: withDocuments,
      address: withDocuments,
    };
    return {
      currentTier: status.kycTier,
      tiers: PERSONAL_TIERS.map((def) => ({
        tier: def.tier,
        name: def.name,
        dailyLimit: formatMinor(limits[def.tier] ?? 0n),
        /** Null means no cap on the wallet balance. */
        maxBalance: (maxBalances[def.tier] ?? 0n) > 0n ? formatMinor(maxBalances[def.tier]) : null,
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

  /** Verification needs a vendor and the key that encrypts the numbers we keep. */
  private available(): boolean {
    return !!this.verifier && !!this.bvnKey();
  }

  private requireReady(): { verifier: IdentityVerifier; key: Buffer } {
    const key = this.bvnKey();
    if (!this.verifier || !key) {
      throw new ServiceUnavailableException('Identity verification is not available yet');
    }
    return { verifier: this.verifier, key };
  }

  private minFaceMatch(): number {
    return this.config.get<number>('kyc.minFaceMatch') ?? 75;
  }

  /** Failed automated attempts are capped per user and step, so a step cannot be used to probe records. */
  private async assertAttemptsLeft(userId: string, provider: string): Promise<void> {
    const failed = await this.kycRecords.count({
      where: {
        userId,
        provider,
        status: KycStatus.REJECTED,
        createdAt: MoreThan(new Date(Date.now() - ATTEMPT_WINDOW_MS)),
      },
    });
    if (failed >= MAX_FAILED_ATTEMPTS) {
      throw new HttpException(
        'Too many unsuccessful attempts. Please try again tomorrow or contact support.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Records a failed attempt and answers with one generic message (never why it failed). */
  private async rejectAttempt(
    userId: string,
    provider: string,
    reason: string,
    extra: Record<string, unknown> = {},
  ): Promise<never> {
    await this.kycRecords.save(
      this.kycRecords.create({
        userId,
        tier: 0,
        provider,
        status: KycStatus.REJECTED,
        payload: { reason, ...extra },
      }),
    );
    throw new BadRequestException(REJECT_MESSAGE);
  }

  private decodeSelfie(selfieBase64: string): Buffer {
    const raw = selfieBase64.replace(/^data:image\/[a-z+]+;base64,/i, '');
    const bytes = Buffer.from(raw, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_SELFIE_BYTES || sniffMime(bytes) === null) {
      throw new BadRequestException('Take a clear selfie and try again');
    }
    return bytes;
  }

  private async finishTier(
    userId: string,
    tier: number,
    provider: string,
    payload: Record<string, unknown>,
  ) {
    await this.kycRecords.save(
      this.kycRecords.create({
        userId,
        tier,
        provider,
        status: KycStatus.VERIFIED,
        payload,
        verifiedAt: new Date(),
      }),
    );
    const user = await this.users.findOne({ where: { id: userId } });
    if (user && user.kycTier < tier) {
      user.kycTier = tier;
      await this.users.save(user);
    }
    // A higher tier raises the balance cap: release anything held back by the old one.
    await this.balanceCaps
      ?.reconcile(userId)
      .catch((e) => this.logger.warn(`Balance cap reconcile failed: ${String(e)}`));
  }

  /**
   * Tier 1: proves the user's name and date of birth match their BVN record and
   * that their live selfie matches the BVN photo. The BVN is never returned or
   * logged; it is stored encrypted, with a keyed hash so one BVN cannot verify
   * several accounts.
   */
  async verifyBvn(userId: string, dto: VerifyBvnDto): Promise<UserKycResponse> {
    const { verifier, key } = this.requireReady();
    this.assertAdult(dto.dateOfBirth);

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (await this.identities.findOne({ where: { userId } })) {
      throw new ConflictException('Your identity is already verified');
    }
    await this.assertAttemptsLeft(userId, BVN_PROVIDER);
    const selfie = this.decodeSelfie(dto.selfie);

    const last4 = dto.bvn.slice(-4);
    const bvnHash = hmacSha256Hex(key.toString('base64'), `kyc-bvn:${dto.bvn}`);
    if (await this.identities.findOne({ where: { bvnHash } })) {
      this.logger.warn(
        `BVN ending ${last4} is already verified on another account (user ${userId})`,
      );
      return this.rejectAttempt(userId, BVN_PROVIDER, 'bvn_in_use', { bvnLast4: last4 });
    }

    // A photo of a photo would fool a face match, so the selfie must be a live person first.
    if (!(await verifier.isLive(selfie))) {
      return this.rejectAttempt(userId, BVN_PROVIDER, 'not_live', { bvnLast4: last4 });
    }
    const matched = await verifier.verifyBvn({
      bvn: dto.bvn,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      dateOfBirth: dto.dateOfBirth,
      selfie,
    });
    if (!matched) return this.rejectAttempt(userId, BVN_PROVIDER, 'no_match', { bvnLast4: last4 });

    try {
      await this.identities.save(
        this.identities.create({
          userId,
          bvnHash,
          bvnEncrypted: encryptEmbedding(dto.bvn, key, userId),
          bvnLast4: last4,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          dateOfBirth: dto.dateOfBirth,
        }),
      );
    } catch (error) {
      // Unique-index race: the same BVN or user verified concurrently.
      if ((error as { code?: string }).code === '23505') {
        return this.rejectAttempt(userId, BVN_PROVIDER, 'bvn_in_use', { bvnLast4: last4 });
      }
      throw error;
    }
    await this.finishTier(userId, 1, BVN_PROVIDER, { bvnLast4: last4, method: verifier.name });
    return this.getUserKycStatus(userId);
  }

  /**
   * Tier 2: the NIN matches the BVN identity, the government ID is genuine and
   * belongs to the same person, and the live selfie matches the ID photo.
   */
  async verifyNinAndId(userId: string, dto: VerifyTier2Dto): Promise<UserKycResponse> {
    const { verifier, key } = this.requireReady();
    const identity = await this.identities.findOne({ where: { userId } });
    if (!identity) throw new BadRequestException('Verify your BVN (tier 1) first');
    if (identity.ninHash) throw new ConflictException('Your NIN is already verified');
    await this.assertAttemptsLeft(userId, NIN_PROVIDER);

    const front = await this.documents.loadOwned(userId, dto.idFrontDocumentId, ['id_front']);
    const back = dto.idBackDocumentId
      ? await this.documents.loadOwned(userId, dto.idBackDocumentId, ['id_back'])
      : undefined;
    const selfie = this.decodeSelfie(dto.selfie);

    const last4 = dto.nin.slice(-4);
    const ninHash = hmacSha256Hex(key.toString('base64'), `kyc-nin:${dto.nin}`);
    if (await this.identities.findOne({ where: { ninHash } })) {
      this.logger.warn(
        `NIN ending ${last4} is already verified on another account (user ${userId})`,
      );
      return this.rejectAttempt(userId, NIN_PROVIDER, 'nin_in_use', { ninLast4: last4 });
    }

    if (!(await verifier.isLive(selfie)))
      return this.rejectAttempt(userId, NIN_PROVIDER, 'not_live');
    const ninOk = await verifier.verifyNin({
      nin: dto.nin,
      firstName: identity.firstName,
      lastName: identity.lastName,
      dateOfBirth: identity.dateOfBirth,
    });
    if (!ninOk)
      return this.rejectAttempt(userId, NIN_PROVIDER, 'nin_no_match', { ninLast4: last4 });

    const doc = await verifier.readIdDocument(front.bytes, back?.bytes);
    const sameName = nameMatches(
      `${doc.firstName} ${doc.lastName}`,
      identity.firstName,
      identity.lastName,
    );
    const sameBirth = !doc.dateOfBirth || doc.dateOfBirth === identity.dateOfBirth;
    if (!doc.approved || !sameName || !sameBirth || !doc.portrait) {
      return this.rejectAttempt(userId, NIN_PROVIDER, 'id_not_accepted');
    }
    if ((await verifier.faceMatchScore(selfie, doc.portrait)) < this.minFaceMatch()) {
      return this.rejectAttempt(userId, NIN_PROVIDER, 'face_mismatch');
    }

    try {
      identity.ninHash = ninHash;
      identity.ninEncrypted = encryptEmbedding(dto.nin, key, userId);
      identity.ninLast4 = last4;
      await this.identities.save(identity);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return this.rejectAttempt(userId, NIN_PROVIDER, 'nin_in_use', { ninLast4: last4 });
      }
      throw error;
    }
    await this.finishTier(userId, 2, NIN_PROVIDER, { ninLast4: last4, method: verifier.name });
    return this.getUserKycStatus(userId);
  }

  /** Tier 3: a recent utility bill or bank statement in this person's name at the stated address. */
  async verifyAddress(userId: string, dto: VerifyTier3Dto): Promise<UserKycResponse> {
    const { verifier, key } = this.requireReady();
    const identity = await this.identities.findOne({ where: { userId } });
    if (!identity?.ninHash) throw new BadRequestException('Verify your NIN and ID (tier 2) first');
    if (identity.addressEncrypted) throw new ConflictException('Your address is already verified');
    await this.assertAttemptsLeft(userId, ADDRESS_PROVIDER);

    const proof = await this.documents.loadOwned(userId, dto.proofDocumentId, ['proof_of_address']);
    const approved = await verifier.verifyProofOfAddress({
      document: proof.bytes,
      mime: proof.mime,
      address: dto.address.trim(),
      firstName: identity.firstName,
      lastName: identity.lastName,
    });
    if (!approved) return this.rejectAttempt(userId, ADDRESS_PROVIDER, 'address_not_accepted');

    identity.addressEncrypted = encryptEmbedding(dto.address.trim(), key, userId);
    await this.identities.save(identity);
    await this.finishTier(userId, 3, ADDRESS_PROVIDER, { method: verifier.name });
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
      bvnAvailable: this.available(),
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
