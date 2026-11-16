import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

const AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,2})?$/;
const HANDLE_PATTERN = /^[a-zA-Z0-9_]{3,60}$/;

export class OnboardMerchantDto {
  @IsString()
  @Length(2, 160)
  businessName: string;

  @IsString()
  @Matches(HANDLE_PATTERN, { message: 'handle must be 3-60 letters, numbers or underscores' })
  handle: string;

  @IsOptional()
  @IsString()
  @Length(2, 16)
  settlementBankCode?: string;

  @IsOptional()
  @IsString()
  @Length(6, 32)
  settlementAccountNumber?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  settlementAccountName?: string;
}

export class CreateOrderDto {
  @IsString()
  @Matches(AMOUNT_PATTERN, { message: 'amount must be a positive decimal with up to 2 places' })
  amount: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  expiresInSeconds?: number;
}

export class CreateSettlementDraftDto {
  @IsOptional()
  @IsString()
  @Matches(AMOUNT_PATTERN, { message: 'amount must be a positive decimal with up to 2 places' })
  amount?: string;

  @IsUUID()
  deviceId: string;
}

export class SubmitSettlementDto {
  @IsString()
  @Length(1, 512)
  signature: string;
}

export class VerifyKybDto {
  @IsIn(['verified', 'rejected'])
  status: 'verified' | 'rejected';
}
