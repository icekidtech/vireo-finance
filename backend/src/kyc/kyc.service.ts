import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycStatus, UserStatus } from '../common/enums';
import { User } from '../users/user.entity';
import { KycRecord } from './kyc-record.entity';
import { KycRecordResponse, SubmitKycDto, UserKycResponse, VerifyKycDto } from './kyc.dto';

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(KycRecord) private readonly kycRecords: Repository<KycRecord>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

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
    return {
      userId,
      kycTier: user.kycTier,
      status: record?.status ?? KycStatus.PENDING,
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
    if (!Number.isFinite(tier) || tier < 0 || tier > 2) {
      throw new BadRequestException('tier must be 0, 1, or 2');
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
