import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { BANK_ID_MESSAGE, BANK_ID_PATTERN } from '../../common/bank-id';
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
  /** A bank id from the bank list (36 chars), or a sort code. */
  @IsString()
  @Length(2, 40)
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

  /** How the user confirmed on their phone. `pin` needs the PIN below. Defaults to biometric. */
  @IsOptional()
  @IsIn(['biometric', 'pin'])
  approval?: 'biometric' | 'pin';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'pin must be 4 digits' })
  pin?: string;
}

export class BankLookupDto {
  /** Paga bank id, as returned by GET /transfers/banks. */
  @IsString()
  @Matches(BANK_ID_PATTERN, { message: BANK_ID_MESSAGE })
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
