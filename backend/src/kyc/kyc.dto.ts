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

const NAME_PATTERN = /^[\p{L}][\p{L}'’ .-]{0,59}$/u;

export class VerifyBvnDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: 'bvn must be 11 digits' })
  bvn: string;

  @IsString()
  @Matches(NAME_PATTERN, { message: 'firstName contains invalid characters' })
  firstName: string;

  @IsString()
  @Matches(NAME_PATTERN, { message: 'lastName contains invalid characters' })
  lastName: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth: string;
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
  /** Whether automatic BVN verification is configured on this server. */
  bvnAvailable: boolean;
  /** Last four digits of the verified BVN, if any. */
  bvnLast4: string | null;
}
