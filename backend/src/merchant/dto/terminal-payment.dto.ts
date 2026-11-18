import { IsNotEmpty, IsString, IsEnum, IsOptional, IsObject, MaxLength } from 'class-validator';
import { BiometricType } from '../../biometrics/biometric-enrollment.entity';

export class CreateTerminalPaymentDto {
  /**
   * Merchant order reference (the payment request).
   */
  @IsString()
  @IsNotEmpty()
  orderReference: string;

  /**
   * Customer identifier (phone number or handle).
   */
  @IsString()
  @IsNotEmpty()
  customerIdentifier: string;

  /**
   * Biometric type being used (face or voice).
   */
  @IsEnum(BiometricType)
  biometricType: BiometricType;

  /**
   * Base64-encoded biometric sample.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(7_000_000)
  biometricSample: string;

  /**
   * Optional: additional biometric sample for multi-factor (e.g., face + voice).
   */
  @IsOptional()
  @IsString()
  @MaxLength(7_000_000)
  secondBiometricSample?: string;

  /**
   * Optional: second biometric type if using multi-factor.
   */
  @IsOptional()
  @IsEnum(BiometricType)
  secondBiometricType?: BiometricType;

  /**
   * Merchant metadata: terminal ID, location, etc.
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
