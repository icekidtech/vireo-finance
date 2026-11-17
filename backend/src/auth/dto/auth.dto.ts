import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { DevicePlatform, SignatureAlgorithm } from '../../common/enums';

const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;
const HANDLE_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export class RegisterDto {
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone must be 10-15 digits, optional leading +' })
  phone: string;

  @IsString()
  @Length(2, 120)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(HANDLE_PATTERN, { message: 'handle must be 3-20 letters, numbers or underscores' })
  handle?: string;
}

export class OtpRequestDto {
  @IsString()
  @Matches(PHONE_PATTERN)
  phone: string;
}

export class OtpVerifyDto {
  @IsString()
  @Matches(PHONE_PATTERN)
  phone: string;

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
}
