import { IsNotEmpty, IsString, IsEnum, IsOptional, IsNumber, Min } from 'class-validator';
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
  biometricSample: string;

  /**
   * Optional: additional biometric sample for multi-factor (e.g., face + voice).
   */
  @IsOptional()
  @IsString()
  secondBiometricSample?: string;

  /**
   * Optional: second biometric type if using multi-factor.
   */
  @IsOptional()
  @IsEnum(BiometricType)
  secondBiometricType?: BiometricType;

  /**
   * Optional: step-up challenge response (PIN or phrase) if required.
   */
  @IsOptional()
  @IsString()
  stepUpResponse?: string;

  /**
   * Merchant metadata: terminal ID, location, etc.
   */
  @IsOptional()
  metadata?: Record<string, unknown>;
}
