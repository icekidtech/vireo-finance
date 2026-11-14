import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { KycStatus } from '../common/enums';

const KYC_PROVIDER_PATTERN = /^[a-zA-Z0-9_-]{2,40}$/;

export class SubmitKycDto {
  @IsString()
  @Matches(KYC_PROVIDER_PATTERN, {
    message: 'provider must be 2-40 letters, numbers, underscores or hyphens',
  })
  provider: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  payload?: string;
}

export class VerifyKycDto {
  @IsEnum(KycStatus)
  status: KycStatus;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  tier?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export class KycRecordResponse {
  id: string;
  userId: string;
  tier: number;
  provider: string;
  status: KycStatus;
  payload: Record<string, unknown> | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

export class UserKycResponse {
  userId: string;
  kycTier: number;
  status: KycStatus;
}
