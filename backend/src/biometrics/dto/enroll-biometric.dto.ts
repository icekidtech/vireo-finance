import { IsEnum, IsNotEmpty, IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { BiometricType } from '../biometric-enrollment.entity';

export class EnrollBiometricDto {
  @IsEnum(BiometricType)
  type: BiometricType;

  /**
   * Base64-encoded biometric sample (image for face, audio for voice).
   * The backend will process this into an embedding.
   */
  @IsString()
  @IsNotEmpty()
  sampleBase64: string;

  /**
   * Consent ID that the user granted before this enrollment.
   */
  @IsString()
  @IsNotEmpty()
  consentId: string;

  /**
   * Optional metadata from the capture: device info, capture timestamp, etc.
   */
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class VerifyBiometricDto {
  @IsEnum(BiometricType)
  type: BiometricType;

  /**
   * Identifier for the user (phone number or handle).
   */
  @IsString()
  @IsNotEmpty()
  identifier: string;

  /**
   * Base64-encoded biometric sample for verification.
   */
  @IsString()
  @IsNotEmpty()
  sampleBase64: string;

  /**
   * Optional: amount for payment context (affects step-up thresholds).
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountMinor?: number;

  /**
   * Context metadata: merchant ID, location, etc.
   */
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class GrantConsentDto {
  /**
   * Version of the consent terms being accepted.
   */
  @IsString()
  @IsNotEmpty()
  consentVersion: string;

  /**
   * Optional metadata: IP address, user agent, location.
   */
  @IsOptional()
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
    location?: string;
  };
}

export class RevokeBiometricDto {
  @IsEnum(BiometricType)
  type: BiometricType;

  /**
   * Optional reason for revocation.
   */
  @IsOptional()
  @IsString()
  reason?: string;
}
