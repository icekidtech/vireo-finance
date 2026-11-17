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

  /** Paga bank id, as returned by GET /transfers/banks. */
  @IsOptional()
  @IsUUID()
  settlementBankCode?: string;

  /** The account holder's name is never accepted from the client: the server resolves it. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'settlementAccountNumber must be a 10-digit NUBAN' })
  settlementAccountNumber?: string;
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

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  businessName?: string;

  /** Bank details change together or not at all, so a payout never mixes two accounts. */
  /** Paga bank id, as returned by GET /transfers/banks. */
  @IsOptional()
  @IsUUID()
  settlementBankCode?: string;

  /** The account holder's name is never accepted from the client: the server resolves it. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'settlementAccountNumber must be a 10-digit NUBAN' })
  settlementAccountNumber?: string;
}
