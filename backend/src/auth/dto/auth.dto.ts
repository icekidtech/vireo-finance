import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import { DevicePlatform, SignatureAlgorithm } from '../../common/enums';

const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;
const HANDLE_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export class RegisterDto {
  /** Email + password sign-in. Optional: a phone number alone signs in with a one-time code. */
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsString()
  @Length(2, 120)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone must be 10-15 digits, optional leading +' })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(HANDLE_PATTERN, { message: 'handle must be 3-20 letters, numbers or underscores' })
  handle?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dateOfBirth must be a valid ISO date string (YYYY-MM-DD)' })
  dateOfBirth?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class OtpRequestDto {
  @IsString()
  @Matches(PHONE_PATTERN)
  phone: string;
}

export class EmailOtpRequestDto {
  @IsEmail()
  email: string;
}

export class OtpVerifyDto {
  @IsString()
  @Matches(PHONE_PATTERN)
  phone: string;

  @IsString()
  @Length(6, 6)
  code: string;
}

export class EmailOtpVerifyDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;
}

export class RegisterDeviceDto {
  @IsString()
  publicKey: string;

  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @IsOptional()
  @IsEnum(SignatureAlgorithm)
  algorithm?: SignatureAlgorithm;

  /** Apple App Attest / Google Play Integrity token, verified when present. */
  @IsOptional()
  @IsString()
  attestationToken?: string;
}
