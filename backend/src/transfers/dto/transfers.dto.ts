import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { TransferType } from '../../common/enums';

const AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,2})?$/;

export class CreateTransferDraftDto {
  @IsIn([TransferType.INTERNAL, TransferType.BANK, TransferType.MERCHANT])
  type: TransferType;

  @IsString()
  @Matches(AMOUNT_PATTERN, { message: 'amount must be a positive decimal with up to 2 places' })
  amount: string;

  @IsString()
  @Length(8, 120)
  idempotencyKey: string;

  @IsUUID()
  deviceId: string;

  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsString()
  @Length(10, 15)
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  @Length(3, 20)
  recipientHandle?: string;

  @IsOptional()
  @IsString()
  @Length(2, 16)
  bankCode?: string;

  @IsOptional()
  @IsString()
  @Length(6, 32)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  orderReference?: string;
}

export class SubmitTransferDto {
  @IsString()
  signature: string;
}

export class BankLookupDto {
  /** Paga bank uuid, as returned by GET /transfers/banks. */
  @IsUUID()
  bankCode: string;

  @IsString()
  @Matches(/^\d{10}$/, { message: 'accountNumber must be a 10-digit NUBAN' })
  accountNumber: string;

  /** Optional: only verifies the account; defaults to a nominal amount. */
  @IsOptional()
  @IsString()
  @Matches(AMOUNT_PATTERN, { message: 'amount must be a positive decimal with up to 2 places' })
  amount?: string;
}
