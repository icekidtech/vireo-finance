import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { KycStatus } from '../common/enums';
import { formatMinor } from '../database/money';
import { PagaService } from '../paga/paga.service';
import { User } from '../users/user.entity';
import { KycRecord } from './kyc-record.entity';
import { SubmitIdentificationDto } from './dto/kyc.dto';
import type { AppConfig } from '../config/configuration';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly riskConfig: AppConfig['risk'];

  constructor(
    @InjectRepository(KycRecord) private readonly kycRecords: Repository<KycRecord>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly paga: PagaService,
    config: ConfigService,
  ) {
    this.riskConfig = config.get<AppConfig['risk']>('risk')!;
  }

  async submitIdentification(userId: string, dto: SubmitIdentificationDto) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const targetTier = dto.targetTier ?? (dto.idType === 'PASSPORT' || dto.idType === 'NATIONAL_ID' ? 2 : 1);
    const reference = `kyc_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

    const record = await this.kycRecords.save(
      this.kycRecords.create({
        userId,
        tier: targetTier,
        provider: 'paga',
        status: KycStatus.PENDING,
        payload: {
          reference,
          idType: dto.idType,
          idNumber: dto.idNumber,
          expirationDate: dto.expirationDate ?? null,
        },
      }),
    );

    let pagaResult;
    try {
      pagaResult = await this.paga.registerCustomerIdentification({
        referenceNumber: reference,
        customerPhoneNumber: user.phone,
        customerIdType: dto.idType,
        customerIdNumber: dto.idNumber,
        customerIdExpirationDate: dto.expirationDate,
        customerIdPhoto: dto.idPhoto,
      });
    } catch (error) {
      this.logger.error(`Paga identification upload error for user ${userId}: ${String(error)}`);
      record.status = KycStatus.REJECTED;
      record.payload = { ...record.payload, error: String(error) };
      await this.kycRecords.save(record);
      throw new BadRequestException(`Paga identification upload failed: ${String(error)}`);
    }

    const isVerified = pagaResult.responseCode === '0';
    if (isVerified) {
      record.status = KycStatus.VERIFIED;
      record.verifiedAt = new Date();
      record.payload = { ...record.payload, pagaMessage: pagaResult.message };
      await this.kycRecords.save(record);

      if (user.kycTier < targetTier) {
        user.kycTier = targetTier;
        await this.users.save(user);
        this.logger.log(`User ${userId} upgraded to KYC Tier ${targetTier}`);
      }
    } else {
      record.payload = {
        ...record.payload,
        pagaResponseCode: pagaResult.responseCode,
        pagaMessage: pagaResult.message,
      };
      await this.kycRecords.save(record);
    }

    return {
      kycRecord: presentKycRecord(record),
      userTier: user.kycTier,
      dailyLimit: formatMinor(this.getDailyLimitForTier(user.kycTier)),
      status: record.status,
      message: isVerified
        ? `Identification verified successfully. Your account has been upgraded to Tier ${user.kycTier}.`
        : `Identification submitted to Paga for compliance review (Reference: ${reference}).`,
    };
  }

  async getKycStatus(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const latest = await this.kycRecords.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const dailyLimit = this.getDailyLimitForTier(user.kycTier);

    return {
      userId: user.id,
      kycTier: user.kycTier,
      dailyLimit: formatMinor(dailyLimit),
      currency: 'NGN',
      latestVerification: latest ? presentKycRecord(latest) : null,
      tierLimits: {
        tier0: formatMinor(this.riskConfig.tierDailyLimits[0] ?? 0n),
        tier1: formatMinor(this.riskConfig.tierDailyLimits[1] ?? 0n),
        tier2: formatMinor(this.riskConfig.tierDailyLimits[2] ?? 0n),
      },
    };
  }

  async listKycHistory(userId: string) {
    const rows = await this.kycRecords.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return rows.map(presentKycRecord);
  }

  private getDailyLimitForTier(tier: number): bigint {
    return this.riskConfig.tierDailyLimits[tier] ?? this.riskConfig.tierDailyLimits[0] ?? 0n;
  }
}

export function presentKycRecord(record: KycRecord) {
  return {
    id: record.id,
    tier: record.tier,
    provider: record.provider,
    status: record.status,
    verifiedAt: record.verifiedAt,
    createdAt: record.createdAt,
  };
}
