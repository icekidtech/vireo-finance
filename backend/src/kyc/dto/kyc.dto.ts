import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PagaIdType } from '../../paga/paga.types';

export class SubmitIdentificationDto {
  @IsEnum(['PASSPORT', 'NATIONAL_ID', 'VOTERS_CARD', 'DRIVER_LICENSE'], {
    message: 'idType must be PASSPORT, NATIONAL_ID, VOTERS_CARD, or DRIVER_LICENSE',
  })
  idType: PagaIdType;

  @IsString()
  @Length(4, 60, { message: 'idNumber must be between 4 and 60 characters' })
  idNumber: string;

  @IsOptional()
  @IsDateString({}, { message: 'expirationDate must be an ISO date (YYYY-MM-DD)' })
  expirationDate?: string;

  @IsOptional()
  @IsString({ message: 'idPhoto must be a base64 string or image reference' })
  idPhoto?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  targetTier?: number;
}
